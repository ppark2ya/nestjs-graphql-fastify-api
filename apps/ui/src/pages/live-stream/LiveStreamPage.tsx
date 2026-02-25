import { useCallback, useState } from 'react';
import ContainerList from './ContainerList';
import LogViewer from './LogViewer';
import ServiceLogViewer from './ServiceLogViewer';
import TabBar from './TabBar';
import { Container, MAX_TABS, ServiceGroup, Tab } from './graphql';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PanelLeft } from 'lucide-react';

function makeTabId(type: 'container' | 'service', key: string): string {
  return `${type}-${key}`;
}

export default function LiveStreamPage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openTab = useCallback(
    (tab: Tab) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tab.id);
        if (existing) {
          setActiveTabId(tab.id);
          return prev;
        }
        let next = [...prev, tab];
        if (next.length > MAX_TABS) {
          const oldestInactive = next.find((t) => t.id !== activeTabId);
          if (oldestInactive) {
            next = next.filter((t) => t.id !== oldestInactive.id);
          }
        }
        setActiveTabId(tab.id);
        return next;
      });
    },
    [activeTabId],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId && next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1);
          setActiveTabId(next[newIdx].id);
        } else if (next.length === 0) {
          setActiveTabId(null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const handleSelectContainer = (c: Container, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('container', c.id),
      type: 'container',
      container: c,
      label: c.name,
    });
    if (closeSheet) setSheetOpen(false);
  };

  const handleSelectService = (s: ServiceGroup, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('service', s.serviceName),
      type: 'service',
      service: s,
      label: s.serviceName,
    });
    if (closeSheet) setSheetOpen(false);
  };

  // Derive selected IDs from active tab for sidebar highlighting
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const containerListProps = {
    selectedId: activeTab?.type === 'container' ? activeTab.container.id : null,
    selectedServiceName:
      activeTab?.type === 'service' ? activeTab.service.serviceName : null,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border flex-col overflow-hidden shrink-0">
        <div className="px-4 py-2 border-b border-border">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Containers
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ContainerList
            {...containerListProps}
            onSelectContainer={(c) => handleSelectContainer(c)}
            onSelectService={(s) => handleSelectService(s)}
          />
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed bottom-4 left-4 z-50 md:hidden shadow-lg bg-card border border-border"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-4 py-2 border-b border-border">
            <SheetTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Containers
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <ContainerList
              {...containerListProps}
              onSelectContainer={(c) => handleSelectContainer(c, true)}
              onSelectService={(s) => handleSelectService(s, true)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={closeTab}
        />
        {tabs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-center px-4">
            <div>
              <p>Select a container or service to view logs</p>
              <p className="text-sm mt-1 md:hidden">
                Tap the <PanelLeft className="inline h-4 w-4" /> button to
                browse containers
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="absolute inset-0 flex-col"
                style={{
                  display: tab.id === activeTabId ? 'flex' : 'none',
                }}
              >
                {tab.type === 'service' ? (
                  <ServiceLogViewer service={tab.service} />
                ) : (
                  <LogViewer
                    containerId={tab.container.id}
                    containerName={tab.container.name}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
