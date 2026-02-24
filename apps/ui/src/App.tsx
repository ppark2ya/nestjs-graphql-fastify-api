import { ApolloProvider } from '@apollo/client/react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { client } from './lib/apollo';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGuard from './auth/AuthGuard';
import Navigation from './components/Navigation';
import LoginPage from './pages/LoginPage';
import LiveStreamPage from './pages/live-stream/LiveStreamPage';
import HistoryPage from './pages/history/HistoryPage';

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
            <div className="h-screen flex flex-col bg-card text-foreground">
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
            <div className="h-screen flex flex-col bg-card text-foreground">
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
