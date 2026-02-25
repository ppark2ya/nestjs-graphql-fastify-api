# Auth 서버 운영 DB 통합 설계

## 개요

기존 Spring Security 기반 각 서비스별 인증 처리를 auth 서버에서 공통으로 처리하는 구조로 전환한다.
운영 DB(tb_account, tb_user_group)에 직접 연결하여 기존 Spring 서비스와 동시 운영한다.

## 요구사항

| 항목 | 내용 |
|------|------|
| DB 연결 | 운영 DB 직접 연결 (tb_account, tb_user_group) |
| 패스워드 호환 | Spring Security `{bcrypt}` prefix 호환 (bcryptjs@3.0.3 사용) |
| 인증 레벨 | user_type 기반 서버 자동 판단 |
| 2FA 필요 | ADMIN_BO, CUSTOMER_BO, PARTNER_BO |
| 2FA 불필요 | DASHBOARD (KIOSK는 관심 밖) |
| 로그인 입력 | Header: X-User-Type, Body: loginId + password |
| JWT 클레임 | sub(id), loginId, name, userType, roleType, customerNo |
| 계정 상태 | ACTIVE/LOCKED/PENDING/IN_ACTIVE/DELETE (상태별 에러 메시지) |
| 로그인 실패 | fail_count 5회 이상 → LOCKED |
| 패스워드 만료 | last_password_changed_at 90일 경과 → code "11004" |
| 패스워드 변경 | POST /auth/password 구현 |
| Refresh Token | Stateless (DB 저장 없음, 클라이언트 측 폐기) |
| 로그아웃 | 서버 API 없음, 클라이언트 측 토큰 삭제 |

## DB 스키마 (Drizzle ORM 매핑)

운영 테이블 구조를 변경하지 않고 Drizzle로 매핑만 한다.

### tb_account

```typescript
export const tbAccount = mysqlTable('tb_account', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  createdAt: datetime('created_at', { fsp: 6 }),
  email: varchar('email', { length: 64 }),
  failCount: int('fail_count').default(0),
  lastLoginAt: datetime('last_login_at', { fsp: 6 }),
  loginId: varbinary('login_id', { length: 63 }).notNull(),
  name: varchar('name', { length: 255 }),
  userType: varchar('user_type', { length: 20 }).notNull(),
  password: varchar('password', { length: 255 }),
  status: varchar('status', { length: 255 }),
  otpSecretKey: varchar('otp_secret_key', { length: 20 }),
  customerNo: varchar('customer_no', { length: 40 }),
  lastPasswordChangedAt: datetime('last_password_changed_at', { fsp: 6 }),
  updatedAt: datetime('updated_at', { fsp: 6 }),
  ktmsAccessYn: varchar('ktms_access_yn', { length: 2 }),
  userGroupId: bigint('user_group_id', { mode: 'number' }),
  roleType: varchar('role_type', { length: 20 }),
  menuGroupId: bigint('menu_group_id', { mode: 'number' }),
  cashCourierYn: varchar('cash_courier_yn', { length: 3 }).notNull().default('N'),
}, (table) => [
  uniqueIndex('ux_account_01').on(table.loginId, table.userType),
]);
```

### tb_user_group

```typescript
export const tbUserGroup = mysqlTable('tb_user_group', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  name: varchar('name', { length: 30 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  useYn: varchar('use_yn', { length: 2 }).notNull(),
  email: varchar('email', { length: 400 }),
  createdAdm: varchar('created_adm', { length: 50 }).notNull(),
  createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  updatedAdm: varchar('updated_adm', { length: 50 }),
  updatedAt: datetime('updated_at', { fsp: 6 }),
}, (table) => [
  uniqueIndex('ux_user_group_01').on(table.name, table.type),
]);
```

## 인증 플로우

### 로그인 (`POST /auth/login`)

- Header: `X-User-Type: ADMIN_BO`
- Body: `{ loginId, password }`

