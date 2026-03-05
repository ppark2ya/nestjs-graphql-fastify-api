import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CONTAINERS_QUERY, Container, ServiceGroup } from '../graphql';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Star, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const FAVORITES_KEY = 'live-stream-favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    /* ignore */
  }
}

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

function makeFavoriteId(type: 'service' | 'container', key: string): string {
  return `${type}-${key}`;
}

export default function ContainerList({
  selectedId,
  selectedServiceName,
  onSelectContainer,
  onSelectService,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  };
  const { data, loading, error, refetch } = useQuery<{
    containers: Container[];
  }>(CONTAINERS_QUERY, { pollInterval: 30_000 });

  const containers = data?.containers ?? [];

  const filtered = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.serviceName?.toLowerCase().includes(q)) return true;
      return false;
    });
  })();

  if (loading && !data) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Skeleton className="w-2 h-2 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
            <Skeleton className="h-3 w-48 mt-2" />
            <div className="flex gap-1 mt-1">
              <Skeleton className="w-1.5 h-1.5 rounded-full" />
              <Skeleton className="w-1.5 h-1.5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
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

  const { services: allServices, standalone: allStandalone } =
    groupByService(filtered);

  const favorited = (type: 'service' | 'container', key: string) =>
    favorites.has(makeFavoriteId(type, key));

  const sortByFavorite = <T,>(
    items: T[],
    getKey: (item: T) => [type: 'service' | 'container', key: string],
  ) => {
    return [...items].sort((a, b) => {
      const [tA, kA] = getKey(a);
      const [tB, kB] = getKey(b);
      const fA = favorited(tA, kA) ? 0 : 1;
      const fB = favorited(tB, kB) ? 0 : 1;
      return fA - fB;
    });
  };

  const services = sortByFavorite(
    showFavoritesOnly
      ? allServices.filter((s) => favorited('service', s.serviceName))
      : allServices,
    (s) => ['service', s.serviceName],
  );

  const standalone = sortByFavorite(
    showFavoritesOnly
      ? allStandalone.filter((c) => favorited('container', c.id))
      : allStandalone,
    (c) => ['container', c.id],
  );

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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={showFavoritesOnly ? 'text-yellow-400' : ''}
          >
            <Star
              className="h-3 w-3"
              fill={showFavoritesOnly ? 'currentColor' : 'none'}
            />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      <ul className="overflow-y-auto">
        {services.map((svc) => {
          const favId = makeFavoriteId('service', svc.serviceName);
          const isFav = favorites.has(favId);
          return (
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
                  <span
                    role="button"
                    onClick={(e) => toggleFavorite(favId, e)}
                    className={`ml-auto shrink-0 p-0.5 rounded hover:text-yellow-400 transition-colors ${
                      isFav ? 'text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-400'
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" fill={isFav ? 'currentColor' : 'none'} />
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-purple-400 shrink-0"
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
          );
        })}
        {standalone.map((c) => {
          const favId = makeFavoriteId('container', c.id);
          const isFav = favorites.has(favId);
          return (
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
                <span
                  role="button"
                  onClick={(e) => toggleFavorite(favId, e)}
                  className={`ml-auto shrink-0 p-0.5 rounded hover:text-yellow-400 transition-colors ${
                    isFav ? 'text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-400'
                  }`}
                >
                  <Star className="h-3.5 w-3.5" fill={isFav ? 'currentColor' : 'none'} />
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
          );
        })}
      </ul>
    </div>
  );
}
