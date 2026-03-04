const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_EXPIRY_KEY = 'token_expiry';

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  stopRefreshTimer();
}

export function isAccessTokenExpired(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  return Date.now() >= Number(expiry);
}

export function getTimeUntilExpiry(): number {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return 0;
  return Math.max(0, Number(expiry) - Date.now());
}

export function startRefreshTimer(onRefresh: () => Promise<void>): void {
  stopRefreshTimer();
  const timeUntilExpiry = getTimeUntilExpiry();
  const refreshIn = Math.max(0, timeUntilExpiry - 10 * 60 * 1000);
  refreshTimer = setTimeout(() => {
    void onRefresh().catch(() => {
      // onRefresh handles errors internally
    });
  }, refreshIn);
}

export function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export function parseJwtPayload(token: string): {
  sub: string;
  loginId: string;
  name: string;
  userType: string;
  roleType: string;
  customerNo: string;
} | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : '',
      loginId: typeof payload.loginId === 'string' ? payload.loginId : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      userType: typeof payload.userType === 'string' ? payload.userType : '',
      roleType: typeof payload.roleType === 'string' ? payload.roleType : '',
      customerNo:
        typeof payload.customerNo === 'string' ? payload.customerNo : '',
    };
  } catch {
    return null;
  }
}