```
1. tb_account에서 login_id + user_type으로 조회
2. 계정 상태 검증 (status)
   ├─ PENDING   → { code: "11001", message: "승인이 필요한 계정입니다..." }
   ├─ IN_ACTIVE → { code: "11002", message: "일시적으로 사용할 수 없는..." }
   ├─ DELETE    → { code: "11003", message: "아이디와 패스워드를 확인해주세요" }
   └─ LOCKED    → { code: "11005", message: "5회 이상 로그인이 실패하여..." }
3. 패스워드 검증 (Spring bcrypt 호환: {bcrypt} prefix 제거 후 비교)
   ├─ 실패 → fail_count + 1, 5 이상이면 status → LOCKED
   └─ 성공 → fail_count → 0, last_login_at 갱신
4. 패스워드 만료 검증
   └─ last_password_changed_at 90일 경과 → { code: "11004", message: "마지막 패스워드 변경 후 90일..." }
5. 2FA 필요 여부 판단 (user_type 기반)
   ├─ ADMIN_BO, CUSTOMER_BO, PARTNER_BO → { requiresTwoFactor: true, twoFactorToken }
   └─ DASHBOARD → 즉시 JWT 발급
```

### 2FA 검증 (`POST /auth/2fa/verify`)

- Header: `X-2FA-Token: <twoFactorToken>`
- Body: `{ totpCode }`

```
1. twoFactorToken 검증 (RS256, 5분 만료)
2. tb_account.otp_secret_key로 TOTP 코드 검증
3. 성공 → JWT access + refresh token 발급
```

### 토큰 갱신 (`POST /auth/refresh`)

- Body: `{ refreshToken }`

```
1. refresh token JWT 서명 검증 (RS256)
2. payload에서 사용자 정보 추출
3. 새로운 access + refresh token 발급 (stateless)
```

### 패스워드 변경 (`POST /auth/password`)

- Header: `Authorization: Bearer <accessToken>`
- Body: `{ currentPassword, newPassword }`

```
1. 현재 패스워드 검증 (Spring bcrypt 호환)
2. 새 패스워드를 {bcrypt} 형식으로 해싱
3. password, last_password_changed_at 갱신
4. 응답: { success: true }
```

## JWT Payload

### Access Token

```typescript
{
  sub: string;          // tb_account.id
  loginId: string;      // tb_account.login_id
  name: string;         // tb_account.name
  userType: string;     // tb_account.user_type
  roleType: string;     // tb_account.role_type
  customerNo: string;   // tb_account.customer_no
  iat: number;
  exp: number;
  jti: string;
}
```

### Refresh Token (Stateless)

```typescript
{
  sub: string;          // tb_account.id
  userType: string;
  iat: number;
  exp: number;
  jti: string;
}
```

### 2FA Token

```typescript
{
  sub: string;          // tb_account.id
  type: '2fa';
  userType: string;
  iat: number;
  exp: number;
}
```

## Spring Security bcrypt 호환

```typescript
// bcryptjs@3.0.3 사용

// 검증: {bcrypt} prefix 제거 후 비교
function verifyPassword(plain: string, stored: string): boolean {
  const hash = stored.replace(/^\{bcrypt\}/, '');
  return bcryptjs.compareSync(plain, hash);
}

// 저장: {bcrypt} prefix 붙여서 저장
function hashPassword(plain: string): string {
  const hash = bcryptjs.hashSync(plain, 10);
  return `{bcrypt}${hash}`;
}
```

## 에러 코드 체계

```typescript
const AUTH_ERROR = {
  ACCOUNT_PENDING:     { code: '11001', status: 400, message: '승인이 필요한 계정입니다. 관리자에게 문의하세요.' },
  ACCOUNT_INACTIVE:    { code: '11002', status: 400, message: '일시적으로 사용할 수 없는 계정입니다. 관리자에게 문의하세요.' },
  ACCOUNT_DELETED:     { code: '11003', status: 401, message: '아이디와 패스워드를 확인해주세요.' },
  PASSWORD_EXPIRED:    { code: '11004', status: 400, message: '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.' },
  ACCOUNT_LOCKED:      { code: '11005', status: 403, message: '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.' },
  INVALID_CREDENTIALS: { code: '11010', status: 401, message: '아이디와 패스워드를 확인해주세요.' },
  INVALID_OTP:         { code: '11011', status: 401, message: 'OTP 코드가 올바르지 않습니다.' },
  TOKEN_EXPIRED:       { code: '11012', status: 401, message: '인증 토큰이 만료되었습니다.' },
} as const;
```

