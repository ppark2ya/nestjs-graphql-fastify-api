import { useQuery } from '@apollo/client/react';
import { CONTAINERS_QUERY, Container } from './graphql';

interface Props {
  selectedId: string | null;
  onSelect: (container: Container) => void;
}

export default function ContainerList({ selectedId, onSelect }: Props) {
  const { data, loading, error, refetch } = useQuery<{ containers: Container[] }>(CONTAINERS_QUERY);

  if (loading) {
    return (
      <div className="p-4 text-gray-400">Loading containers...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load containers</p>
        <p className="text-gray-500 text-xs mb-3">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Retry
        </button>
      </div>
    );
  }

  const containers = data?.containers ?? [];

  if (containers.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">No containers found</div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-400">{containers.length} containers</span>
        <button
          onClick={() => refetch()}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          Refresh
        </button>
      </div>
      <ul className="overflow-y-auto">
        {containers.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                selectedId === c.id ? 'bg-gray-800 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-200 truncate">
                  {c.name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{c.image}</p>
              <p className="text-xs text-gray-600 mt-0.5">{c.status}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
