# Auth 서버 운영 DB 통합 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 기존 Spring Security 기반 인증을 NestJS auth 서버에서 운영 DB(tb_account, tb_user_group)로 직접 처리하도록 전환

**Architecture:** 운영 DB 직접 연결, Spring bcrypt 호환(`{bcrypt}` prefix), user_type 기반 2FA 정책, stateless refresh token, 기존 TCP microservice 통신 구조 유지

**Tech Stack:** NestJS 11, Drizzle ORM, bcryptjs 3.0.3, jose (RS256), otplib (TOTP), zod

---

### Task 1: 패키지 변경 (bcrypt → bcryptjs)

**Files:**
- Modify: `package.json:63` (`bcrypt` → `bcryptjs`)
- Modify: `package.json:108` (`@types/bcrypt` 제거)

**Step 1: 패키지 교체**

```bash
pnpm remove bcrypt @types/bcrypt
pnpm add bcryptjs@3.0.3
pnpm add -D @types/bcryptjs
```

**Step 2: 설치 확인**

Run: `pnpm list bcryptjs`
Expected: `bcryptjs 3.0.3`

**Step 3: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: replace bcrypt with bcryptjs@3.0.3"
```

---

### Task 2: Shared 타입 & 상수 변경

**Files:**
- Modify: `libs/shared/src/types/jwt-payload.interface.ts`
- Modify: `libs/shared/src/constants/auth.constants.ts`

**Step 1: JwtPayload 인터페이스 변경**

`libs/shared/src/types/jwt-payload.interface.ts` 전체 교체:

```typescript
export interface JwtPayload {
  sub: string; // tb_account.id
  loginId: string;
  name: string;
  userType: string; // ADMIN_BO, CUSTOMER_BO, DASHBOARD, PARTNER_BO
  roleType: string;
  customerNo: string;
  iat: number;
  exp: number;
  jti: string;
}
```

**Step 2: AUTH_CONSTANTS 변경**

`libs/shared/src/constants/auth.constants.ts` 전체 교체:

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
  PASSWORD_EXPIRY_DAYS: 90,
  MAX_FAIL_COUNT: 5,
} as const;
```

**Step 3: 빌드 확인**

Run: `pnpm nx build shared`
Expected: 성공

**Step 4: 커밋**

```bash
git add libs/shared/
git commit -m "refactor(shared): update JwtPayload and AUTH_CONSTANTS for production DB"
```

---

### Task 3: Auth 서버 enum & 에러 상수 생성

**Files:**
- Create: `apps/auth/src/auth/enums/account-status.enum.ts`
- Create: `apps/auth/src/auth/enums/user-type.enum.ts`
- Create: `apps/auth/src/auth/enums/index.ts`
- Create: `apps/auth/src/auth/constants/auth-error.ts`

**Step 1: AccountStatus enum**

`apps/auth/src/auth/enums/account-status.enum.ts`:

```typescript
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  PENDING = 'PENDING',
  IN_ACTIVE = 'IN_ACTIVE',
  DELETE = 'DELETE',
}
```

**Step 2: UserType enum**

`apps/auth/src/auth/enums/user-type.enum.ts`:

```typescript
export enum UserType {
  ADMIN_BO = 'ADMIN_BO',
  CUSTOMER_BO = 'CUSTOMER_BO',
  KIOSK = 'KIOSK',
  DASHBOARD = 'DASHBOARD',
  PARTNER_BO = 'PARTNER_BO',
}

/** 2FA가 필요한 user_type 목록 */
export const TWO_FACTOR_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  UserType.ADMIN_BO,
  UserType.CUSTOMER_BO,
  UserType.PARTNER_BO,
]);
```

**Step 3: enum barrel export**

`apps/auth/src/auth/enums/index.ts`:

```typescript
export { AccountStatus } from './account-status.enum';
export { UserType, TWO_FACTOR_REQUIRED_TYPES } from './user-type.enum';
```

**Step 4: AUTH_ERROR 상수**

`apps/auth/src/auth/constants/auth-error.ts`:

```typescript
export const AUTH_ERROR = {
  ACCOUNT_PENDING: {
    code: '11001',
    status: 400,
    message: '승인이 필요한 계정입니다. 관리자에게 문의하세요.',
  },
  ACCOUNT_INACTIVE: {
    code: '11002',
    status: 400,
    message: '일시적으로 사용할 수 없는 계정입니다. 관리자에게 문의하세요.',
  },
  ACCOUNT_DELETED: {
    code: '11003',
    status: 401,
    message: '아이디와 패스워드를 확인해주세요.',
  },
  PASSWORD_EXPIRED: {
    code: '11004',
    status: 400,
    message:
      '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
  },
  ACCOUNT_LOCKED: {
    code: '11005',
    status: 403,
    message:
      '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.',
  },
  INVALID_CREDENTIALS: {
    code: '11010',
    status: 401,
    message: '아이디와 패스워드를 확인해주세요.',
  },
  INVALID_OTP: {
    code: '11011',
    status: 401,
    message: 'OTP 코드가 올바르지 않습니다.',
  },
  TOKEN_EXPIRED: {
    code: '11012',
    status: 401,
    message: '인증 토큰이 만료되었습니다.',
  },
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERROR;
```

