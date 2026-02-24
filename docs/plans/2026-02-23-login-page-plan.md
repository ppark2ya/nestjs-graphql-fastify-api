# Login Page & UI Restructuring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `apps/log-viewer`를 `apps/ui`로 리네이밍하고, ID/PW + Google OTP 2FA 로그인 페이지를 반응형으로 구현한다.

**Architecture:** 기존 log-viewer React SPA에 인증 레이어를 추가. AuthContext로 상태 관리, localStorage에 토큰 저장, Apollo authLink로 헤더 주입. Gateway의 기존 GraphQL auth mutation(login, verifyTwoFactor, refreshToken, logout)을 사용.

**Tech Stack:** React 19, TypeScript, Apollo Client 4, React Router 7, Tailwind CSS 4, Vite 7, Playwright (E2E)

---

## Task 1: 디렉토리 리네이밍 (log-viewer → ui)

> **의존성 없음 — 가장 먼저 실행**

**Files:**
- Rename: `apps/log-viewer/` → `apps/ui/`
- Modify: `apps/ui/project.json`
- Modify: `apps/ui/vite.config.ts`
- Modify: `apps/ui/index.html`

**Step 1: 디렉토리 이름 변경**

```bash
git mv apps/log-viewer apps/ui
```

**Step 2: project.json 업데이트**

`apps/ui/project.json`에서 모든 `log-viewer` 참조를 `ui`로 변경:

```json
{
  "name": "ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/ui/src",
  "projectType": "application",
  "tags": ["scope:ui", "type:app", "lang:ts"],
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite --config apps/ui/vite.config.ts apps/ui",
        "cwd": "{workspaceRoot}"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite build --config apps/ui/vite.config.ts apps/ui",
        "cwd": "{workspaceRoot}"
      },
      "outputs": ["{workspaceRoot}/dist/apps/ui"]
    }
  }
}
```

**Step 3: vite.config.ts 빌드 출력 경로 변경**

`apps/ui/vite.config.ts`의 `build.outDir`을 수정:

```typescript
build: {
  outDir: '../../dist/apps/ui',
  emptyOutDir: true,
},
```

**Step 4: index.html 타이틀 변경**

```html
<title>System Dashboard</title>
```

**Step 5: 빌드 확인**

```bash
npx nx run ui:build
```

Expected: 빌드 성공, `dist/apps/ui/` 에 출력

**Step 6: 커밋**

```bash
git add -A && git commit -m "refactor: rename log-viewer to ui"
```

---

## Task 2: Auth 서버 토큰 만료 시간 변경

> **의존성 없음 — Task 1과 병렬 실행 가능**

**Files:**
- Modify: `libs/shared/src/constants/auth.constants.ts`

**Step 1: 상수 변경**

```typescript
export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_EXPIRY: '1h',
  ACCESS_TOKEN_EXPIRY_SECONDS: 3600,
  REFRESH_TOKEN_EXPIRY: '4h',
  REFRESH_TOKEN_EXPIRY_SECONDS: 14400,
  TWO_FACTOR_TOKEN_EXPIRY: '5m',
  TWO_FACTOR_TOKEN_EXPIRY_SECONDS: 300,
  JWT_ALGORITHM: 'RS256' as const,
  JWT_ISSUER: 'auth-server',
} as const;
```

**Step 2: auth 서버 빌드 확인**

```bash
npx nx run auth:build
```

Expected: 빌드 성공

**Step 3: 커밋**

```bash
git add libs/shared/src/constants/auth.constants.ts
git commit -m "feat(auth): change token expiry to 1h access / 4h refresh"
```

---

## Task 3: 인증 로직 (토큰 관리 + AuthContext + AuthGuard)

> **Task 1 완료 후 실행 (apps/ui 디렉토리 필요)**

**Files:**
- Create: `apps/ui/src/auth/graphql.ts`
- Create: `apps/ui/src/auth/token.ts`
- Create: `apps/ui/src/auth/AuthContext.tsx`
- Create: `apps/ui/src/auth/AuthGuard.tsx`
- Modify: `apps/ui/src/apollo.ts`
- Modify: `apps/ui/src/App.tsx`

