import { useAuth } from '@/features/auth/AuthContext';
import {
  LOGIN_MUTATION,
  VERIFY_TWO_FACTOR_MUTATION,
  type LoginResponse,
  type VerifyTwoFactorResponse,
} from '@/features/auth/graphql';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { useMutation } from '@apollo/client/react';
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type Step = 'credentials' | 'otp';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [, setTwoFactorToken] = useState('');
  const [error, setError] = useState('');

  const otpContainerRef = useRef<HTMLDivElement>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ??
    '/admin/live-stream';

  useEffect(() => {
    if (step === 'otp') {
      const timer = setTimeout(() => {
        otpContainerRef.current
          ?.querySelector<HTMLInputElement>('input')
          ?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const [loginMutation, { loading: loginLoading }] =
    useMutation<LoginResponse>(LOGIN_MUTATION);
  const [verifyMutation, { loading: verifyLoading }] =
    useMutation<VerifyTwoFactorResponse>(VERIFY_TWO_FACTOR_MUTATION);

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
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

  const handleVerifyOtp = async (e: React.SubmitEvent<HTMLFormElement>) => {
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Card data-testid="login-card" className="shadow-2xl">
          <CardContent className="p-6 sm:p-8">
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
                ref={otpContainerRef}
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
                    disabled={verifyLoading || otpCode.length < 6}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