**Step 5: 커밋**

```bash
git add apps/auth/src/auth/enums/ apps/auth/src/auth/constants/
git commit -m "feat(auth): add AccountStatus, UserType enums and AUTH_ERROR constants"
```

---

### Task 4: Auth 에러 응답 Exception Filter

**Files:**
- Create: `apps/auth/src/auth/filters/auth-error.filter.ts`

**Step 1: AuthErrorException & Filter 구현**

`apps/auth/src/auth/filters/auth-error.filter.ts`:

```typescript
import { HttpException, Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { format } from 'date-fns';

/**
 * 운영 에러 코드 기반 exception.
 * { code: string; message: string; timestamp: string } 형식으로 응답.
 */
export class AuthErrorException extends HttpException {
  constructor(
    public readonly errorCode: string,
    public readonly errorMessage: string,
    statusCode: number,
  ) {
    super({ code: errorCode, message: errorMessage }, statusCode);
  }
}

@Catch(AuthErrorException)
export class AuthErrorFilter implements ExceptionFilter {
  catch(exception: AuthErrorException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const status = exception.getStatus();

    reply.status(status).send({
      code: exception.errorCode,
      message: exception.errorMessage,
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    });
  }
}
```

> **참고**: `date-fns`가 없으면 직접 포맷팅으로 대체:
> ```typescript
> function formatTimestamp(): string {
>   const d = new Date();
>   const pad = (n: number) => String(n).padStart(2, '0');
>   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
> }
> ```
> date-fns를 추가하고 싶지 않다면 위 헬퍼를 사용. 여기서는 직접 포맷팅 방식을 사용한다.

**Step 1 수정: date-fns 없이 구현**

```typescript
import {
  HttpException,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class AuthErrorException extends HttpException {
  constructor(
    public readonly errorCode: string,
    public readonly errorMessage: string,
    statusCode: number,
  ) {
    super({ code: errorCode, message: errorMessage }, statusCode);
  }
}

@Catch(AuthErrorException)
export class AuthErrorFilter implements ExceptionFilter {
  catch(exception: AuthErrorException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const status = exception.getStatus();

    reply.status(status).send({
      code: exception.errorCode,
      message: exception.errorMessage,
      timestamp: formatTimestamp(),
    });
  }
}
```

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/filters/
git commit -m "feat(auth): add AuthErrorException and AuthErrorFilter"
```

---

### Task 5: DB 스키마 교체 (tb_account, tb_user_group)

**Files:**
- Modify: `apps/auth/src/database/schema.ts` (전체 교체)

**Step 1: 스키마 파일 전체 교체**

`apps/auth/src/database/schema.ts`:

```typescript
import {
  mysqlTable,
  varchar,
  int,
  bigint,
  datetime,
  uniqueIndex,
  varbinary,
} from 'drizzle-orm/mysql-core';

export const tbAccount = mysqlTable(
  'tb_account',
  {
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
    cashCourierYn: varchar('cash_courier_yn', { length: 3 })
      .notNull()
      .default('N'),
  },
  (table) => [uniqueIndex('ux_account_01').on(table.loginId, table.userType)],
);

export const tbUserGroup = mysqlTable(
  'tb_user_group',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    name: varchar('name', { length: 30 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    useYn: varchar('use_yn', { length: 2 }).notNull(),
    email: varchar('email', { length: 400 }),
    createdAdm: varchar('created_adm', { length: 50 }).notNull(),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAdm: varchar('updated_adm', { length: 50 }),
    updatedAt: datetime('updated_at', { fsp: 6 }),
  },
  (table) => [uniqueIndex('ux_user_group_01').on(table.name, table.type)],
);
```

**Step 2: 커밋**

```bash
git add apps/auth/src/database/schema.ts
git commit -m "refactor(auth): replace users/refresh_tokens schema with tb_account/tb_user_group"
```

---

### Task 6: AccountService 생성 (UserService 대체)

**Files:**
- Create: `apps/auth/src/account/account.service.ts`
- Create: `apps/auth/src/account/account.module.ts`
- Delete: `apps/auth/src/user/user.service.ts`
- Delete: `apps/auth/src/user/user.module.ts`

**Step 1: AccountService 구현**

`apps/auth/src/account/account.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { tbAccount } from '../database/schema';
import { AccountStatus } from '../auth/enums';

@Injectable()
export class AccountService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByLoginIdAndUserType(loginId: string, userType: string) {
    const [account] = await this.db
      .select()
      .from(tbAccount)
      .where(
        and(
          eq(tbAccount.loginId, Buffer.from(loginId)),
          eq(tbAccount.userType, userType),
        ),
      )
      .limit(1);
    return account ?? null;
  }

  async findById(id: number) {
    const [account] = await this.db
      .select()
      .from(tbAccount)
      .where(eq(tbAccount.id, id))
      .limit(1);
    return account ?? null;
  }

  async incrementFailCount(id: number) {
    await this.db
      .update(tbAccount)
      .set({ failCount: sql`${tbAccount.failCount} + 1` })
      .where(eq(tbAccount.id, id));
  }

  async lockAccount(id: number) {
    await this.db
      .update(tbAccount)
      .set({ status: AccountStatus.LOCKED })
      .where(eq(tbAccount.id, id));
  }

  async resetFailCountAndUpdateLoginAt(id: number) {
    await this.db
      .update(tbAccount)
      .set({ failCount: 0, lastLoginAt: new Date() })
      .where(eq(tbAccount.id, id));
  }

  async updatePassword(id: number, hashedPassword: string) {
    await this.db
      .update(tbAccount)
      .set({
        password: hashedPassword,
        lastPasswordChangedAt: new Date(),
      })
      .where(eq(tbAccount.id, id));
  }
}
```

> **주의**: `login_id`는 `varbinary` 타입이므로 `Buffer.from(loginId)`로 변환하여 비교해야 한다. Drizzle에서 varbinary 비교가 정상 동작하는지 실제 테스트 시 확인 필요. 만약 문제가 있다면 `sql` 태그로 raw query 사용:
> ```typescript
> .where(and(
>   sql`${tbAccount.loginId} = ${loginId}`,
>   eq(tbAccount.userType, userType),
> ))
> ```

**Step 2: AccountModule 생성**

`apps/auth/src/account/account.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AccountService } from './account.service';

