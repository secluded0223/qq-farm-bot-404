export {};
/**
 * 一键获取微信小程序 Code。
 *
 * 微信小程序的 wx.login Code 由微信客户端内部生成，程序侧无法直接调用，
 * 只能在它连接游戏网关时截获。这里用 mitmdump 做本地中间人：
 *
 * 1. 启动 mitmdump（自定义 addon），把系统代理临时指向它；
 * 2. 结束 WeChatAppEx 进程，让用户重新打开农场小程序；
 * 3. 小程序会带着 code 连接 gate-obt.nqf.qq.com，addon 记录 code 后
 *    直接返回 502 阻断握手，保证这个 code 不被服务端消费；
 * 4. 拿到 code 后立即还原系统代理并退出 mitmdump。
 *
 * Code 一次性有效，所以整个流程必须在用户点击后几秒内完成。
 */

const fs = require('node:fs');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { ensureDataDir, getDataFile } = require('../config/runtime-paths');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('wx-capture');

const PROXY_PORT = Number(process.env.WX_CAPTURE_PROXY_PORT) || 8899;
const GATE_HOST = 'gate-obt.nqf.qq.com';
const CAPTURE_TIMEOUT_MS = 150_000;
const ADDON_FILE = 'wx-code-capture-addon.py';
const LOG_FILE = 'wx-code-capture.jsonl';

const ADDON_SOURCE = [
    'import json',
    'import os',
    'import time',
    '',
    'from mitmproxy import http',
    '',
    'LOG_PATH = os.environ.get("WX_CAPTURE_LOG", "")',
    `GATE_HOST = "${GATE_HOST}"`,
    '',
    'def request(flow: http.HTTPFlow) -> None:',
    '    if flow.request.pretty_host != GATE_HOST:',
    '        return',
    '    code = flow.request.query.get("code", "")',
    '    if not code:',
    '        return',
    '    if LOG_PATH:',
    '        try:',
    '            with open(LOG_PATH, "a", encoding="utf-8") as handle:',
    '                handle.write(json.dumps({"t": time.time(), "code": code}) + "\\n")',
    '        except Exception:',
    '            pass',
    '    # 阻断握手，避免 code 被小程序自身消费。',
    '    flow.response = http.Response.make(502, b"blocked by capture", {"content-type": "text/plain"})',
    '',
].join('\n');

export type CapturePhase = 'idle' | 'running' | 'success' | 'error';

export interface CaptureStatus {
    phase: CapturePhase;
    code: string;
    message: string;
    startedAt: number;
    finishedAt: number;
}

const state: CaptureStatus = {
    phase: 'idle',
    code: '',
    message: '',
    startedAt: 0,
    finishedAt: 0,
};

let proxySnapshot: { enable: number; server: string } | null = null;
let mitmProcess: any = null;
let mitmStderr = '';
let pollTimer: any = null;
let timeoutTimer: any = null;
let starting = false;

function runPowerShell(script: string): string {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).trim();
}

function readProxySnapshot(): { enable: number; server: string } {
    const script = [
        "$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
        '$item = Get-ItemProperty -Path $p',
        '@{ enable = [int]$item.ProxyEnable; server = [string]$item.ProxyServer } | ConvertTo-Json -Compress',
    ].join('\n');
    try {
        const parsed = JSON.parse(runPowerShell(script));
        return { enable: Number(parsed.enable) || 0, server: String(parsed.server || '') };
    } catch (error: any) {
        log.warn('读取系统代理失败', { error: error?.message });
        return { enable: 0, server: '' };
    }
}

