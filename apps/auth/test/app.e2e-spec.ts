import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import * as bcryptjs from 'bcryptjs';
import { authenticator } from 'otplib';
import {
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  decodeJwt,
  SignJWT,
} from 'jose';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtTokenService } from '../src/auth/jwt.service';
import { TotpService } from '../src/auth/totp.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { AccountService } from '../src/account/account.service';
import {
  LoginHistoryService,
  type LoginRequestMeta,
} from '../src/login-history/login-history.service';

const OTP_SECRET = 'JBSWY3DPEHPK3PXP';
const TEST_PASSWORD = 'password123';

interface TestAccount {
  id: number;
  loginId: Buffer;
  password: string;
  name: string | null;
  userType: string;
  roleType: string | null;
  customerNo: string | null;
  status: string | null;
  otpSecretKey: string | null;
  failCount: number | null;
  lastPasswordChangedAt: Date | null;
  lastLoginAt: Date | null;
  email: string | null;
}

interface TestLoginHistory {
  loginId: string;
  accountId: number;
  addrIp: string;
  failCount: number;
  status: string | null;
  accessChannel: string | null;
  loginAt: Date | null;
  failedAt: Date | null;
}

function createTestAccounts(): TestAccount[] {
  const hash = bcryptjs.hashSync(TEST_PASSWORD, 10);
  const pw = `{bcrypt}${hash}`;

  return [
    {
      id: 1,
      loginId: Buffer.from('admin'),
      password: pw,
      name: '관리자',
      userType: 'ADMIN_BO',
      roleType: 'ADMIN',
      customerNo: 'C001',
      status: 'ACTIVE',
      otpSecretKey: OTP_SECRET,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: new Date(),
      email: null,
    },
    {
      id: 2,
      loginId: Buffer.from('dashboard'),
      password: pw,
      name: '대시보드',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: 'C002',
      status: 'ACTIVE',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 9,
      loginId: Buffer.from('lottecard'),
      password: pw,
      name: '롯데카드',
      userType: 'LOTTE_CARD_BO',
      roleType: null,
      customerNo: 'LC001',
      status: 'ACTIVE',
      otpSecretKey: OTP_SECRET,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: new Date(),
      email: null,
    },
    {
      id: 10,
      loginId: Buffer.from('newadmin'),
      password: pw,
      name: '신규관리자',
      userType: 'ADMIN_BO',
      roleType: 'ADMIN',
      customerNo: 'C010',
      status: 'ACTIVE',
      otpSecretKey: null,
      failCount: 2,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 11,
      loginId: Buffer.from('otpreset'),
      password: pw,
      name: 'OTP초기화',
      userType: 'ADMIN_BO',
      roleType: 'ADMIN',
      customerNo: 'C011',
      status: 'ACTIVE',
      otpSecretKey: null,
      failCount: 1,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: new Date(),
      email: null,
    },
    {
      id: 12,
      loginId: Buffer.from('legacyadmin'),
      password: pw,
      name: '레거시관리자',
      userType: 'ADMIN_BO',
      roleType: 'ADMIN',
      customerNo: 'C012',
      status: 'ACTIVE',
      otpSecretKey: OTP_SECRET,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 3,
      loginId: Buffer.from('pending'),
      password: pw,
      name: '대기중',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'PENDING',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 4,
      loginId: Buffer.from('inactive'),
      password: pw,
      name: '비활성',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'IN_ACTIVE',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 5,
      loginId: Buffer.from('deleted'),
      password: pw,
      name: '삭제됨',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'DELETE',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 6,
      loginId: Buffer.from('locked'),
      password: pw,
      name: '잠김',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'LOCKED',
      otpSecretKey: null,
      failCount: 5,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 7,
      loginId: Buffer.from('expired'),
      password: pw,
      name: '패스워드만료',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'ACTIVE',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      lastLoginAt: null,
      email: null,
    },
    {
      id: 8,
      loginId: Buffer.from('locktest'),
      password: pw,
      name: '잠금테스트',
      userType: 'DASHBOARD',
      roleType: 'MEMBER',
      customerNo: null,
      status: 'ACTIVE',
      otpSecretKey: null,
      failCount: 0,
      lastPasswordChangedAt: new Date(),
      lastLoginAt: null,
      email: null,
    },
  ];
}

