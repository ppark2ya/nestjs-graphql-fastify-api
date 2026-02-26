import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CONTAINERS_QUERY, Container, ServiceGroup } from './graphql';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, X } from 'lucide-react';

interface Props {
  selectedId: string | null;
  selectedServiceName: string | null;
  onSelectContainer: (container: Container) => void;
  onSelectService: (service: ServiceGroup) => void;
}

function groupByService(containers: Container[]): {
  services: ServiceGroup[];
  standalone: Container[];
} {
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
  const [searchQuery, setSearchQuery] = useState('');
  const { data, loading, error, refetch } = useQuery<{
    containers: Container[];
  }>(CONTAINERS_QUERY);

  const containers = data?.containers ?? [];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.serviceName?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [containers, searchQuery]);

  if (loading) {
    return (
      <div className="p-4 text-muted-foreground">Loading containers...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive text-sm mb-2">
          Failed to load containers
        </p>
        <p className="text-muted-foreground text-xs mb-3">{error.message}</p>
        <Button variant="link" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        No containers found
      </div>
    );
  }

  const { services, standalone } = groupByService(filtered);

  return (
    <div className="flex flex-col">
      <div className="relative px-4 py-2 border-b border-border">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search containers..."
          className="h-7 pl-7 pr-7 text-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {filtered.length === containers.length
            ? `${containers.length} containers`
            : `${filtered.length} / ${containers.length} containers`}
        </span>
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
                selectedServiceName === svc.serviceName
                  ? 'bg-secondary border-l-2 border-l-purple-500'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-purple-500" />
                <span
                  className="text-sm font-medium text-secondary-foreground truncate"
                  title={svc.serviceName}
                >
                  {svc.serviceName}
                </span>
                <Badge
                  variant="secondary"
                  className="text-purple-400 ml-auto shrink-0"
                >
                  {svc.containers.length} replicas
                </Badge>
              </div>
              <p
                className="text-xs text-muted-foreground mt-1 truncate"
                title={svc.containers[0].image}
              >
                {svc.containers[0].image}
              </p>
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
                selectedId === c.id
                  ? 'bg-secondary border-l-2 border-l-blue-500'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span
                  className="text-sm font-medium text-secondary-foreground truncate"
                  title={c.name}
                >
                  {c.name}
                </span>
              </div>
              <p
                className="text-xs text-muted-foreground mt-1 truncate"
                title={c.image}
              >
                {c.image}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.status}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
