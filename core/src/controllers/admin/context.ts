import type { Application } from 'express';
import type { Server } from 'node:http';
import type { Server as SocketIOServer } from 'socket.io';
export {};

/**
 * AdminContext factory
 * Creates and holds all shared state for the admin server.
 */

export interface AdminTokenStore {
    has: (token: unknown) => boolean;
    add: (token: unknown) => void;
    delete: (token: unknown) => void;
    clear: () => void;
    count?: () => number;
}

export interface AdminContext {
    tokens: AdminTokenStore;
    app: Application | null;
    server: Server | null;
    io: SocketIOServer | null;
    provider: any;
}

function createAdminContext(dataProvider: any): AdminContext {
    // 令牌落盘：重启服务后已登录的浏览器无需重新登录。
    const { tokenStore } = require('../../models/store/admin-tokens');
    return {
        tokens: tokenStore,
        app: null,
        server: null,
        io: null,
        provider: dataProvider,
    };
}

module.exports = { createAdminContext };