class TestAccountService {
  private accounts: TestAccount[];

  constructor() {
    this.reset();
  }

  reset() {
    this.accounts = createTestAccounts();
  }

  async findByLoginIdAndUserType(loginId: string, userType: string) {
    return (
      this.accounts.find(
        (a) =>
          a.loginId.toString('utf8') === loginId && a.userType === userType,
      ) ?? null
    );
  }

  async findById(id: number) {
    return this.accounts.find((a) => a.id === id) ?? null;
  }

  async incrementFailCount(accountId: number) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.failCount = (account.failCount ?? 0) + 1;
    }
  }

  async lockAccount(accountId: number) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.status = 'LOCKED';
    }
  }

  async resetFailCount(accountId: number) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.failCount = 0;
    }
  }

  async resetFailCountAndUpdateLoginAt(accountId: number) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.failCount = 0;
      account.lastLoginAt = new Date();
    }
  }

  async updateOtpSecretKey(accountId: number, otpSecretKey: string) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.otpSecretKey = otpSecretKey;
    }
  }

  async updatePassword(accountId: number, hashedPassword: string) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.password = hashedPassword;
      account.lastPasswordChangedAt = new Date();
    }
  }

  updateTokenClaims(
    accountId: number,
    patch: Partial<Pick<TestAccount, 'loginId' | 'name' | 'roleType'>>,
  ) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      Object.assign(account, patch);
    }
  }
}

class TestLoginHistoryService {
  private histories: TestLoginHistory[] = [];

  reset() {
    this.histories = [];
  }

  getAll() {
    return this.histories;
  }

  async recordSuccess(
    account: TestAccount,
    meta: LoginRequestMeta,
    loginAt = new Date(),
  ) {
    account.failCount = 0;
    account.lastLoginAt = loginAt;
    this.histories.push({
      loginId: account.loginId.toString('utf8'),
      accountId: account.id,
      addrIp: meta.clientIp?.trim() || 'unknown',
      failCount: 0,
      status: account.status,
      accessChannel: meta.accessChannel ?? null,
      loginAt,
      failedAt: null,
    });
  }

  async recordFailure(
    account: TestAccount,
    meta: LoginRequestMeta,
    failCount: number,
    status: string | null,
    failedAt = new Date(),
  ) {
    this.histories.push({
      loginId: account.loginId.toString('utf8'),
      accountId: account.id,
      addrIp: meta.clientIp?.trim() || 'unknown',
      failCount,
      status,
      accessChannel: meta.accessChannel ?? null,
      loginAt: null,
      failedAt,
    });
  }
}