@Module({
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
```

**Step 3: user/ 디렉토리 제거**

```bash
rm -rf apps/auth/src/user/
```

**Step 4: 커밋**

```bash
git add apps/auth/src/account/ apps/auth/src/user/
git commit -m "refactor(auth): replace UserService with AccountService for tb_account"
```

---

### Task 7: TokenService 제거

**Files:**
- Delete: `apps/auth/src/token/token.service.ts`
- Delete: `apps/auth/src/token/token.module.ts`

**Step 1: token/ 디렉토리 제거**

```bash
rm -rf apps/auth/src/token/
```

**Step 2: 커밋**

```bash
git add apps/auth/src/token/
git commit -m "refactor(auth): remove TokenService (stateless refresh token)"
```

---

### Task 8: Auth DTO 변경

**Files:**
- Modify: `apps/auth/src/auth/dto/auth.dto.ts` (전체 교체)

**Step 1: Zod 스키마 전체 교체**

`apps/auth/src/auth/dto/auth.dto.ts`:

```typescript
import { z } from 'zod';

export const LoginSchema = z.object({
  loginId: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const TotpVerifySchema = z.object({
  totpCode: z
    .string()
    .length(6)
    .regex(/^\d+$/),
});
export type TotpVerifyDto = z.infer<typeof TotpVerifySchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(255),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
```

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/dto/auth.dto.ts
git commit -m "refactor(auth): update Zod DTOs for production login flow"
```

---

### Task 9: JwtTokenService 변경

**Files:**
- Modify: `apps/auth/src/auth/jwt.service.ts`

**Step 1: JwtTokenService 전체 교체**

`apps/auth/src/auth/jwt.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import {
  importPKCS8,
  importSPKI,
  SignJWT,
  jwtVerify,
  type KeyLike,
} from 'jose';
import { randomUUID } from 'crypto';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { JwtPayload } from '@monorepo/shared';

@Injectable()
export class JwtTokenService implements OnModuleInit {
  private privateKey: KeyLike;
  private publicKey: KeyLike;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const privateKeyPath = this.config.get<string>(
      'JWT_PRIVATE_KEY_PATH',
      'keys/private.pem',
    );
    const publicKeyPath = this.config.get<string>(
      'JWT_PUBLIC_KEY_PATH',
      'keys/public.pem',
    );

    const [privatePem, publicPem] = await Promise.all([
      readFile(privateKeyPath, 'utf8'),
      readFile(publicKeyPath, 'utf8'),
    ]);

    this.privateKey = await importPKCS8(
      privatePem,
      AUTH_CONSTANTS.JWT_ALGORITHM,
    );
    this.publicKey = await importSPKI(publicPem, AUTH_CONSTANTS.JWT_ALGORITHM);
  }

  async signAccessToken(
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>,
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({ ...payload, jti })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(payload.sub)
      .sign(this.privateKey);

    return { token, jti };
  }

  async signRefreshToken(
    sub: string,
    userType: string,
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({ sub, userType, jti })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(sub)
      .sign(this.privateKey);

    return { token, jti };
  }

  async signTwoFactorToken(sub: string, userType: string): Promise<string> {
    return new SignJWT({ sub, type: '2fa', userType })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.TWO_FACTOR_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(sub)
      .sign(this.privateKey);
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: AUTH_CONSTANTS.JWT_ISSUER,
      algorithms: [AUTH_CONSTANTS.JWT_ALGORITHM],
    });
    return payload as unknown as JwtPayload;
  }

  async verifyTwoFactorToken(
    token: string,
  ): Promise<{ sub: string; userType: string }> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: AUTH_CONSTANTS.JWT_ISSUER,
      algorithms: [AUTH_CONSTANTS.JWT_ALGORITHM],
    });
    if ((payload as any).type !== '2fa') {
      throw new Error('Invalid 2FA token type');
    }
    return {
      sub: payload.sub as string,
      userType: (payload as any).userType as string,
    };
  }
}
```

**핵심 변경점:**
- `signRefreshToken`: `userType` 파라미터 추가 (stateless에서 사용자 조회에 필요)
- `signTwoFactorToken`: `userType` 파라미터 추가
- `signAccessToken`: payload 구조 변경 (JwtPayload에 맞춰 자동 반영)
- `verifyTwoFactorToken`: `userType` 반환 추가

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/jwt.service.ts
git commit -m "refactor(auth): update JwtTokenService for new payload and stateless refresh"
```

---

### Task 10: AuthService 전체 교체

**Files:**
- Modify: `apps/auth/src/auth/auth.service.ts` (전체 교체)

**Step 1: AuthService 전체 교체**

`apps/auth/src/auth/auth.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { AccountService } from '../account/account.service';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';
import { AccountStatus } from './enums';
import { TWO_FACTOR_REQUIRED_TYPES } from './enums/user-type.enum';
import { AUTH_ERROR } from './constants/auth-error';
import { AuthErrorException } from './filters/auth-error.filter';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountService: AccountService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly totpService: TotpService,
  ) {}

  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    // 1. 계정 조회
    const account = await this.accountService.findByLoginIdAndUserType(
      loginId,
      userType,
    );
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    // 2. 계정 상태 검증
    this.validateAccountStatus(account.status);

    // 3. 패스워드 검증
    const isPasswordValid = await this.verifyPassword(
      password,
      account.password,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(account.id, (account.failCount ?? 0) + 1);
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    // 4. 로그인 성공 → fail_count 리셋, last_login_at 갱신
    await this.accountService.resetFailCountAndUpdateLoginAt(account.id);

    // 5. 패스워드 만료 검증
    this.validatePasswordExpiry(account.lastPasswordChangedAt);

    // 6. 2FA 필요 여부 판단
    if (TWO_FACTOR_REQUIRED_TYPES.has(userType)) {
      const twoFactorToken = await this.jwtTokenService.signTwoFactorToken(
        String(account.id),
        userType,
      );
      return { requiresTwoFactor: true, twoFactorToken };
    }

    // 7. 1차 인증만 → 즉시 토큰 발급
    const tokens = await this.issueTokens(account);
    return { requiresTwoFactor: false, tokens };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    const { sub } = await this.jwtTokenService
      .verifyTwoFactorToken(twoFactorToken)
      .catch(() => {
        this.throwAuthError('TOKEN_EXPIRED');
      });

    const account = await this.accountService.findById(Number(sub));
    if (!account || !account.otpSecretKey) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const isValid = this.totpService.verify(totpCode, account.otpSecretKey);
    if (!isValid) {
      this.throwAuthError('INVALID_OTP');
    }

    return this.issueTokens(account);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.jwtTokenService
      .verifyToken(refreshToken)
      .catch(() => {
        this.throwAuthError('TOKEN_EXPIRED');
      });

    const account = await this.accountService.findById(Number(payload.sub));
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    return this.issueTokens(account);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const account = await this.accountService.findById(userId);
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const isCurrentValid = await this.verifyPassword(
      currentPassword,
      account.password,
    );
    if (!isCurrentValid) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const hashedPassword = this.hashPassword(newPassword);
    await this.accountService.updatePassword(account.id, hashedPassword);

    return { success: true };
  }

  // ========== Private helpers ==========

  private validateAccountStatus(status: string | null): void {
    if (!status || status === AccountStatus.ACTIVE) return;

    const statusErrorMap: Record<string, keyof typeof AUTH_ERROR> = {
      [AccountStatus.PENDING]: 'ACCOUNT_PENDING',
      [AccountStatus.IN_ACTIVE]: 'ACCOUNT_INACTIVE',
      [AccountStatus.DELETE]: 'ACCOUNT_DELETED',
      [AccountStatus.LOCKED]: 'ACCOUNT_LOCKED',
    };

    const errorKey = statusErrorMap[status];
    if (errorKey) {
      this.throwAuthError(errorKey);
    }
  }

  private validatePasswordExpiry(lastChanged: Date | null): void {
    if (!lastChanged) return;

    const daysSinceChange = Math.floor(
      (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceChange >= AUTH_CONSTANTS.PASSWORD_EXPIRY_DAYS) {
      this.throwAuthError('PASSWORD_EXPIRED');
    }
  }

  private async handleFailedLogin(
    accountId: number,
    newFailCount: number,
  ): Promise<void> {
    await this.accountService.incrementFailCount(accountId);
    if (newFailCount >= AUTH_CONSTANTS.MAX_FAIL_COUNT) {
      await this.accountService.lockAccount(accountId);
    }
  }

  private async verifyPassword(
    plain: string,
    stored: string | null,
  ): Promise<boolean> {
    if (!stored) return false;
    // Spring Security bcrypt 호환: {bcrypt} prefix 제거
    const hash = stored.replace(/^\{bcrypt\}/, '');
    return bcryptjs.compare(plain, hash);
  }

  private hashPassword(plain: string): string {
    const hash = bcryptjs.hashSync(plain, 10);
    return `{bcrypt}${hash}`;
  }

  private async issueTokens(account: {
    id: number;
    loginId: Buffer | string;
    name: string | null;
    userType: string;
    roleType: string | null;
    customerNo: string | null;
  }): Promise<AuthTokens> {
    const sub = String(account.id);
    const loginId =
      account.loginId instanceof Buffer
        ? account.loginId.toString('utf8')
        : account.loginId;

    const [accessResult, refreshResult] = await Promise.all([
      this.jwtTokenService.signAccessToken({
        sub,
        loginId,
        name: account.name ?? '',
        userType: account.userType,
        roleType: account.roleType ?? '',
        customerNo: account.customerNo ?? '',
      }),
      this.jwtTokenService.signRefreshToken(sub, account.userType),
    ]);

    return {
      accessToken: accessResult.token,
      refreshToken: refreshResult.token,
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  private throwAuthError(key: keyof typeof AUTH_ERROR): never {
    const error = AUTH_ERROR[key];
    throw new AuthErrorException(error.code, error.message, error.status);
  }
}
```

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/auth.service.ts
git commit -m "refactor(auth): rewrite AuthService for production DB with status/fail/expiry logic"
```

---

### Task 11: AuthController 변경

**Files:**
- Modify: `apps/auth/src/auth/auth.controller.ts` (전체 교체)

**Step 1: AuthController 전체 교체**

`apps/auth/src/auth/auth.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  Req,
  UsePipes,
  Inject,
  UseFilters,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ZodValidationPipe } from './zod-validation.pipe';
import { AuthErrorFilter } from './filters/auth-error.filter';
import {
  LoginSchema,
  TotpVerifySchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  type LoginDto,
  type TotpVerifyDto,
  type RefreshTokenDto,
  type ChangePasswordDto,
} from './dto/auth.dto';

type AuthServiceType = AuthService | MockAuthService;

@Controller('auth')
@UseFilters(AuthErrorFilter)
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: AuthServiceType,
  ) {}

  // ========== HTTP Endpoints ==========

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(
    @Body() body: LoginDto,
    @Headers('x-user-type') userType: string,
  ) {
    return this.authService.login(body.loginId, body.password, userType);
  }

  @Post('2fa/verify')
  @UsePipes(new ZodValidationPipe(TotpVerifySchema))
  async verifyTwoFactor(
    @Body() body: TotpVerifyDto,
    @Headers('x-2fa-token') twoFactorToken: string,
  ) {
    return this.authService.verifyTwoFactor(twoFactorToken, body.totpCode);
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshTokenSchema))
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(ChangePasswordSchema))
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: any) {
    return this.authService.changePassword(
      Number(req.user.userId),
      body.currentPassword,
      body.newPassword,
    );
  }

  // ========== TCP MessagePattern Handlers ==========

  @MessagePattern('auth.login')
  async tcpLogin(@Payload() data: LoginDto & { userType: string }) {
    return this.authService.login(data.loginId, data.password, data.userType);
  }

  @MessagePattern('auth.2fa.verify')
  async tcpVerifyTwoFactor(
    @Payload() data: { twoFactorToken: string; totpCode: string },
  ) {
    return this.authService.verifyTwoFactor(
      data.twoFactorToken,
      data.totpCode,
    );
  }

  @MessagePattern('auth.refresh')
  async tcpRefresh(@Payload() data: RefreshTokenDto) {
    return this.authService.refreshTokens(data.refreshToken);
  }

  @MessagePattern('auth.password')
  async tcpChangePassword(
    @Payload() data: { userId: number; currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      data.userId,
      data.currentPassword,
      data.newPassword,
    );
  }
}
```

**핵심 변경점:**
- `login`: `@Headers('x-user-type')` 추가
- `verifyTwoFactor`: body에서 `twoFactorToken` 제거, `@Headers('x-2fa-token')`으로 변경
- `setupTwoFactor`, `logout` 엔드포인트 **제거**
- `changePassword` 엔드포인트 **추가**
- `@UseFilters(AuthErrorFilter)` 컨트롤러 레벨 적용
- TCP 핸들러도 동일하게 변경

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/auth.controller.ts
git commit -m "refactor(auth): update AuthController for header-based params and new endpoints"
```

---

### Task 12: JWT Strategy 변경

**Files:**
- Modify: `apps/auth/src/auth/strategies/jwt.strategy.ts`

**Step 1: validate 반환값 변경**

`apps/auth/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import type { JwtPayload } from '@monorepo/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const publicKeyPath = config.get<string>(
      'JWT_PUBLIC_KEY_PATH',
      'keys/public.pem',
    );
    const publicKey = readFileSync(publicKeyPath, 'utf8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: 'auth-server',
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      loginId: payload.loginId,
      name: payload.name,
      userType: payload.userType,
      roleType: payload.roleType,
      customerNo: payload.customerNo,
    };
  }
}
```

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/strategies/jwt.strategy.ts
git commit -m "refactor(auth): update JwtStrategy validate for new JwtPayload fields"
```

---

### Task 13: Auth 모듈 & App 모듈 재구성

**Files:**
- Modify: `apps/auth/src/auth/auth.module.ts`
- Modify: `apps/auth/src/app.module.ts`

**Step 1: AuthModule 변경**

`apps/auth/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { AuthController } from './auth.controller';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccountModule } from '../account/account.module';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

@Module({
  imports: useMockAuth ? [PassportModule] : [PassportModule, AccountModule],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AUTH_SERVICE',
      useClass: useMockAuth ? MockAuthService : AuthService,
    },
    ...(useMockAuth ? [] : [JwtTokenService, TotpService, JwtStrategy]),
  ],
  exports: useMockAuth ? [] : [JwtTokenService],
})
export class AuthModule {}
```

**Step 2: AppModule 변경**

`apps/auth/src/app.module.ts`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';
import { envSchema } from './env.schema';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

const dbModules = useMockAuth ? [] : [DatabaseModule, AccountModule];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    ...dbModules,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        CorrelationIdMiddleware,
        RequestContextMiddleware,
        LoggerMiddleware,
      )
      .forRoutes('*');
  }
}
```

**Step 3: 커밋**

```bash
git add apps/auth/src/auth/auth.module.ts apps/auth/src/app.module.ts
git commit -m "refactor(auth): rewire modules (AccountModule, remove TokenModule/UserModule)"
```

---

### Task 14: MockAuthService 업데이트

**Files:**
- Modify: `apps/auth/src/auth/auth-mock.service.ts` (전체 교체)

**Step 1: MockAuthService 전체 교체**

`apps/auth/src/auth/auth-mock.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';
import { AuthErrorException } from './filters/auth-error.filter';
import { AUTH_ERROR } from './constants/auth-error';