### Step 1: auth/graphql.ts — GraphQL mutation 정의

```typescript
import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      requiresTwoFactor
      tokens {
        accessToken
        refreshToken
        expiresIn
      }
      twoFactorToken
    }
  }
`;

export const VERIFY_TWO_FACTOR_MUTATION = gql`
  mutation VerifyTwoFactor($input: TotpVerifyInput!) {
    verifyTwoFactor(input: $input) {
      accessToken
      refreshToken
      expiresIn
    }
  }
`;

export const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($input: RefreshTokenInput!) {
    refreshToken(input: $input) {
      accessToken
      refreshToken
      expiresIn
    }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout($refreshToken: String!) {
    logout(refreshToken: $refreshToken)
  }
`;

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  login: {
    requiresTwoFactor: boolean;
    tokens: AuthTokenResponse | null;
    twoFactorToken: string | null;
  };
}

export interface VerifyTwoFactorResponse {
  verifyTwoFactor: AuthTokenResponse;
}

export interface RefreshTokenResponse {
  refreshToken: AuthTokenResponse;
}
```

### Step 2: auth/token.ts — localStorage 토큰 관리 + 자동 갱신

```typescript
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

export function saveTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
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
  // 만료 10분 전에 갱신 (남은 시간이 10분 이하면 즉시)
  const refreshIn = Math.max(0, timeUntilExpiry - 10 * 60 * 1000);
  refreshTimer = setTimeout(async () => {
    try {
      await onRefresh();
    } catch {
      // onRefresh 내부에서 에러 처리 (로그아웃 등)
    }
  }, refreshIn);
}

export function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** JWT payload에서 username, roles 추출 (서명 검증 없이 디코딩만) */
export function parseJwtPayload(token: string): { sub: string; username: string; roles: string[] } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { sub: payload.sub, username: payload.username, roles: payload.roles ?? [] };
  } catch {
    return null;
  }
}
```

### Step 3: auth/AuthContext.tsx — 인증 상태 관리

```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { client } from '../apollo';
import {
  REFRESH_TOKEN_MUTATION,
  LOGOUT_MUTATION,
  type AuthTokenResponse,
  type RefreshTokenResponse,
} from './graphql';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  isAccessTokenExpired,
  startRefreshTimer,
  stopRefreshTimer,
  parseJwtPayload,
} from './token';

interface User {
  username: string;
  roles: string[];
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (tokens: AuthTokenResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const [refreshMutation] = useMutation<RefreshTokenResponse>(REFRESH_TOKEN_MUTATION);
  const [logoutMutation] = useMutation(LOGOUT_MUTATION);

  const handleLogout = useCallback(async () => {
    const rt = getRefreshToken();
    clearTokens();
    stopRefreshTimer();
    setIsAuthenticated(false);
    setUser(null);
    if (rt) {
      try { await logoutMutation({ variables: { refreshToken: rt } }); } catch { /* ignore */ }
    }
    await client.clearStore();
    navigate('/login', { replace: true });
  }, [logoutMutation, navigate]);

  const doRefresh = useCallback(async () => {
    const rt = getRefreshToken();
    if (!rt) { handleLogout(); return; }
    try {
      const { data } = await refreshMutation({ variables: { input: { refreshToken: rt } } });
      if (data?.refreshToken) {
        const { accessToken, refreshToken, expiresIn } = data.refreshToken;
        saveTokens(accessToken, refreshToken, expiresIn);
        startRefreshTimer(doRefresh);
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  }, [refreshMutation, handleLogout]);

  const handleLogin = useCallback((tokens: AuthTokenResponse) => {
    saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
    const payload = parseJwtPayload(tokens.accessToken);
    setUser(payload ? { username: payload.username, roles: payload.roles } : null);
    setIsAuthenticated(true);
    startRefreshTimer(doRefresh);
  }, [doRefresh]);

  // 페이지 로드 시 토큰 복원
  useEffect(() => {
    const init = async () => {
      const at = getAccessToken();
      if (!at) { setIsLoading(false); return; }

      if (isAccessTokenExpired()) {
        // accessToken 만료 → refresh 시도
        const rt = getRefreshToken();
        if (!rt) { clearTokens(); setIsLoading(false); return; }
        try {
          const { data } = await refreshMutation({ variables: { input: { refreshToken: rt } } });
          if (data?.refreshToken) {
            const { accessToken, refreshToken, expiresIn } = data.refreshToken;
            saveTokens(accessToken, refreshToken, expiresIn);
            const payload = parseJwtPayload(accessToken);
            setUser(payload ? { username: payload.username, roles: payload.roles } : null);
            setIsAuthenticated(true);
            startRefreshTimer(doRefresh);
          } else {
            clearTokens();
          }
        } catch {
          clearTokens();
        }
      } else {
        // accessToken 유효
        const payload = parseJwtPayload(at);
        setUser(payload ? { username: payload.username, roles: payload.roles } : null);
        setIsAuthenticated(true);
        startRefreshTimer(doRefresh);
      }
      setIsLoading(false);
    };
    init();
    return () => stopRefreshTimer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login: handleLogin, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

### Step 4: auth/AuthGuard.tsx — 라우트 보호

```tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

### Step 5: apollo.ts 수정 — authLink 추가

기존 `apps/ui/src/apollo.ts`를 아래 내용으로 교체:

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split, ApolloLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { getAccessToken } from './auth/token';

const API_KEY = 'test-api-key';

const httpLink = new HttpLink({
  uri: '/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = getAccessToken();
  return {
    headers: {
      ...headers,
      'X-API-Key': API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsLink = new GraphQLWsLink(
  createClient({
    url: `${wsProtocol}//${window.location.host}/graphql`,
    connectionParams: () => {
      const token = getAccessToken();
      return {
        'X-API-Key': API_KEY,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  }),
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
  },
  wsLink,
  authLink.concat(httpLink),
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
```

> **참고**: `@apollo/client/link/context` 패키지는 `@apollo/client`에 포함되어 있으므로 별도 설치 불필요.

### Step 6: App.tsx 수정 — AuthProvider + AuthGuard + /login 라우트

```tsx
import { ApolloProvider } from '@apollo/client/react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { client } from './apollo';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGuard from './auth/AuthGuard';
import Navigation from './components/Navigation';
import LoginPage from './pages/LoginPage';
import LiveStreamPage from './pages/LiveStreamPage';
import HistoryPage from './pages/HistoryPage';

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !isLoading && isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        path="/"
        element={
          <AuthGuard>
            <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
              <Navigation />
              <LiveStreamPage />
            </div>
          </AuthGuard>
        }
      />
      <Route
        path="/history"
        element={
          <AuthGuard>
            <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
              <Navigation />
              <HistoryPage />
            </div>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ApolloProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ApolloProvider>
  );
}
```

### Step 7: 빌드 확인

```bash
npx nx run ui:build
```

Expected: 빌드 성공 (LoginPage는 Task 4에서 구현하므로 빈 placeholder로 시작)

### Step 8: 커밋

```bash
git add apps/ui/src/auth/ apps/ui/src/apollo.ts apps/ui/src/App.tsx
git commit -m "feat(ui): add auth context, token management, route guard"
```

---

## Task 4: 로그인 페이지 UI (LoginPage + OtpInput)

> **Task 1 완료 후 실행 가능, Task 3과 병렬 실행 가능 (인터페이스 합의됨)**

**Files:**
- Create: `apps/ui/src/components/OtpInput.tsx`
- Create: `apps/ui/src/pages/LoginPage.tsx`

### Step 1: OtpInput 컴포넌트

`apps/ui/src/components/OtpInput.tsx`:

```tsx
import { useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function OtpInput({ length = 6, value, onChange, disabled }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const focusInput = useCallback((index: number) => {
    inputRefs.current[index]?.focus();
  }, []);

  const handleChange = useCallback(
    (index: number, char: string) => {
      if (!/^\d$/.test(char)) return;
      const next = digits.map((d, i) => (i === index ? char : d)).join('');
      onChange(next.slice(0, length));
      if (index < length - 1) focusInput(index + 1);
    },
    [digits, length, onChange, focusInput],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (digits[index]) {
          const next = digits.map((d, i) => (i === index ? '' : d)).join('');
          onChange(next);
        } else if (index > 0) {
          const next = digits.map((d, i) => (i === index - 1 ? '' : d)).join('');
          onChange(next);
          focusInput(index - 1);
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        focusInput(index - 1);
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        focusInput(index + 1);
      }
    },
    [digits, length, onChange, focusInput],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (pasted) {
        onChange(pasted);
        focusInput(Math.min(pasted.length, length - 1));
      }
    },
    [length, onChange, focusInput],
  );

  return (
    <div className="flex gap-2 sm:gap-3 justify-center">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit === ' ' ? '' : digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-mono rounded-lg
            bg-gray-800 border border-gray-700 text-white
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 transition-all"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
```

### Step 2: LoginPage 컴포넌트

`apps/ui/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  LOGIN_MUTATION,
  VERIFY_TWO_FACTOR_MUTATION,
  type LoginResponse,
  type VerifyTwoFactorResponse,
} from '../auth/graphql';
import OtpInput from '../components/OtpInput';

type Step = 'credentials' | 'otp';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [loginMutation, { loading: loginLoading }] = useMutation<LoginResponse>(LOGIN_MUTATION);
  const [verifyMutation, { loading: verifyLoading }] = useMutation<VerifyTwoFactorResponse>(VERIFY_TWO_FACTOR_MUTATION);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await loginMutation({
        variables: { input: { username, password } },
      });
      if (!data?.login) { setError('로그인에 실패했습니다.'); return; }

      if (data.login.requiresTwoFactor) {
        setTwoFactorToken(data.login.twoFactorToken!);
        setStep('otp');
      } else {
        login(data.login.tokens!);
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err.message ?? '로그인에 실패했습니다.');
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await verifyMutation({
        variables: { input: { twoFactorToken, totpCode: otpCode } },
      });
      if (!data?.verifyTwoFactor) { setError('인증에 실패했습니다.'); return; }
      login(data.verifyTwoFactor);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message ?? '인증 코드가 올바르지 않습니다.');
      setOtpCode('');
    }
  };

  const handleBack = () => {
    setStep('credentials');
    setOtpCode('');
    setTwoFactorToken('');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-8 shadow-2xl">
          {/* Card content transitions */}
          <div className="relative overflow-hidden">
            {/* Step 1: Credentials */}
            <div
              className={`transition-all duration-300 ${
                step === 'credentials'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-full absolute inset-0'
              }`}
            >
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">시스템 로그인</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm text-gray-400 mb-1">Username</label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white
                      placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="사용자명 입력"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm text-gray-400 mb-1">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white
                        placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                      placeholder="비밀번호 입력"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginLoading || !username || !password}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loginLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  )}
                  로그인
                </button>
              </form>
            </div>

            {/* Step 2: OTP */}
            <div
              className={`transition-all duration-300 ${
                step === 'otp'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 translate-x-full absolute inset-0'
              }`}
            >
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">2단계 인증</h2>
                <p className="text-sm text-gray-400 mt-1">Google OTP 앱의 6자리 코드를 입력하세요</p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <OtpInput value={otpCode} onChange={setOtpCode} disabled={verifyLoading} />

                <button
                  type="submit"
                  disabled={verifyLoading || otpCode.replace(/\s/g, '').length < 6}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {verifyLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  )}
                  인증하기
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  &larr; 돌아가기
                </button>
              </form>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 3: 빌드 확인

