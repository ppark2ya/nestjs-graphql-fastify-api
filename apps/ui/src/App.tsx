import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ApolloProvider } from '@apollo/client/react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { client } from './lib/apollo';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import AuthGuard from './features/auth/AuthGuard';
import Navigation from './components/Navigation';
import NotFoundPage from './components/NotFoundPage';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const LiveStreamPage = lazy(
  () => import('./features/live-stream/LiveStreamPage'),
);
const HistoryPage = lazy(() => import('./features/history/HistoryPage'));

const AUTHENTICATED_PATHS = ['/admin/live-stream', '/admin/history'];

function AuthenticatedApp() {
  const { pathname } = useLocation();

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-card text-foreground">
        <Navigation />
        <div className="flex-1 relative overflow-hidden">
          <motion.div
            className="absolute inset-0 flex flex-col overflow-hidden"
            animate={{
              opacity: pathname === '/admin/live-stream' ? 1 : 0,
              scale: pathname === '/admin/live-stream' ? 1 : 0.98,
            }}
            transition={{ duration: 0.15 }}
            style={{
              pointerEvents:
                pathname === '/admin/live-stream' ? 'auto' : 'none',
              zIndex: pathname === '/admin/live-stream' ? 1 : 0,
            }}
          >
            <LiveStreamPage />
          </motion.div>
          <motion.div
            className="absolute inset-0 flex flex-col overflow-hidden"
            animate={{
              opacity: pathname === '/admin/history' ? 1 : 0,
              scale: pathname === '/admin/history' ? 1 : 0.98,
            }}
            transition={{ duration: 0.15 }}
            style={{
              pointerEvents: pathname === '/admin/history' ? 'auto' : 'none',
              zIndex: pathname === '/admin/history' ? 1 : 0,
            }}
          >
            <HistoryPage />
          </motion.div>
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
    <Suspense fallback={null}>
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
        <Route path="/admin/live-stream" element={null} />
        <Route path="/admin/history" element={null} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {isAuthenticatedPath && <AuthenticatedApp />}
    </Suspense>
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
