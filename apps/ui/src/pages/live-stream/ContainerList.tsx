import { useQuery } from '@apollo/client/react';
import { CONTAINERS_QUERY, Container, ServiceGroup } from './graphql';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

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
    return <div className="p-4 text-muted-foreground">Loading containers...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive text-sm mb-2">Failed to load containers</p>
        <p className="text-muted-foreground text-xs mb-3">{error.message}</p>
        <Button variant="link" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const containers = data?.containers ?? [];
  if (containers.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">No containers found</div>;
  }

  const { services, standalone } = groupByService(containers);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">{containers.length} containers</span>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>
      <ul className="overflow-y-auto">
        {services.map((svc) => (
          <li key={svc.serviceName}>
            <button
              onClick={() => onSelectService(svc)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary transition-colors ${
                selectedServiceName === svc.serviceName ? 'bg-secondary border-l-2 border-l-purple-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-purple-500" />
                <span className="text-sm font-medium text-secondary-foreground truncate">
                  {svc.serviceName}
                </span>
                <Badge variant="secondary" className="text-purple-400 ml-auto shrink-0">
                  {svc.containers.length} replicas
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{svc.containers[0].image}</p>
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
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary transition-colors ${
                selectedId === c.id ? 'bg-secondary border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm font-medium text-secondary-foreground truncate">{c.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{c.image}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.status}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
