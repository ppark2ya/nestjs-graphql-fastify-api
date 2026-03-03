import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { client } from '@/lib/apollo';
import {
  REFRESH_TOKEN_MUTATION,
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
  loginId: string;
  name: string;
  userType: string;
  roleType: string;
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

  const [refreshMutation] = useMutation<RefreshTokenResponse>(
    REFRESH_TOKEN_MUTATION,
  );

  const handleLogout = useCallback(async () => {
    clearTokens();
    stopRefreshTimer();
    setIsAuthenticated(false);
    setUser(null);
    await client.clearStore();
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  const doRefreshRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const doRefresh = useCallback(async () => {
    const rt = getRefreshToken();
    if (!rt) {
      handleLogout();
      return;
    }
    try {
      const { data } = await refreshMutation({
        variables: { input: { refreshToken: rt } },
      });
      if (data?.refreshToken) {
        const { accessToken, refreshToken, expiresIn } = data.refreshToken;
        saveTokens(accessToken, refreshToken, expiresIn);
        startRefreshTimer(() => doRefreshRef.current?.());
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  }, [refreshMutation, handleLogout]);

  doRefreshRef.current = doRefresh;

  const handleLogin = useCallback((tokens: AuthTokenResponse) => {
    saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
    const payload = parseJwtPayload(tokens.accessToken);
    setUser(
      payload
        ? {
            loginId: payload.loginId,
            name: payload.name,
            userType: payload.userType,
            roleType: payload.roleType,
          }
        : null,
    );
    setIsAuthenticated(true);
    startRefreshTimer(() => doRefreshRef.current?.());
  }, []);

  useEffect(() => {
    const init = async () => {
      const at = getAccessToken();
      if (!at) {
        setIsLoading(false);
        return;
      }

      if (isAccessTokenExpired()) {
        const rt = getRefreshToken();
        if (!rt) {
          clearTokens();
          setIsLoading(false);
          return;
        }
        try {
          const { data } = await refreshMutation({
            variables: { input: { refreshToken: rt } },
          });
          if (data?.refreshToken) {
            const { accessToken, refreshToken, expiresIn } = data.refreshToken;
            saveTokens(accessToken, refreshToken, expiresIn);
            const payload = parseJwtPayload(accessToken);
            setUser(
              payload
                ? {
                    loginId: payload.loginId,
                    name: payload.name,
                    userType: payload.userType,
                    roleType: payload.roleType,
                  }
                : null,
            );
            setIsAuthenticated(true);
            startRefreshTimer(() => doRefreshRef.current?.());
          } else {
            clearTokens();
          }
        } catch {
          clearTokens();
        }
      } else {
        const payload = parseJwtPayload(at);
        setUser(
          payload
            ? {
                loginId: payload.loginId,
                name: payload.name,
                userType: payload.userType,
                roleType: payload.roleType,
              }
            : null,
        );
        setIsAuthenticated(true);
        startRefreshTimer(doRefresh);
      }
      setIsLoading(false);
    };
    init();
    return () => stopRefreshTimer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