```bash
npx nx run ui:build
```

### Step 4: 커밋

```bash
git add apps/ui/src/components/OtpInput.tsx apps/ui/src/pages/LoginPage.tsx
git commit -m "feat(ui): add login page with 2FA OTP input"
```

---

## Task 5: Navigation 수정 (사용자명 + 로그아웃)

> **Task 3 완료 후 실행 (AuthContext 필요)**

**Files:**
- Modify: `apps/ui/src/components/Navigation.tsx`

### Step 1: Navigation 업데이트

```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';

export default function Navigation() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-900">
      <h1 className="text-base font-semibold mr-8">System Dashboard</h1>
      <nav className="flex gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )
          }
        >
          Live Stream
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )
          }
        >
          History
        </NavLink>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <span className="text-sm text-gray-400">{user.username}</span>
        )}
        <button
          onClick={logout}
          className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
```

### Step 2: 커밋

```bash
git add apps/ui/src/components/Navigation.tsx
git commit -m "feat(ui): add username display and logout button to navigation"
```

---

## Task 6: Playwright E2E 테스트

> **Task 3, 4 완료 후 실행**

**Files:**
- Create: `apps/ui/e2e/login.spec.ts`
- Create: `apps/ui/e2e/auth-guard.spec.ts`
- Create: `apps/ui/playwright.config.ts`

