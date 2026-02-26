import { useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  LOGIN_MUTATION,
  VERIFY_TWO_FACTOR_MUTATION,
  type LoginResponse,
  type VerifyTwoFactorResponse,
} from '@/auth/graphql';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';

type Step = 'credentials' | 'otp';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [loginMutation, { loading: loginLoading }] =
    useMutation<LoginResponse>(LOGIN_MUTATION);
  const [verifyMutation, { loading: verifyLoading }] =
    useMutation<VerifyTwoFactorResponse>(VERIFY_TWO_FACTOR_MUTATION);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await loginMutation({
        variables: { input: { loginId, password } },
      });
      if (!data?.login) {
        setError('로그인에 실패했습니다.');
        return;
      }

      if (data.login.requiresTwoFactor) {
        const token2fa = data.login.twoFactorToken!;
        setTwoFactorToken(token2fa);
        localStorage.setItem('twoFactorToken', token2fa);
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
        variables: { input: { totpCode: otpCode } },
      });
      if (!data?.verifyTwoFactor) {
        setError('인증에 실패했습니다.');
        return;
      }
      localStorage.removeItem('twoFactorToken');
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
    localStorage.removeItem('twoFactorToken');
    setError('');
  };

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
}