describe('Auth E2E - Full Login Process', () => {
  let app: NestFastifyApplication;
  let testAccountService: TestAccountService;
  let testLoginHistoryService: TestLoginHistoryService;
  let tmpKeyDir: string;

  beforeAll(async () => {
    // 1. Generate RSA key pair
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const privatePem = await exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);

    // 2. Write keys to temp directory
    tmpKeyDir = join(tmpdir(), `auth-e2e-keys-${randomUUID()}`);
    mkdirSync(tmpKeyDir, { recursive: true });
    writeFileSync(join(tmpKeyDir, 'private.pem'), privatePem);
    writeFileSync(join(tmpKeyDir, 'public.pem'), publicPem);

    // 3. Set environment variables for JWT key paths
    process.env.JWT_PRIVATE_KEY_PATH = join(tmpKeyDir, 'private.pem');
    process.env.JWT_PUBLIC_KEY_PATH = join(tmpKeyDir, 'public.pem');

    // 4. Create test account service (in-memory mock)
    testAccountService = new TestAccountService();
    testLoginHistoryService = new TestLoginHistoryService();

    // 5. Build test module (real services, mock DB)
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PassportModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: AccountService, useValue: testAccountService },
        { provide: LoginHistoryService, useValue: testLoginHistoryService },
        JwtTokenService,
        TotpService,
        JwtStrategy,
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
    rmSync(tmpKeyDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testAccountService.reset();
    testLoginHistoryService.reset();
  });

  // ─── POST /auth/login ───────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('DASHBOARD 로그인 (2FA 불필요) → 토큰 즉시 발급', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .set('x-forwarded-for', '203.0.113.10, 10.0.0.1')
        .set('x-forwarded-host', 'abc.mx-dozn.co.kr')
        .set('x-forwarded-proto', 'https')
        .set('x-access-channel', 'https://legacy-channel.example.com')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      expect(res.body.requiresTwoFactor).toBe(false);
      expect(res.body.tokens).toBeDefined();
      expect(res.body.tokens.accessToken).toBeDefined();
      expect(res.body.tokens.refreshToken).toBeDefined();
      expect(res.body.tokens.expiresIn).toBeDefined();

      const histories = testLoginHistoryService.getAll();
      expect(histories).toHaveLength(1);
      expect(histories[0]).toMatchObject({
        loginId: 'dashboard',
        accountId: 2,
        addrIp: '203.0.113.10',
        failCount: 0,
        status: 'ACTIVE',
        accessChannel: 'https://abc.mx-dozn.co.kr',
        failedAt: null,
      });
      expect(histories[0].loginAt).toBeInstanceOf(Date);
    });

    it('forwarded/origin/referer가 없으면 x-access-channel origin을 fallback으로 저장한다', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .set('x-access-channel', 'https://fallback.mx-dozn.co.kr/login?next=/')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      const histories = testLoginHistoryService.getAll();
      expect(histories).toHaveLength(1);
      expect(histories[0]).toMatchObject({
        loginId: 'dashboard',
        accessChannel: 'https://fallback.mx-dozn.co.kr',
      });
    });

    it('LOTTE_CARD_BO 로그인 (2FA 필요) → twoFactorToken 반환', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.twoFactorToken).toBeDefined();
      expect(res.body.tOtpUrl).toBeNull();
      expect(res.body.tokens).toBeUndefined();
      expect(testLoginHistoryService.getAll()).toHaveLength(0);
    });

    it('OTP 키와 마지막 로그인 시간이 없으면 tOtpUrl을 반환하고 OTP 키를 저장한다', async () => {
      const beforeAccount = await testAccountService.findByLoginIdAndUserType(
        'newadmin',
        'ADMIN_BO',
      );
      expect(beforeAccount?.otpSecretKey).toBeNull();
      expect(beforeAccount?.lastLoginAt).toBeNull();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'newadmin', password: TEST_PASSWORD })
        .expect(201);

      const afterAccount = await testAccountService.findByLoginIdAndUserType(
        'newadmin',
        'ADMIN_BO',
      );
      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.twoFactorToken).toBeDefined();
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('otpauth://'));
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('issuer=MX_ADMIN'));
      expect(decodeURIComponent(res.body.tOtpUrl)).toEqual(
        expect.stringContaining('MX_ADMIN:신규관리자'),
      );
      expect(afterAccount?.otpSecretKey).toEqual(expect.any(String));
      expect(afterAccount?.lastLoginAt).toBeNull();
      expect(afterAccount?.failCount).toBe(0);
    });

    it('OTP 키만 없으면 OR 정책에 따라 tOtpUrl을 반환하고 OTP 키를 저장한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'otpreset', password: TEST_PASSWORD })
        .expect(201);

      const account = await testAccountService.findByLoginIdAndUserType(
        'otpreset',
        'ADMIN_BO',
      );
      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('otpauth://'));
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('issuer=MX_ADMIN'));
      expect(decodeURIComponent(res.body.tOtpUrl)).toEqual(
        expect.stringContaining('MX_ADMIN:OTP초기화'),
      );
      expect(account?.otpSecretKey).toEqual(expect.any(String));
      expect(account?.lastLoginAt).toBeInstanceOf(Date);
    });

    it('마지막 로그인 시간만 없으면 OR 정책에 따라 OTP 키를 재생성하고 tOtpUrl을 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'legacyadmin', password: TEST_PASSWORD })
        .expect(201);

      const account = await testAccountService.findByLoginIdAndUserType(
        'legacyadmin',
        'ADMIN_BO',
      );
      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('otpauth://'));
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('issuer=MX_ADMIN'));
      expect(decodeURIComponent(res.body.tOtpUrl)).toEqual(
        expect.stringContaining('MX_ADMIN:레거시관리자'),
      );
      expect(account?.otpSecretKey).toEqual(expect.any(String));
      expect(account?.otpSecretKey).not.toBe(OTP_SECRET);
      expect(account?.lastLoginAt).toBeNull();
    });

    it('OTP 등록 URL은 이름이 없으면 loginId를 label fallback으로 사용한다', async () => {
      testAccountService.updateTokenClaims(10, { name: null });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'newadmin', password: TEST_PASSWORD })
        .expect(201);

      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('otpauth://'));
      expect(res.body.tOtpUrl).toEqual(expect.stringContaining('issuer=MX_ADMIN'));
      expect(decodeURIComponent(res.body.tOtpUrl)).toEqual(
        expect.stringContaining('MX_ADMIN:newadmin'),
      );
    });

    it('잘못된 비밀번호 → 11010 INVALID_CREDENTIALS', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .set('x-forwarded-for', '198.51.100.10')
        .send({ loginId: 'dashboard', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.code).toBe('11010');
      expect(res.body.message).toBeDefined();
      expect(res.body.timestamp).toBeDefined();

      const histories = testLoginHistoryService.getAll();
      expect(histories).toHaveLength(1);
      expect(histories[0]).toMatchObject({
        loginId: 'dashboard',
        accountId: 2,
        addrIp: '198.51.100.10',
        failCount: 1,
        status: 'ACTIVE',
        loginAt: null,
      });
      expect(histories[0].failedAt).toBeInstanceOf(Date);
    });

    it('존재하지 않는 계정 → 11010 INVALID_CREDENTIALS', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'nonexistent', password: TEST_PASSWORD })
        .expect(401);

      expect(res.body.code).toBe('11010');
    });

    it('PENDING 계정 → 11001 ACCOUNT_PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'pending', password: TEST_PASSWORD })
        .expect(400);

      expect(res.body.code).toBe('11001');
    });

    it('IN_ACTIVE 계정 → 11002 ACCOUNT_INACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'inactive', password: TEST_PASSWORD })
        .expect(400);

      expect(res.body.code).toBe('11002');
    });

    it('DELETE 계정 → 11003 ACCOUNT_DELETED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'deleted', password: TEST_PASSWORD })
        .expect(401);

      expect(res.body.code).toBe('11003');
    });

    it('LOCKED 계정 → 11005 ACCOUNT_LOCKED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'locked', password: TEST_PASSWORD })
        .expect(403);

      expect(res.body.code).toBe('11005');
    });

    it('패스워드 만료 (90일 경과) → 11004 PASSWORD_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'expired', password: TEST_PASSWORD })
        .expect(400);

      expect(res.body.code).toBe('11004');
      expect(res.body.passwordChangeToken).toEqual(expect.any(String));
      expect(res.body.tokens).toBeUndefined();
      expect(res.body.twoFactorToken).toBeUndefined();
      expect(testLoginHistoryService.getAll()).toHaveLength(0);
    });

    it('loginId 누락 → 400 Validation Error', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ password: TEST_PASSWORD })
        .expect(400);
    });

    it('password 누락 → 400 Validation Error', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard' })
        .expect(400);
    });
  });

  // ─── Account Locking (fail_count) ──────────────────────────────

  describe('Account Locking', () => {
    it('5회 연속 로그인 실패 → 계정 잠금', async () => {
      // 1~4회: INVALID_CREDENTIALS
      for (let i = 1; i <= 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-user-type', 'DASHBOARD')
          .send({ loginId: 'locktest', password: 'wrong' })
          .expect(401);
      }

      // 5회: INVALID_CREDENTIALS (이 시점에 계정 잠금 처리됨)
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'locktest', password: 'wrong' })
        .expect(401);

      // 6회: ACCOUNT_LOCKED
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'locktest', password: TEST_PASSWORD })
        .expect(403);

      expect(res.body.code).toBe('11005');

      const histories = testLoginHistoryService.getAll();
      expect(histories).toHaveLength(6);
      expect(histories[4]).toMatchObject({
        loginId: 'locktest',
        failCount: 5,
        status: 'LOCKED',
        loginAt: null,
      });
      expect(histories[5]).toMatchObject({
        loginId: 'locktest',
        failCount: 5,
        status: 'LOCKED',
        loginAt: null,
      });
    });
  });

  // ─── POST /auth/2fa/verify ─────────────────────────────────────

  describe('POST /auth/2fa/verify', () => {
    it('유효한 TOTP 코드 → 토큰 발급', async () => {
      // Step 1: LOTTE_CARD_BO 로그인 → twoFactorToken 받기
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      const twoFactorToken = loginRes.body.twoFactorToken;
      expect(twoFactorToken).toBeDefined();

      // Step 2: TOTP 코드 생성 및 검증
      const totpCode = authenticator.generate(OTP_SECRET);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', twoFactorToken)
        .set('x-real-ip', '203.0.113.20')
        .set('x-forwarded-host', 'abc.mx-dozn.co.kr')
        .set('x-forwarded-proto', 'https')
        .set('x-access-channel', 'https://legacy-channel.example.com')
        .send({ totpCode })
        .expect(201);

      expect(verifyRes.body.accessToken).toBeDefined();
      expect(verifyRes.body.refreshToken).toBeDefined();
      expect(verifyRes.body.expiresIn).toBeDefined();

      const payload = decodeJwt(verifyRes.body.accessToken);
      expect(payload.iss).toBe('auth-server');
      expect(payload.sub).toBe('9');
      expect(payload.loginId).toBe('lottecard');
      expect(payload.name).toBe('롯데카드');
      expect(payload.userType).toBe('LOTTE_CARD_BO');
      expect(payload.roleType).toBeUndefined();
      expect(payload.jti).toEqual(expect.any(String));

      const histories = testLoginHistoryService.getAll();
      expect(histories).toHaveLength(1);
      expect(histories[0]).toMatchObject({
        loginId: 'lottecard',
        accountId: 9,
        addrIp: '203.0.113.20',
        failCount: 0,
        status: 'ACTIVE',
        accessChannel: 'https://abc.mx-dozn.co.kr',
        failedAt: null,
      });
      expect(histories[0].loginAt).toBeInstanceOf(Date);
    });

    it('2FA 필요 계정은 2FA 검증 성공 후 lastLoginAt을 갱신한다', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'newadmin', password: TEST_PASSWORD })
        .expect(201);

      const beforeVerify = await testAccountService.findByLoginIdAndUserType(
        'newadmin',
        'ADMIN_BO',
      );
      expect(beforeVerify?.lastLoginAt).toBeNull();
      expect(beforeVerify?.otpSecretKey).toEqual(expect.any(String));

      const totpCode = authenticator.generate(beforeVerify!.otpSecretKey!);
      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const afterVerify = await testAccountService.findByLoginIdAndUserType(
        'newadmin',
        'ADMIN_BO',
      );
      expect(afterVerify?.lastLoginAt).toBeInstanceOf(Date);
    });

    it('ADMIN_BO 계정은 roleType을 포함해 토큰 발급', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'admin', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(verifyRes.body.accessToken);
      expect(payload.userType).toBe('ADMIN_BO');
      expect(payload.roleType).toBe('ADMIN');
    });

    it('ADMIN_BO 계정의 roleType이 없으면 claim을 생략하고 토큰 발급', async () => {
      testAccountService.updateTokenClaims(1, { roleType: null });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'admin', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(res.body.accessToken);
      expect(payload.userType).toBe('ADMIN_BO');
      expect(payload.roleType).toBeUndefined();
    });

    it('ADMIN_BO 계정의 roleType이 공백이면 claim을 생략하고 토큰 발급', async () => {
      testAccountService.updateTokenClaims(1, { roleType: '   ' });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'admin', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(res.body.accessToken);
      expect(payload.userType).toBe('ADMIN_BO');
      expect(payload.roleType).toBeUndefined();
    });

    it('ADMIN_BO 계정의 roleType이 Spring 호환 목록 밖이면 claim을 생략하고 토큰 발급', async () => {
      testAccountService.updateTokenClaims(1, { roleType: 'VIEWER' });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'ADMIN_BO')
        .send({ loginId: 'admin', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(res.body.accessToken);
      expect(payload.userType).toBe('ADMIN_BO');
      expect(payload.roleType).toBeUndefined();
    });

    it('roleType 공백 LOTTE_CARD_BO 계정 → 토큰 발급', async () => {
      testAccountService.updateTokenClaims(9, { roleType: '   ' });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(verifyRes.body.accessToken);
      expect(payload.userType).toBe('LOTTE_CARD_BO');
      expect(payload.roleType).toBeUndefined();
    });

    it('LOTTE_CARD_BO 계정의 roleType이 Spring 호환 목록 밖이면 claim을 생략하고 토큰 발급', async () => {
      testAccountService.updateTokenClaims(9, { roleType: 'VIEWER' });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const payload = decodeJwt(res.body.accessToken);
      expect(payload.roleType).toBeUndefined();
    });

    it('name 누락 계정은 2FA 검증 후 11013 INVALID_TOKEN_CLAIMS', async () => {
      testAccountService.updateTokenClaims(9, { name: null });
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(500);

      expect(res.body.code).toBe('11013');
    });

    it('loginId 공백 계정은 2FA 검증 후 11013 INVALID_TOKEN_CLAIMS', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      testAccountService.updateTokenClaims(9, {
        loginId: Buffer.from('   '),
      });
      const totpCode = authenticator.generate(OTP_SECRET);
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode })
        .expect(500);

      expect(res.body.code).toBe('11013');
    });

    it('non-production 환경에서는 잘못된 6자리 TOTP 코드도 값 검증 없이 토큰 발급', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      try {
        const res = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .set('x-2fa-token', loginRes.body.twoFactorToken)
          .send({ totpCode: '000000' })
          .expect(201);

        expect(res.body.accessToken).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('production 환경에서는 잘못된 TOTP 코드 → 11011 INVALID_OTP', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const loginRes = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-user-type', 'LOTTE_CARD_BO')
          .send({ loginId: 'lottecard', password: TEST_PASSWORD })
          .expect(201);

        const res = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .set('x-2fa-token', loginRes.body.twoFactorToken)
          .send({ totpCode: '000000' })
          .expect(401);

        expect(res.body.code).toBe('11011');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('잘못된 2FA 토큰 → 11012 TOKEN_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', 'invalid.token.here')
        .send({ totpCode: '123456' })
        .expect(401);

      expect(res.body.code).toBe('11012');
    });

    it('totpCode 형식 오류 (6자리 숫자가 아님) → 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', loginRes.body.twoFactorToken)
        .send({ totpCode: 'abc' })
        .expect(400);
    });
  });

  // ─── POST /auth/refresh ────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('유효한 refresh token → 새 토큰 발급', async () => {
      // Step 1: 로그인하여 토큰 받기
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      const refreshToken = loginRes.body.tokens.refreshToken;

      // Step 2: refresh
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(refreshRes.body.accessToken).toBeDefined();
      expect(refreshRes.body.refreshToken).toBeDefined();
      expect(refreshRes.body.expiresIn).toBeDefined();
      // 새 토큰은 이전 토큰과 달라야 함
      expect(refreshRes.body.accessToken).not.toBe(
        loginRes.body.tokens.accessToken,
      );
      expect(testLoginHistoryService.getAll()).toHaveLength(1);
    });

    it('잘못된 refresh token → 11012 TOKEN_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid.refresh.token' })
        .expect(401);

      expect(res.body.code).toBe('11012');
    });

    it('refreshToken 누락 → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // ─── POST /auth/password ───────────────────────────────────────

  describe('POST /auth/password', () => {
    it('패스워드 만료 토큰으로 패스워드 변경 성공', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'expired', password: TEST_PASSWORD })
        .expect(400);

      const passwordChangeToken = loginRes.body.passwordChangeToken;
      expect(passwordChangeToken).toBeDefined();

      const changeRes = await request(app.getHttpServer())
        .post('/auth/password')
        .set('x-password-change-token', passwordChangeToken)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(201);

      expect(changeRes.body.success).toBe(true);
      expect(testLoginHistoryService.getAll()).toHaveLength(0);

      const reLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'expired', password: 'newpass1234' })
        .expect(201);

      expect(reLoginRes.body.requiresTwoFactor).toBe(false);
      expect(reLoginRes.body.tokens.accessToken).toBeDefined();
      expect(testLoginHistoryService.getAll()).toHaveLength(1);
    });

    it('잘못된 패스워드 만료 토큰 → 11012 TOKEN_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password')
        .set('x-password-change-token', 'invalid.token.here')
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(401);

      expect(res.body.code).toBe('11012');
    });

    it('2FA 토큰을 패스워드 만료 토큰으로 사용하면 → 11012 TOKEN_EXPIRED', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/password')
        .set('x-password-change-token', loginRes.body.twoFactorToken)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(401);

      expect(res.body.code).toBe('11012');
    });

    it('다른 key로 서명한 패스워드 만료 토큰 → 11012 TOKEN_EXPIRED', async () => {
      const { privateKey: otherPrivateKey } = await generateKeyPair('RS256');
      const passwordChangeToken = await new SignJWT({
        sub: '7',
        type: 'password_change',
        userType: 'DASHBOARD',
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .setIssuer('auth-server')
        .setSubject('7')
        .sign(otherPrivateKey);

      const res = await request(app.getHttpServer())
        .post('/auth/password')
        .set('x-password-change-token', passwordChangeToken)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(401);

      expect(res.body.code).toBe('11012');
    });

    it('패스워드 변경 성공', async () => {
      // Step 1: 로그인
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      const accessToken = loginRes.body.tokens.accessToken;

      // Step 2: 패스워드 변경
      const changeRes = await request(app.getHttpServer())
        .post('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(201);

      expect(changeRes.body.success).toBe(true);
      expect(testLoginHistoryService.getAll()).toHaveLength(1);

      // Step 3: 새 비밀번호로 로그인 성공 확인
      const reLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: 'newpass1234' })
        .expect(201);

      expect(reLoginRes.body.requiresTwoFactor).toBe(false);
      expect(reLoginRes.body.tokens.accessToken).toBeDefined();
      expect(testLoginHistoryService.getAll()).toHaveLength(2);
    });

    it('현재 비밀번호 틀림 → 11010 INVALID_CREDENTIALS', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/password')
        .set('Authorization', `Bearer ${loginRes.body.tokens.accessToken}`)
        .send({ currentPassword: 'wrongcurrent', newPassword: 'newpass1234' })
        .expect(401);

      expect(res.body.code).toBe('11010');
    });

    it('인증 토큰 없이 요청 → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/password')
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newpass1234' })
        .expect(401);
    });

    it('새 비밀번호 8자 미만 → 400 Validation Error', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/password')
        .set('Authorization', `Bearer ${loginRes.body.tokens.accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })
        .expect(400);
    });

    it('새 비밀번호가 8자 이상이지만 영문/숫자/특수문자 조합 정책을 만족하지 않으면 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'DASHBOARD')
        .send({ loginId: 'dashboard', password: TEST_PASSWORD })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/password')
        .set('Authorization', `Bearer ${loginRes.body.tokens.accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'abc12345' })
        .expect(400);

      expect(res.body.message).toContain('올바른 패스워드 형식이 아닙니다.');
    });
  });

  // ─── Full Flow: LOTTE_CARD_BO login → 2FA → refresh → password ─

  describe('Full Flow (LOTTE_CARD_BO)', () => {
    it('로그인 → 2FA 검증 → 토큰 갱신 → 패스워드 변경 전체 플로우', async () => {
      // Step 1: 로그인 (2FA 필요)
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-user-type', 'LOTTE_CARD_BO')
        .send({ loginId: 'lottecard', password: TEST_PASSWORD })
        .expect(201);

      expect(loginRes.body.requiresTwoFactor).toBe(true);
      const twoFactorToken = loginRes.body.twoFactorToken;

      // Step 2: 2FA 검증
      const totpCode = authenticator.generate(OTP_SECRET);
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('x-2fa-token', twoFactorToken)
        .send({ totpCode })
        .expect(201);

      const { accessToken, refreshToken } = verifyRes.body;
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();

      // Step 3: 토큰 갱신
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(refreshRes.body.accessToken).toBeDefined();
      expect(refreshRes.body.refreshToken).toBeDefined();
      expect(testLoginHistoryService.getAll()).toHaveLength(1);

      // Step 4: 패스워드 변경 (Step 2에서 받은 accessToken 사용)
      const changeRes = await request(app.getHttpServer())
        .post('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'newadmin1234' })
        .expect(201);

      expect(changeRes.body.success).toBe(true);
      expect(testLoginHistoryService.getAll()).toHaveLength(1);
    });
  });
});
