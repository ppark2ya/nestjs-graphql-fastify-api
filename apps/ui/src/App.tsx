import { ApolloProvider } from '@apollo/client/react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { client } from './lib/apollo';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGuard from './auth/AuthGuard';
import Navigation from './components/Navigation';
import LoginPage from './pages/LoginPage';
import LiveStreamPage from './pages/live-stream/LiveStreamPage';
import HistoryPage from './pages/history/HistoryPage';
import NotFoundPage from './pages/NotFoundPage';

const AUTHENTICATED_PATHS = ['/admin/live-stream', '/admin/history'];

function AuthenticatedApp() {
  const { pathname } = useLocation();

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-card text-foreground">
        <Navigation />
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: pathname === '/admin/live-stream' ? 'flex' : 'none' }}
        >
          <LiveStreamPage />
        </div>
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: pathname === '/admin/history' ? 'flex' : 'none' }}
        >
          <HistoryPage />
        </div>
      </div>
    </AuthGuard>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();

  const isAuthenticatedPath = AUTHENTICATED_PATHS.includes(pathname);

  return (
    <>
      <Routes>
        <Route
          path="/admin/login"
          element={
            !isLoading && isAuthenticated ? (
              <Navigate to="/admin/live-stream" replace />
            ) : (
              <LoginPage />
            )
          }
        />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {isAuthenticatedPath && <AuthenticatedApp />}
    </>
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
