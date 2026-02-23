import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';

export default function Navigation() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center px-4 py-3 border-b border-border bg-card">
      <h1 className="text-base font-semibold mr-8">System Dashboard</h1>
      <nav className="flex gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-muted-foreground hover:text-secondary-foreground hover:bg-secondary',
            )
          }
        >
          Live Stream
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-muted-foreground hover:text-secondary-foreground hover:bg-secondary',
            )
          }
        >
          History
        </NavLink>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <span className="text-sm text-muted-foreground">{user.username}</span>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </div>
    </header>
  );
}
