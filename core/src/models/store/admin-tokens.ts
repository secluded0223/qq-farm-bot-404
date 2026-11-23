export {};
/**
 * 管理端登录令牌的持久化存储。
 *
 * 原先令牌只是一个内存 Set，服务一重启（改代码、重启面板）所有会话就失效，
 * 每次更新都要重新登录。这里把令牌**哈希**后落盘，重启后仍然认可旧令牌。
 *
 * 只存 sha256 摘要，不落明文：即便 data 目录被看到，也无法直接冒用令牌。
 * 登出、修改密码、重置配置等操作会同步删除对应记录。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const { ensureDataDir, getDataFile } = require('../../config/runtime-paths');

const FILE_NAME = 'admin-tokens.json';
/** 记录上限，避免长期使用后文件无限增长。 */
const MAX_RECORDS = 50;
/** 令牌有效期：过期后需重新登录，避免旧令牌永久有效。 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AdminTokenRecord {
    hash: string;
    createdAt: number;
    lastUsedAt?: number;
}

let cache: AdminTokenRecord[] | null = null;

function filePath(): string {
    return getDataFile(FILE_NAME);
}

function hashToken(token: unknown): string {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function load(): AdminTokenRecord[] {
    if (cache) return cache;
    try {
        const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.tokens) ? raw.tokens : []);
        const now = Date.now();
        cache = list
            .filter((item: any) => item && typeof item.hash === 'string' && item.hash)
            .map((item: any) => ({
                hash: String(item.hash),
                createdAt: Number(item.createdAt) || now,
            }))
            // 过期令牌直接丢弃，等同重新登录。
            .filter(item => now - item.createdAt < TTL_MS);
    } catch {
        // 文件不存在或损坏都按「没有历史令牌」处理，不影响首次启动。
        cache = [];
    }
    return cache!;
}

function persist(): void {
    try {
        ensureDataDir();
        const records = load().slice(-MAX_RECORDS);
        cache = records;
        fs.writeFileSync(filePath(), JSON.stringify({ version: 1, tokens: records }, null, 2), 'utf8');
    } catch {
        // 落盘失败不影响本次进程内的鉴权，只是重启后需要重新登录。
    }
}

const tokenStore = {
    has(token: unknown): boolean {
        if (!token) return false;
        const hash = hashToken(token);
        const now = Date.now();
        return load().some(record => record.hash === hash && now - record.createdAt < TTL_MS);
    },

    add(token: unknown): void {
        if (!token) return;
        const hash = hashToken(token);
        const list = load();
        list.push({ hash, createdAt: Date.now() });
        persist();
    },

    delete(token: unknown): void {
        if (!token) return;
        const hash = hashToken(token);
        const list = load();
        const next = list.filter(record => record.hash !== hash);
        if (next.length !== list.length) {
            cache = next;
            persist();
        }
    },

    clear(): void {
        cache = [];
        persist();
    },

    count(): number {
        return load().length;
    },
};

module.exports = { tokenStore, hashToken, ADMIN_TOKEN_FILE: FILE_NAME };