function applySystemProxy(enable: number, server: string): void {
    const script = [
        "$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
        `Set-ItemProperty -Path $p -Name ProxyEnable -Value ${enable} -Type DWord`,
        `Set-ItemProperty -Path $p -Name ProxyServer -Value '${server.replace(/'/g, "''")}' -Type String`,
        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class IdleWinInet{[DllImport(\"wininet.dll\",SetLastError=true)]public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l);}'",
        '[IdleWinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null',
        '[IdleWinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null',
    ].join('\n');
    runPowerShell(script);
}

function restoreSystemProxy(): void {
    if (!proxySnapshot) return;
    try {
        applySystemProxy(proxySnapshot.enable, proxySnapshot.server);
    } catch (error: any) {
        log.warn('还原系统代理失败', { error: error?.message });
    }
    proxySnapshot = null;
}

function resolveMitmdump(): string {
    const candidates = [
        process.env.MITMDUMP_BIN,
        'mitmdump',
        'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\mitmdump.exe',
    ].filter(Boolean) as string[];
    for (const candidate of candidates) {
        try {
            if (candidate === 'mitmdump' || fs.existsSync(candidate)) {
                execFileSync(candidate, ['--version'], { timeout: 15_000, windowsHide: true, stdio: 'ignore' });
                return candidate;
            }
        } catch {
            // 继续尝试下一个候选路径
        }
    }
    throw new Error('未找到 mitmdump，请先安装 mitmproxy（pip install mitmproxy），或用 MITMDUMP_BIN 指定路径');
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        const attempt = () => {
            const socket = net.connect({ host: '127.0.0.1', port });
            socket.setTimeout(500);
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            const retry = () => {
                socket.destroy();
                if (Date.now() >= deadline) resolve(false);
                else setTimeout(attempt, 200);
            };
            socket.once('error', retry);
            socket.once('timeout', retry);
        };
        attempt();
    });
}

function stopMitm(): void {
    if (!mitmProcess) return;
    const pid = mitmProcess.pid;
    mitmProcess = null;
    try {
        if (pid) execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch {
        // 进程可能已退出
    }
}

function stopTimers(): void {
    if (pollTimer) clearInterval(pollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    pollTimer = null;
    timeoutTimer = null;
}

function cleanup(): void {
    stopTimers();
    stopMitm();
    restoreSystemProxy();
}

function restartMiniProgram(): void {
    try {
        execFileSync('taskkill.exe', ['/IM', 'WeChatAppEx.exe', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch {
        // 小程序本来就没在运行
    }
}

function readCapturedCode(logPath: string): string {
    let raw = '';
    try {
        raw = fs.readFileSync(logPath, 'utf8');
    } catch {
        return '';
    }
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
        try {
            const code = String(JSON.parse(line)?.code || '').trim();
            if (code) return code;
        } catch {
            // 忽略半行/损坏行
        }
    }
    return '';
}

function getStatus(): CaptureStatus {
    return { ...state };
}

async function start(): Promise<CaptureStatus> {
    if (state.phase === 'running' || starting) return getStatus();
    // 依赖系统代理注册表与 WeChatAppEx 进程，只在 Windows 上有意义。
    if (process.platform !== 'win32') {
        state.phase = 'error';
        state.message = '一键抓 Code 仅支持 Windows（需要修改系统代理并重启微信小程序进程）';
        state.finishedAt = Date.now();
        return getStatus();
    }
    starting = true;
    cleanup();
    mitmStderr = '';
    state.phase = 'running';
    state.code = '';
    state.message = '正在准备抓包…';
    state.startedAt = Date.now();
    state.finishedAt = 0;
    try {
        const dataDir = ensureDataDir();
        const addonPath = getDataFile(ADDON_FILE);
        const logPath = getDataFile(LOG_FILE);
        fs.writeFileSync(addonPath, ADDON_SOURCE, 'utf8');
        fs.writeFileSync(logPath, '', 'utf8');
        const mitmdump = resolveMitmdump();
        mitmProcess = spawn(mitmdump, ['-s', addonPath, '-p', String(PROXY_PORT)], {
            env: { ...process.env, WX_CAPTURE_LOG: logPath },
            windowsHide: true,
        });
        mitmProcess.stderr?.on?.('data', (chunk: any) => {
            mitmStderr = `${mitmStderr}${String(chunk)}`.slice(-2000);
        });
        mitmProcess.on('error', (error: any) => {
            mitmStderr = `${mitmStderr}\n${error?.message || error}`;
        });
        const listening = await waitForPort(PROXY_PORT, 8_000);
        if (!listening) {
            throw new Error(`抓包代理端口 ${PROXY_PORT} 启动失败${mitmStderr ? `：${mitmStderr.trim().split('\n').pop()}` : ''}`);
        }
        proxySnapshot = readProxySnapshot();
        applySystemProxy(1, `127.0.0.1:${PROXY_PORT}`);
        restartMiniProgram();
        state.message = '已重启小程序，请在微信中重新打开 QQ 农场';
        log.info('抓包已启动', { port: PROXY_PORT, dataDir });
        pollTimer = setInterval(() => {
            const code = readCapturedCode(logPath);
            if (!code) return;
            state.phase = 'success';
            state.code = code;
            state.message = '已获取到微信 Code，正在登录…';
            state.finishedAt = Date.now();
            cleanup();
            log.info('已获取微信 Code', { codeLength: code.length });
        }, 300);
        timeoutTimer = setTimeout(() => {
            if (state.phase !== 'running') return;
            state.phase = 'error';
            state.message = '等待超时，请重新点击获取';
            state.finishedAt = Date.now();
            cleanup();
            log.warn('抓包超时');
        }, CAPTURE_TIMEOUT_MS);
        timeoutTimer.unref?.();
        return getStatus();
    } catch (error: any) {
        state.phase = 'error';
        state.message = String(error?.message || '启动抓包失败');
        state.finishedAt = Date.now();
        cleanup();
        log.warn('抓包启动失败', { error: state.message });
        return getStatus();
    } finally {
        starting = false;
    }
}

function cancel(): CaptureStatus {
    cleanup();
    state.phase = 'idle';
    state.code = '';
    state.message = '';
    state.finishedAt = Date.now();
    return getStatus();
}

module.exports = {
    PROXY_PORT,
    getStatus,
    start,
    cancel,
};