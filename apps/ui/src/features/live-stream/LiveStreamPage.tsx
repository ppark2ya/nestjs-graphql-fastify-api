import { useState } from 'react';
import ContainerList from './components/ContainerList';
import LogViewer from './components/LogViewer';
import ServiceLogViewer from './components/ServiceLogViewer';
import TabBar from './components/TabBar';
import { Container, ServiceGroup, LiveStreamTabData } from './graphql';
import { useTabs } from '@/hooks/useTabs';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { PanelLeft } from 'lucide-react';

const MAX_TABS = 10;

function makeTabId(type: 'container' | 'service', key: string): string {
  return `${type}-${key}`;
}

export default function LiveStreamPage() {
  const { tabs, activeTabId, openTab, closeTab, setActiveTabId } =
    useTabs<LiveStreamTabData>({
      maxTabs: MAX_TABS,
      storageKey: 'live-stream-tabs',
    });
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSelectContainer = (c: Container, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('container', c.id),
      label: c.name,
      data: { type: 'container', container: c },
    });
    if (closeSheet) setSheetOpen(false);
  };

  const handleSelectService = (s: ServiceGroup, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('service', s.serviceName),
      label: s.serviceName,
      data: { type: 'service', service: s },
    });
    if (closeSheet) setSheetOpen(false);
  };

  // Derive selected IDs from active tab for sidebar highlighting
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const containerListProps = {
    selectedId:
      activeTab?.data.type === 'container' ? activeTab.data.container.id : null,
    selectedServiceName:
      activeTab?.data.type === 'service'
        ? activeTab.data.service.serviceName
        : null,
  };

  const sidebarContent = (
    <>
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
    </>
  );

  const mainContent = (
    <>
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
              Tap the <PanelLeft className="inline h-4 w-4" /> button to browse
              containers
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
              {tab.data.type === 'service' ? (
                <ServiceLogViewer service={tab.data.service} />
              ) : (
                <LogViewer
                  containerId={tab.data.container.id}
                  containerName={tab.data.container.name}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Desktop resizable layout */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="hidden md:flex flex-1"
      >
        <ResizablePanel
          defaultSize="20%"
          minSize="15%"
          maxSize="40%"
          className="flex flex-col overflow-hidden"
        >
          {sidebarContent}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize="80%"
          className="flex flex-col overflow-hidden"
        >
          {mainContent}
        </ResizablePanel>
      </ResizablePanelGroup>

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

      {/* Mobile main content */}
      <main className="flex-1 flex flex-col overflow-hidden md:hidden">
        {mainContent}
      </main>
    </div>
  );
}