const MOCK_ACCOUNTS = [
  {
    id: 1,
    loginId: 'admin',
    password: 'admin123',
    name: '관리자',
    userType: 'ADMIN_BO',
    roleType: 'ADMIN',
    customerNo: 'C001',
    status: 'ACTIVE',
    otpSecretKey: 'JBSWY3DPEHPK3PXP',
    failCount: 0,
    lastPasswordChangedAt: new Date(),
  },
  {
    id: 2,
    loginId: 'dashboard',
    password: 'dash123',
    name: '대시보드',
    userType: 'DASHBOARD',
    roleType: 'VIEWER',
    customerNo: 'C002',
    status: 'ACTIVE',
    otpSecretKey: null,
    failCount: 0,
    lastPasswordChangedAt: new Date(),
  },
];

const generateMockToken = (payload: object, prefix: string): string => {
  const data = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now() }),
  ).toString('base64');
  return `${prefix}.${data}.mock`;
};

@Injectable()
export class MockAuthService {
  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    const account = MOCK_ACCOUNTS.find(
      (a) => a.loginId === loginId && a.userType === userType,
    );

    if (!account || account.password !== password) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_CREDENTIALS.code,
        AUTH_ERROR.INVALID_CREDENTIALS.message,
        AUTH_ERROR.INVALID_CREDENTIALS.status,
      );
    }

    const requiresTwoFactor = ['ADMIN_BO', 'CUSTOMER_BO', 'PARTNER_BO'].includes(userType);
    if (requiresTwoFactor) {
      const twoFactorToken = generateMockToken(
        { sub: account.id, type: '2fa', userType },
        'mock2fa',
      );
      return { requiresTwoFactor: true, twoFactorToken };
    }

    return { requiresTwoFactor: false, tokens: this.generateTokens(account) };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    if (!twoFactorToken.startsWith('mock2fa.')) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }
    if (!/^\d{6}$/.test(totpCode)) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_OTP.code,
        AUTH_ERROR.INVALID_OTP.message,
        AUTH_ERROR.INVALID_OTP.status,
      );
    }

    const account = MOCK_ACCOUNTS[0];
    return this.generateTokens(account);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken.startsWith('mockRefresh.')) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }
    return this.generateTokens(MOCK_ACCOUNTS[0]);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const account = MOCK_ACCOUNTS.find((a) => a.id === userId);
    if (!account || account.password !== currentPassword) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_CREDENTIALS.code,
        AUTH_ERROR.INVALID_CREDENTIALS.message,
        AUTH_ERROR.INVALID_CREDENTIALS.status,
      );
    }
    return { success: true };
  }

  private generateTokens(account: (typeof MOCK_ACCOUNTS)[0]): AuthTokens {
    return {
      accessToken: generateMockToken(
        {
          sub: account.id,
          loginId: account.loginId,
          name: account.name,
          userType: account.userType,
          roleType: account.roleType,
          customerNo: account.customerNo,
        },
        'mockAccess',
      ),
      refreshToken: generateMockToken(
        { sub: account.id, userType: account.userType },
        'mockRefresh',
      ),
      expiresIn: 3600,
    };
  }
}
```

**Step 2: 커밋**

```bash
git add apps/auth/src/auth/auth-mock.service.ts
git commit -m "refactor(auth): update MockAuthService for production schema"
```

---

### Task 15: Gateway Auth Proxy 변경

**Files:**
- Modify: `apps/gateway/src/auth-proxy/auth-proxy.service.ts`
- Modify: `apps/gateway/src/auth-proxy/auth-proxy.resolver.ts`
- Modify: `apps/gateway/src/auth-proxy/dto/login.input.ts`
- Modify: `apps/gateway/src/auth-proxy/dto/totp-verify.input.ts`
- Create: `apps/gateway/src/auth-proxy/dto/change-password.input.ts`
- Delete: `apps/gateway/src/auth-proxy/dto/totp-setup.input.ts`
- Delete: `apps/gateway/src/auth-proxy/models/totp-setup-result.model.ts`

**Step 1: LoginInput 변경**

`apps/gateway/src/auth-proxy/dto/login.input.ts`:

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class LoginInput {
  @Field({ description: '로그인 ID' })
  loginId: string;

  @Field({ description: '비밀번호' })
  password: string;
}
```

