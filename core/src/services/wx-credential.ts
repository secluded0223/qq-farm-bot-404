export {};
/**
 * 微信授权续期。
 *
 * 续期链路：refreshtoken → 新 accessToken + loginBuffer → 新游戏登录 Code。
 * 游戏 Code 是一次性的，所以每次续期都要重新签发并写回账号，供下一次启动使用；
 * refreshtoken 是滚动凭证，刷新成功后旧值立即失效，失败也必须把新值落盘。
 */

const store = require('../models/store');
const { WxLoginService } = require('./wx-login/service');
const { getNativeWxLoginCode } = require('./wx-login/native-protocol');

const TARGET_APP_ID = 'wx5306c5978fdb76e4';
const wxLogin = new WxLoginService();

/** 扫码时拿到的凭证先暂存，等账号真正入库时再挂上去（首次添加账号时账号还不存在）。 */
const PENDING_SCAN_TTL_MS = 30 * 60 * 1000;

export interface WxScanCredential {
    openid: string;
    refreshtoken: string;
    accesstoken: string;
    loginBuffer?: string;
    expires_in?: number;
    expires_at?: number;
}

const pendingScanCredentials = new Map<string, { credential: WxScanCredential; savedAt: number }>();

function rememberScanCredential(openid: unknown, credential: WxScanCredential): void {
    const key = String(openid || '').trim();
    if (!key || !credential) return;
    const now = Date.now();
    for (const [id, entry] of pendingScanCredentials) {
        if (now - entry.savedAt > PENDING_SCAN_TTL_MS) pendingScanCredentials.delete(id);
    }
    pendingScanCredentials.set(key, { credential, savedAt: now });
}

function takeScanCredential(openid: unknown): WxScanCredential | null {
    const key = String(openid || '').trim();
    if (!key) return null;
    const entry = pendingScanCredentials.get(key);
    if (!entry) return null;
    pendingScanCredentials.delete(key);
    if (Date.now() - entry.savedAt > PENDING_SCAN_TTL_MS) return null;
    return entry.credential;
}

function hasWxCredential(account: any): boolean {
    return !!account
        && String(account.platform || '') === 'wx'
        && !!String(account.wxid || account.uin || '').trim()
        && !!String(account.refreshtoken || '').trim();
}

function getAccountById(accountId: unknown): any {
    const accounts = (store.getAccounts().accounts || []);
    return accounts.find((account: any) => String(account.id) === String(accountId)) || null;
}

function accountDisplayName(account: any, fallback: unknown): string {
    return String((account && (account.name || account.nick)) || fallback || '');
}

function issueCodeFromLoginBuffer(loginBuffer: string): Promise<string> {
    return getNativeWxLoginCode(loginBuffer, TARGET_APP_ID);
}

export interface WxCredentialResult {
    ok: boolean;
    accountId: string;
    accountName: string;
    code?: string;
    error?: string;
    expiresAt?: number;
}

/**
 * 续期单个账号的微信授权，并把新 Code 与滚动凭证写回账号。
 * 缺少 refreshtoken 的账号（旧数据或扫码时未回传）直接返回可读的失败原因。
 */
