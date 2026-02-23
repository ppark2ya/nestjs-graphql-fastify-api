import { useQuery } from '@apollo/client/react';
import { CONTAINERS_QUERY, Container, ServiceGroup } from './graphql';

interface Props {
  selectedId: string | null;
  selectedServiceName: string | null;
  onSelectContainer: (container: Container) => void;
  onSelectService: (service: ServiceGroup) => void;
}

function groupByService(containers: Container[]): { services: ServiceGroup[]; standalone: Container[] } {
  const serviceMap = new Map<string, Container[]>();
  const standalone: Container[] = [];

  for (const c of containers) {
    if (c.serviceName) {
      const list = serviceMap.get(c.serviceName) ?? [];
      list.push(c);
      serviceMap.set(c.serviceName, list);
    } else {
      standalone.push(c);
    }
  }

  const services: ServiceGroup[] = [];
  for (const [serviceName, ctrs] of serviceMap) {
    services.push({ serviceName, containers: ctrs });
  }

  return { services, standalone };
}

export default function ContainerList({
  selectedId,
  selectedServiceName,
  onSelectContainer,
  onSelectService,
}: Props) {
  const { data, loading, error, refetch } = useQuery<{ containers: Container[] }>(CONTAINERS_QUERY);

  if (loading) {
    return <div className="p-4 text-gray-400">Loading containers...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load containers</p>
        <p className="text-gray-500 text-xs mb-3">{error.message}</p>
        <button onClick={() => refetch()} className="text-xs text-blue-400 hover:text-blue-300">
          Retry
        </button>
      </div>
    );
  }

  const containers = data?.containers ?? [];
  if (containers.length === 0) {
    return <div className="p-4 text-gray-500 text-sm">No containers found</div>;
  }

  const { services, standalone } = groupByService(containers);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-400">{containers.length} containers</span>
        <button onClick={() => refetch()} className="text-xs text-gray-400 hover:text-gray-200">
          Refresh
        </button>
      </div>
      <ul className="overflow-y-auto">
        {services.map((svc) => (
          <li key={svc.serviceName}>
            <button
              onClick={() => onSelectService(svc)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                selectedServiceName === svc.serviceName ? 'bg-gray-800 border-l-2 border-l-purple-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-purple-500" />
                <span className="text-sm font-medium text-gray-200 truncate" title={svc.serviceName}>
                  {svc.serviceName}
                </span>
                <span className="text-xs text-purple-400 ml-auto shrink-0">
                  {svc.containers.length} replicas
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate" title={svc.containers[0].image}>{svc.containers[0].image}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {svc.containers.map((c) => (
                  <span
                    key={c.id}
                    className={`w-1.5 h-1.5 rounded-full ${
                      c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                    title={`${c.name} (${c.id})${c.nodeName ? ` @ ${c.nodeName}` : ''}`}
                  />
                ))}
              </div>
            </button>
          </li>
        ))}
        {standalone.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelectContainer(c)}
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
                <span className="text-sm font-medium text-gray-200 truncate" title={c.name}>{c.name}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate" title={c.image}>{c.image}</p>
              <p className="text-xs text-gray-600 mt-0.5">{c.status}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