**Step 2: TotpVerifyInput 변경**

`apps/gateway/src/auth-proxy/dto/totp-verify.input.ts`:

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class TotpVerifyInput {
  @Field({ description: 'TOTP 6자리 코드' })
  totpCode: string;
}
```

**Step 3: ChangePasswordInput 생성**

`apps/gateway/src/auth-proxy/dto/change-password.input.ts`:

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ChangePasswordInput {
  @Field({ description: '현재 비밀번호' })
  currentPassword: string;

  @Field({ description: '새 비밀번호' })
  newPassword: string;
}
```

**Step 4: totp-setup.input.ts 삭제**

```bash
rm apps/gateway/src/auth-proxy/dto/totp-setup.input.ts
rm apps/gateway/src/auth-proxy/models/totp-setup-result.model.ts
```

**Step 5: AuthProxyService 변경**

`apps/gateway/src/auth-proxy/auth-proxy.service.ts`:

```typescript
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

const TCP_TIMEOUT = 5000;

@Injectable()
export class AuthProxyService implements OnModuleInit {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  async onModuleInit() {
    try {
      await this.authClient.connect();
    } catch (error) {
      console.warn(
        '⚠️ Auth service not available yet. Will retry on first request.',
      );
    }
  }

  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    return this.sendMessage<AuthResponse>('auth.login', {
      loginId,
      password,
      userType,
    });
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    return this.sendMessage<AuthTokens>('auth.2fa.verify', {
      twoFactorToken,
      totpCode,
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.sendMessage<AuthTokens>('auth.refresh', { refreshToken });
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    return this.sendMessage('auth.password', {
      userId,
      currentPassword,
      newPassword,
    });
  }

  private async sendMessage<T>(pattern: string, data: any): Promise<T> {
    return firstValueFrom(
      this.authClient.send<T>(pattern, data).pipe(
        timeout(TCP_TIMEOUT),
        catchError((error) => {
          throw error;
        }),
      ),
    );
  }
}
```

