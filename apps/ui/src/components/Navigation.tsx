import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function Navigation() {
  return (
    <header className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-900">
      <h1 className="text-base font-semibold mr-8">Docker Log Viewer</h1>
      <nav className="flex gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
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
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )
          }
        >
          History
        </NavLink>
      </nav>
    </header>
  );
}