### 에러 응답 형식

```json
{
  "code": "11005",
  "message": "5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.",
  "timestamp": "2026-02-25 14:30:00"
}
```

## 서비스 레이어 구조

### 모듈/서비스 변경

| 기존 | 변경 후 | 설명 |
|------|---------|------|
| UserService (users) | AccountService (tb_account) | 계정 조회/수정 |
| TokenService (refresh_tokens) | **제거** | Stateless 전환 |
| AuthService | AuthService (로직 교체) | 상태 검증, fail_count, 패스워드 만료 |
| JwtTokenService | JwtTokenService (payload 변경) | 클레임 변경, stateless refresh |
| TotpService | TotpService (유지) | 변경 없음 |
| DatabaseModule | DatabaseModule (스키마 교체) | tb_account, tb_user_group |
| MockAuthService | MockAuthService (업데이트) | 새 스키마 mock |

### 신규 추가

| 항목 | 설명 |
|------|------|
| AccountStatus enum | ACTIVE, LOCKED, PENDING, IN_ACTIVE, DELETE |
| UserType enum | ADMIN_BO, CUSTOMER_BO, KIOSK, DASHBOARD, PARTNER_BO |
| AUTH_ERROR 상수 | 에러 코드 + 메시지 매핑 |
| UserType → 2FA 정책 매핑 | user_type별 2FA 필요 여부 |
| POST /auth/password | 패스워드 변경 엔드포인트 |

## API 엔드포인트 (최종)

| Method | Path | Header | Body | 인증 |
|--------|------|--------|------|------|
| POST | `/auth/login` | `X-User-Type` | `{ loginId, password }` | 불필요 |
| POST | `/auth/2fa/verify` | `X-2FA-Token` | `{ totpCode }` | 불필요 |
| POST | `/auth/refresh` | - | `{ refreshToken }` | 불필요 |
| POST | `/auth/password` | `Authorization: Bearer` | `{ currentPassword, newPassword }` | JWT |

제거: `POST /auth/2fa/setup`, `POST /auth/logout`

## 변경 파일 범위

### 패키지

```
- bcrypt (제거)
+ bcryptjs@3.0.3 (추가)
```

### Auth 서버 (apps/auth/)

| 파일 | 작업 |
|------|------|
| src/database/schema.ts | 교체: tb_account, tb_user_group |
| src/auth/auth.module.ts | 수정: TokenModule 제거, AccountModule 추가 |
| src/auth/auth.service.ts | 교체: 상태 검증, fail_count, 패스워드 만료 |
| src/auth/auth.controller.ts | 수정: 헤더 파라미터, password 추가, logout/setup 제거 |
| src/auth/auth-mock.service.ts | 수정: 새 스키마 mock |
| src/auth/jwt.service.ts | 수정: payload 변경, stateless refresh |
| src/auth/dto/auth.dto.ts | 교체: 새 Zod 스키마 |
| src/auth/strategies/jwt.strategy.ts | 수정: validate 반환값 |
| src/user/ → src/account/ | 교체: AccountService, AccountModule |
| src/token/ | 제거 |
| src/auth/constants/auth-error.ts | 신규 |
| src/auth/enums/ | 신규: AccountStatus, UserType |
| src/app.module.ts | 수정: 모듈 교체 |

### Shared (libs/shared/)

| 파일 | 작업 |
|------|------|
| src/types/jwt-payload.interface.ts | 수정: 새 클레임 구조 |
| src/constants/auth.constants.ts | 수정: refresh token DB 관련 제거 |

### Gateway (apps/gateway/)

| 파일 | 작업 |
|------|------|
| src/auth-proxy/auth-proxy.service.ts | 수정: 헤더 전파 |
| src/auth-proxy/auth-proxy.resolver.ts | 수정: mutation 변경, changePassword 추가, logout 제거 |
| src/auth-proxy/dto/ | 수정: LoginInput 변경, ChangePasswordInput 추가 |
| src/auth-proxy/models/ | 수정: 응답 모델 조정 |

### 변경하지 않는 것

- 운영 DB 테이블 구조
- RS256 키 관리 방식
- Gateway API Key 인증
- Circuit Breaker 구조
- 미들웨어 체인
- Log Streamer 관련 코드