**Step 6: AuthProxyResolver 변경**

`apps/gateway/src/auth-proxy/auth-proxy.resolver.ts`:

```typescript
import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { AuthProxyService } from './auth-proxy.service';
import { LoginInput } from './dto/login.input';
import { TotpVerifyInput } from './dto/totp-verify.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { ChangePasswordInput } from './dto/change-password.input';
import { LoginResult } from './models/login-result.model';
import { AuthToken } from './models/auth-token.model';
import { Public } from '../auth/public.decorator';

@Resolver()
export class AuthProxyResolver {
  constructor(private readonly authProxyService: AuthProxyService) {}

  @Public()
  @Mutation(() => LoginResult, { description: '로그인' })
  async login(
    @Args('input') input: LoginInput,
    @Context() ctx: any,
  ): Promise<LoginResult> {
    const userType = ctx.req?.headers?.['x-user-type'] ?? '';
    return this.authProxyService.login(
      input.loginId,
      input.password,
      userType,
    );
  }

  @Public()
  @Mutation(() => AuthToken, { description: '2FA TOTP 검증' })
  async verifyTwoFactor(
    @Args('input') input: TotpVerifyInput,
    @Context() ctx: any,
  ): Promise<AuthToken> {
    const twoFactorToken = ctx.req?.headers?.['x-2fa-token'] ?? '';
    return this.authProxyService.verifyTwoFactor(
      twoFactorToken,
      input.totpCode,
    );
  }

  @Public()
  @Mutation(() => AuthToken, { description: '토큰 갱신' })
  async refreshToken(
    @Args('input') input: RefreshTokenInput,
  ): Promise<AuthToken> {
    return this.authProxyService.refreshToken(input.refreshToken);
  }

  @Mutation(() => Boolean, { description: '패스워드 변경' })
  async changePassword(
    @Args('input') input: ChangePasswordInput,
    @Context() ctx: any,
  ): Promise<boolean> {
    const userId = ctx.req?.user?.userId;
    const result = await this.authProxyService.changePassword(
      Number(userId),
      input.currentPassword,
      input.newPassword,
    );
    return result.success;
  }
}
```

