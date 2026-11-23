export {};
export interface Account {
  id: string;
  name: string;
  code: string;
  platform: string;
  uin: string;
  qq: string;
  avatar: string;
  nick?: string;
  /** 微信账号的 openid，扫码时由登录服务返回，续期要用它做标识。 */
  wxid?: string;
  /** 微信滚动刷新凭证：续期成功后旧值立即失效，必须随新值一起落盘。 */
  refreshtoken?: string;
  accesstoken?: string;
  /** 长效登录凭证，未过期时可直接换游戏 Code，不必消耗滚动的 refreshtoken。 */
  loginBuffer?: string;
  expires_in?: number;
  expires_at?: number;
  wxCredentialRefreshedAt?: number;
  wxCredentialLastAttemptAt?: number;
  wxCredentialRefreshError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccountsData {
  accounts: Account[];
  nextId: number;
}
