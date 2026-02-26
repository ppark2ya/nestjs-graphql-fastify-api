# Login Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** IMQA 스타일의 2분할 레이아웃(좌측 CSS 애니메이션 + 우측 로그인 폼)으로 로그인 페이지를 리디자인하고 모바일 반응형을 지원한다.

**Architecture:** 기존 `LoginPage.tsx`의 비즈니스 로직(credentials → OTP 전환)을 그대로 유지하면서 레이아웃 구조만 변경한다. Card 래퍼를 제거하고 전체 화면 2분할 레이아웃으로 전환한다. 좌측 애니메이션은 `index.css`에 `@keyframes`로 구현하고 Tailwind 유틸리티 클래스로 배치한다.

**Tech Stack:** React 19, Tailwind CSS 4, shadcn/ui, CSS @keyframes (외부 의존성 없음)

---

### Task 1: CSS 애니메이션 키프레임 및 도형 스타일 추가

**Files:**
- Modify: `apps/ui/src/index.css:52` (끝부분에 추가)

**Step 1: index.css에 @keyframes 및 로그인 애니메이션 스타일 추가**

`apps/ui/src/index.css`의 `@layer base { ... }` 블록 뒤에 다음을 추가:

```css
/* Login page animations */
@keyframes login-float-1 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-30px) rotate(8deg); }
}

@keyframes login-float-2 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(-6deg); }
}

@keyframes login-float-3 {
  0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
  50% { transform: translateY(-25px) rotate(12deg) scale(1.05); }
}

@keyframes login-glow-drift {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(30px, -20px); }
  66% { transform: translate(-20px, 15px); }
}

.login-shape {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
}
```

**Step 2: 빌드 확인**

Run: `cd C:/Users/jtpark/workspace/nestjs-graphql-fastify-api && npx nx build ui --skip-nx-cache 2>&1 | tail -5`
Expected: 빌드 성공 (CSS 파싱 에러 없음)

**Step 3: Commit**

```bash
git add apps/ui/src/index.css
git commit -m "style(ui): add CSS keyframes for login page animations"
```

---

### Task 2: LoginPage.tsx 레이아웃을 2분할 구조로 변경

**Files:**
- Modify: `apps/ui/src/pages/LoginPage.tsx`

**Step 1: import 정리 — Card 제거**

`LoginPage.tsx`에서 Card import를 제거:

```tsx
// 제거:
import { Card, CardContent } from '@/components/ui/card';
```

**Step 2: 최외곽 레이아웃을 2분할 구조로 변경**

현재 return문 (line 99~267)을 전체 교체. 비즈니스 로직(state, handlers)은 변경 없음.

```tsx
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left: Animation Panel — hidden on mobile */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 relative overflow-hidden items-center justify-center"
           style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 50%, #1e3a5f 100%)' }}>
        {/* Glow effects */}
        <div className="absolute w-80 h-80 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', top: '10%', left: '10%', animation: 'login-glow-drift 15s ease-in-out infinite' }} />
        <div className="absolute w-96 h-96 rounded-full opacity-15"
             style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)', bottom: '10%', right: '5%', animation: 'login-glow-drift 20s ease-in-out infinite reverse' }} />

        {/* Floating shapes */}
        <div className="login-shape w-16 h-16 rounded-full"
             style={{ top: '15%', left: '20%', animation: 'login-float-1 10s ease-in-out infinite' }} />
        <div className="login-shape w-20 h-20 rounded-lg rotate-45"
             style={{ top: '60%', left: '15%', animation: 'login-float-2 14s ease-in-out infinite' }} />
        <div className="login-shape w-12 h-12 rotate-45"
             style={{ top: '25%', right: '20%', animation: 'login-float-3 8s ease-in-out infinite' }} />
        <div className="login-shape w-24 h-24 rounded-full"
             style={{ bottom: '20%', right: '25%', animation: 'login-float-1 18s ease-in-out infinite 2s' }} />
        <div className="login-shape w-10 h-10 rounded-lg"
             style={{ top: '45%', left: '50%', animation: 'login-float-2 12s ease-in-out infinite 1s' }} />
        <div className="login-shape w-14 h-14 rounded-full"
             style={{ bottom: '35%', left: '35%', animation: 'login-float-3 16s ease-in-out infinite 3s' }} />
      </div>

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center bg-background px-4 py-8 md:py-0">
        <div data-testid="login-card" className="w-full max-w-sm">
          <div className="relative overflow-hidden px-1 -mx-1">
            {/* Step 1: Credentials */}
            <div
              className={`transition-all duration-300 ${
                step === 'credentials'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-full absolute inset-0'
              }`}
            >
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  시스템 로그인
                </h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label
                    htmlFor="loginId"
                    className="text-muted-foreground mb-1 block"
                  >
                    사용자 ID
                  </Label>
                  <Input
                    id="loginId"
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    autoComplete="username"
                    autoFocus
                    className="bg-secondary py-2.5 h-auto"
                    placeholder="사용자 ID 입력"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="password"
                    className="text-muted-foreground mb-1 block"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="bg-secondary py-2.5 h-auto pr-10"
                      placeholder="비밀번호 입력"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={
                        showPassword ? '비밀번호 숨기기' : '비밀번호 표시'
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loginLoading || !loginId || !password}
                  className="w-full"
                >
                  {loginLoading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  로그인
                </Button>
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
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  2단계 인증
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Google OTP 앱의 6자리 코드를 입력하세요
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={verifyLoading}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>

                <Button
                  type="submit"
                  disabled={
                    verifyLoading || otpCode.length < 6
                  }
                  className="w-full"
                >
                  {verifyLoading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  인증하기
                </Button>

                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleBack}
                  className="w-full text-muted-foreground"
                >
                  &larr; 돌아가기
                </Button>
              </form>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
```