**Step 7: 커밋**

```bash
git add apps/gateway/src/auth-proxy/
git commit -m "refactor(gateway): update auth proxy for production login flow"
```

---

### Task 16: 빌드 & 검증

**Step 1: Shared 라이브러리 빌드**

Run: `pnpm nx build shared`
Expected: 성공

**Step 2: Auth 서버 빌드**

Run: `pnpm nx build auth`
Expected: 성공 (타입 에러 없음)

**Step 3: Gateway 빌드**

Run: `pnpm nx build gateway`
Expected: 성공

**Step 4: Mock 모드로 Auth 서버 시작 테스트**

Run: `USE_MOCK_AUTH=true pnpm run start:auth:dev`
Expected: 서버 시작 성공 (DB 연결 없이)

**Step 5: 타입 에러가 있으면 수정 후 커밋**

```bash
git add -A
git commit -m "fix(auth): resolve build errors after production DB integration"
```

---

### Task 17: drizzle.config.ts 업데이트

**Files:**
- Modify: `apps/auth/drizzle.config.ts`

**Step 1: drizzle.config.ts 확인 및 수정**

기존 drizzle.config.ts에서 스키마 경로가 `apps/auth/src/database/schema.ts`를 가리키고 있는지 확인.
`push`, `generate` 명령은 운영 DB 스키마를 변경하지 않도록 **주의**.