async function refreshAccountCredential(accountId: unknown): Promise<WxCredentialResult> {
    const account = getAccountById(accountId);
    const accountName = accountDisplayName(account, accountId);
    if (!account) {
        return { ok: false, accountId: String(accountId || ''), accountName, error: '账号不存在' };
    }
    if (String(account.platform || '') !== 'wx') {
        return { ok: false, accountId: String(account.id), accountName, error: '仅微信账号支持授权续期' };
    }
    if (!hasWxCredential(account)) {
        const error = '账号缺少微信刷新凭证，请重新扫码登录';
        store.addOrUpdateAccount({
            id: String(account.id),
            wxCredentialLastAttemptAt: Date.now(),
            wxCredentialRefreshError: error,
        });
        return { ok: false, accountId: String(account.id), accountName, error };
    }
    const attemptedAt = Date.now();
    try {
        const credential = await wxLogin.refreshLoginBuffer({
            openid: account.wxid || account.uin,
            refreshtoken: account.refreshtoken,
            accesstoken: account.accesstoken,
        });
        const code = await issueCodeFromLoginBuffer(credential.loginBuffer);
        if (!code) throw new Error('微信授权已续期，但未取到新的游戏登录 Code');
        store.addOrUpdateAccount({
            id: String(account.id),
            code,
            uin: credential.openid,
            refreshtoken: credential.refreshtoken,
            accesstoken: credential.accesstoken,
            loginBuffer: credential.loginBuffer,
            expires_in: credential.expires_in,
            expires_at: credential.expires_at,
            wxCredentialRefreshedAt: credential.refreshedAt,
            wxCredentialLastAttemptAt: attemptedAt,
            wxCredentialRefreshError: '',
        });
        return { ok: true, accountId: String(account.id), accountName, code, expiresAt: credential.expires_at };
    } catch (error: any) {
        // 滚动凭证可能已经更新：先落盘新 token，再报告错误，避免下一次续期用过期 token。
        const rotated = error && error.rotated ? error.rotated : null;
        const message = String((error && error.message) || '微信授权续期失败');
        store.addOrUpdateAccount({
            id: String(account.id),
            ...(rotated
                ? {
                    refreshtoken: rotated.refreshtoken,
                    accesstoken: rotated.accesstoken,
                    expires_in: rotated.expires_in,
                    expires_at: rotated.expires_at,
                    wxCredentialRefreshedAt: rotated.refreshedAt,
                }
                : {}),
            wxCredentialLastAttemptAt: attemptedAt,
            wxCredentialRefreshError: message,
        });
        return {
            ok: false,
            accountId: String(account.id),
            accountName,
            error: message,
            expiresAt: rotated ? rotated.expires_at : Number(account.expires_at) || undefined,
        };
    }
}

/**
 * 启动前获取新鲜的游戏 Code。
 *
 * loginBuffer 是长效凭证，未过期时直接用它换 Code，不消耗滚动 token；
 * 只有 loginBuffer 缺失 / 明确过期 / 被服务端拒绝且存在 refreshtoken 时，
 * 才走 refreshtoken 滚动续期后再换。
 */
async function ensureFreshGameCode(accountId: unknown): Promise<WxCredentialResult> {
    const account = getAccountById(accountId);
    const accountName = accountDisplayName(account, accountId);
    if (!account) {
        return { ok: false, accountId: String(accountId || ''), accountName, error: '账号不存在' };
    }
    if (String(account.platform || '') !== 'wx') {
        return { ok: false, accountId: String(account.id), accountName, error: '仅微信账号支持自动换码' };
    }
    const loginBuffer = String(account.loginBuffer || '').trim();
    const refreshToken = String(account.refreshtoken || '').trim();
    if (!loginBuffer && !refreshToken) {
        const error = '账号缺少微信登录凭证，请重新扫码登录';
        store.addOrUpdateAccount({
            id: String(account.id),
            wxCredentialLastAttemptAt: Date.now(),
            wxCredentialRefreshError: error,
        });
        return { ok: false, accountId: String(account.id), accountName, error };
    }
    const attemptedAt = Date.now();
    const expiresAt = Number(account.expires_at) || 0;
    const expired = expiresAt > 0 && expiresAt <= attemptedAt;
    // 1) loginBuffer 可用时直接换 Code（不触发滚动续期）。
    if (loginBuffer && (!expired || !refreshToken)) {
        try {
            const code = await issueCodeFromLoginBuffer(loginBuffer);
            if (!code) throw new Error('服务端未返回 code');
            store.addOrUpdateAccount({
                id: String(account.id),
                code,
                wxCredentialLastAttemptAt: attemptedAt,
                wxCredentialRefreshError: '',
            });
            return { ok: true, accountId: String(account.id), accountName, code, expiresAt: expiresAt || undefined };
        } catch (error: any) {
            const message = String(error?.message || '换取游戏 Code 失败');
            // 未过期却被拒（ManualAuth rejected / 服务端未返回 code）且可续期 → 落到滚动续期重试。
            if (!refreshToken || !/ManualAuth rejected|服务端未返回 code/.test(message)) {
                store.addOrUpdateAccount({
                    id: String(account.id),
                    wxCredentialLastAttemptAt: attemptedAt,
                    wxCredentialRefreshError: message,
                });
                return { ok: false, accountId: String(account.id), accountName, error: message, expiresAt: expiresAt || undefined };
            }
        }
    }
    // 2) 滚动续期：refreshtoken → 新 accessToken/loginBuffer → 新 Code。
    return refreshAccountCredential(accountId);
}

module.exports = {
    TARGET_APP_ID,
    hasWxCredential,
    issueCodeFromLoginBuffer,
    refreshAccountCredential,
    ensureFreshGameCode,
    rememberScanCredential,
    takeScanCredential,
};