### Step 1: Playwright 설정

`apps/ui/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npx nx run ui:serve',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

### Step 2: 로그인 E2E 테스트

`apps/ui/e2e/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    // localStorage 클리어 후 로그인 페이지로 이동
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
  });

  test('should require username and password', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: '로그인' });
    await expect(submitBtn).toBeDisabled();
  });

  test('should toggle password visibility', async ({ page }) => {
    const pwInput = page.getByLabel('Password');
    await expect(pwInput).toHaveAttribute('type', 'password');

    // 눈 아이콘 클릭
    await page.locator('button[tabindex="-1"]').click();
    await expect(pwInput).toHaveAttribute('type', 'text');

    // 다시 클릭
    await page.locator('button[tabindex="-1"]').click();
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.getByLabel('Username').fill('wronguser');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: '로그인' }).click();

    // GraphQL 에러 메시지 표시 대기
    await expect(page.getByText(/실패|잘못|invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    // 카드가 뷰포트 너비에 맞게 표시되는지 확인
    const card = page.locator('.bg-gray-900.border');
    const box = await card.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('OTP Input', () => {
  // OTP 화면은 2FA가 활성화된 계정으로 로그인 시 표시됨
  // 이 테스트는 OTP 화면이 표시된 상태를 가정하므로, mock이 필요할 수 있음
  // 실제 E2E에서는 2FA 활성화된 테스트 계정 필요

  test('should handle paste of 6-digit code', async ({ page }) => {
    // 이 테스트는 OTP 화면 진입이 필요하므로 스킵 가능
    test.skip(true, '2FA 활성화된 테스트 계정 필요');
  });
});
```

### Step 3: AuthGuard E2E 테스트

`apps/ui/e2e/auth-guard.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Auth Guard', () => {
  test('should redirect to /login when accessing / without auth', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect to /login when accessing /history without auth', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/history');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should stay on /login if already there', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
  });
});
```

### Step 4: project.json에 E2E 타겟 추가

`apps/ui/project.json`의 targets에 추가:

```json
"e2e": {
  "executor": "nx:run-commands",
  "options": {
    "command": "npx playwright test --config apps/ui/playwright.config.ts",
    "cwd": "{workspaceRoot}"
  }
}
```

### Step 5: 커밋

```bash
git add apps/ui/e2e/ apps/ui/playwright.config.ts apps/ui/project.json
git commit -m "test(ui): add Playwright E2E tests for login and auth guard"
```

---

## Task Dependency Graph

```
Task 1 (디렉토리 리네이밍)  ──┬──→  Task 3 (인증 로직)  ──→  Task 5 (Navigation)
                              │                               │
Task 2 (토큰 만료 변경)       └──→  Task 4 (LoginPage UI)     └──→  Task 6 (E2E 테스트)
                                                               │
                                                     Task 4 ──┘
```

**병렬 실행 가능 그룹:**
- Group A: Task 1 + Task 2 (동시)
- Group B: Task 3 + Task 4 (Task 1 완료 후 동시)
- Group C: Task 5 + Task 6 (Task 3, 4 완료 후)