> **중요**: 운영 DB에 `drizzle push`나 `drizzle generate` 명령을 실행하면 안 됨. Drizzle은 ORM 매핑 용도로만 사용.

**Step 2: 커밋 (변경 시)**

```bash
git add apps/auth/drizzle.config.ts
git commit -m "chore(auth): update drizzle config for production schema"
```

---

### Task 18: init-auth-db.sql 업데이트 (Swarm 테스트용)

**Files:**
- Modify: `scripts/docker/init-auth-db.sql`

**Step 1: 테스트 DB 초기화 SQL 업데이트**

`scripts/docker/init-auth-db.sql`:

```sql
-- tb_user_group
CREATE TABLE IF NOT EXISTS `tb_user_group` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(30) NOT NULL COMMENT '그룹명',
  `type` varchar(20) NOT NULL COMMENT '그룹 구분',
  `use_yn` varchar(2) NOT NULL COMMENT '사용 여부',
  `email` varchar(400) DEFAULT NULL COMMENT '그룹 대표 이메일',
  `created_adm` varchar(50) NOT NULL COMMENT '생성자',
  `created_at` datetime(6) NOT NULL COMMENT '생성일시',
  `updated_adm` varchar(50) DEFAULT NULL COMMENT '수정자',
  `updated_at` datetime(6) DEFAULT NULL COMMENT '수정일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_user_group_01` (`name`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- tb_account
CREATE TABLE IF NOT EXISTS `tb_account` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(64) DEFAULT NULL COMMENT '이메일',
  `fail_count` int DEFAULT 0 COMMENT '로그인 실패 카운트',
  `last_login_at` datetime(6) DEFAULT NULL COMMENT '마지막 로그인 시간',
  `login_id` varbinary(63) NOT NULL COMMENT '로그인 ID',
  `name` varchar(255) DEFAULT NULL COMMENT '이름',
  `user_type` varchar(20) NOT NULL COMMENT '사용자 계정 구분',
  `password` varchar(255) DEFAULT NULL COMMENT '비밀번호 [암호화]',
  `status` varchar(255) DEFAULT NULL COMMENT '사용자 상태',
  `otp_secret_key` varchar(20) DEFAULT NULL COMMENT '사용자별 OTP 암호키',
  `customer_no` varchar(40) DEFAULT NULL COMMENT '고객사 번호',
  `last_password_changed_at` datetime(6) DEFAULT NULL COMMENT '마지막 패스워드 변경 일시',
  `updated_at` datetime(6) DEFAULT NULL COMMENT '수정일시',
  `ktms_access_yn` varchar(2) DEFAULT NULL COMMENT 'KTMS 접근 가능 여부',
  `user_group_id` bigint DEFAULT NULL COMMENT '유저 그룹 ID',
  `role_type` varchar(20) DEFAULT NULL COMMENT '유저 권한 구분',
  `menu_group_id` bigint DEFAULT NULL COMMENT '메뉴 권한 그룹 ID',
  `cash_courier_yn` varchar(3) NOT NULL DEFAULT 'N' COMMENT '현금 수송 담당자 여부',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_account_01` (`login_id`,`user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 테스트용 계정 데이터 (패스워드: admin123 → bcryptjs hash)
INSERT INTO `tb_user_group` (`id`, `name`, `type`, `use_yn`, `created_adm`, `created_at`)
VALUES (1, 'Admin Group', 'ADMIN_BO', 'Y', 'system', NOW());

INSERT INTO `tb_account` (`login_id`, `name`, `user_type`, `password`, `status`, `role_type`, `customer_no`, `user_group_id`, `otp_secret_key`, `last_password_changed_at`, `created_at`)
VALUES
  ('admin', '관리자', 'ADMIN_BO', '{bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ACTIVE', 'ADMIN', 'C001', 1, 'JBSWY3DPEHPK3PXP', NOW(), NOW()),
  ('dashboard', '대시보드', 'DASHBOARD', '{bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ACTIVE', 'VIEWER', 'C002', 1, NULL, NOW(), NOW());
```

> **참고**: 위 bcrypt 해시는 예시. 실제 테스트 시 `bcryptjs.hashSync('admin123', 10)`으로 생성한 해시로 교체 필요.

**Step 2: 커밋**

```bash
git add scripts/docker/init-auth-db.sql
git commit -m "chore: update init-auth-db.sql for production schema (tb_account, tb_user_group)"
```

---

### Task 19: CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Auth 서버 관련 섹션 업데이트**

CLAUDE.md에서 다음 섹션들을 업데이트:
- 디렉토리 구조: `user/` → `account/`, `token/` 제거, `enums/`, `constants/`, `filters/` 추가
- Auth 서버 REST API 테이블: 새 엔드포인트로 변경
- JWT payload 설명 변경
- 인증 아키텍처: Spring bcrypt 호환, user_type 기반 2FA 정책 설명 추가

**Step 2: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for production auth integration"
```