주요 변경사항:
- 최외곽: `min-h-screen flex flex-col md:flex-row` (모바일: 세로, 태블릿+: 가로)
- 좌측 패널: `hidden md:flex md:w-2/5 lg:w-1/2` (모바일 숨김, 태블릿 40%, 데스크탑 50%)
- 우측 폼: `flex-1 flex items-center justify-center bg-background`
- `Card`/`CardContent` 래퍼 제거, `data-testid="login-card"`은 내부 div에 유지
- 폼 내부 구조/클래스 동일

**Step 3: 빌드 확인**

Run: `cd C:/Users/jtpark/workspace/nestjs-graphql-fastify-api && npx nx build ui --skip-nx-cache 2>&1 | tail -5`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add apps/ui/src/pages/LoginPage.tsx
git commit -m "feat(ui): redesign login page with split-panel layout and CSS animations"
```

---

### Task 3: E2E 테스트 업데이트

**Files:**
- Modify: `apps/ui/e2e/login.spec.ts`

**Step 1: 모바일 반응형 테스트 업데이트**

현재 E2E 테스트 (line 41~47)의 모바일 테스트가 Card bounding box를 체크하는데, Card가 제거되었으므로 `data-testid="login-card"` div의 bounding box로 변경. 이 `data-testid`는 Task 2에서 유지했으므로 테스트 셀렉터는 동일.

다만, 2분할 레이아웃에서 데스크탑 뷰포트 기본 테스트가 동작하는지 확인 필요.

`login.spec.ts`의 모바일 테스트를 다음으로 교체 (line 41~47):

```typescript
  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    // On mobile, the animation panel should be hidden and form fills the screen
    const formArea = page.getByTestId('login-card');
    const box = await formArea.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
```

**Step 2: 데스크탑 2분할 레이아웃 확인 테스트 추가**

`login.spec.ts`의 모바일 테스트 뒤, `OTP Input` describe 전에 추가:

```typescript
  test('should show split layout on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    // Animation panel should be visible on desktop
    const formArea = page.getByTestId('login-card');
    const box = await formArea.boundingBox();
    // Form should take roughly half the screen (not the full width)
    expect(box!.width).toBeLessThan(640);
  });
```

**Step 3: Commit**

```bash
git add apps/ui/e2e/login.spec.ts
git commit -m "test(ui): update login E2E tests for split-panel layout"
```

---

### Task 4: 시각적 확인 및 미세 조정

**Step 1: 개발 서버 실행하여 시각적 확인**

Run: `cd C:/Users/jtpark/workspace/nestjs-graphql-fastify-api && npx nx serve ui`

브라우저에서 `http://localhost:5173/login` 접속하여 확인:
- [ ] 데스크탑(1280px+): 좌측 애니메이션 패널 + 우측 로그인 폼 2분할
- [ ] 태블릿(768~1023px): 좌측 40% + 우측 60%
- [ ] 모바일(375px): 애니메이션 패널 숨김, 폼만 전체 화면
- [ ] 도형 6개가 부유하는 애니메이션 동작
- [ ] 글로우 효과가 은은하게 이동
- [ ] 로그인 폼 기능 정상 (입력, 비밀번호 토글, 버튼 활성화)
- [ ] OTP 단계 전환 애니메이션 정상

**Step 2: 필요 시 미세 조정**

도형 크기, 위치, 애니메이션 속도, 글로우 opacity 등을 시각적 결과에 따라 조정.

**Step 3: 최종 Commit (조정사항이 있는 경우)**

```bash
git add apps/ui/src/pages/LoginPage.tsx apps/ui/src/index.css
git commit -m "style(ui): fine-tune login page animations and layout"
```
