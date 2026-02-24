import { useState } from 'react';
import ContainerList from './ContainerList';
import LogViewer from './LogViewer';
import ServiceLogViewer from './ServiceLogViewer';
import { Container, ServiceGroup } from './graphql';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PanelLeft } from 'lucide-react';

type Selection =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup }
  | null;

export default function LiveStreamPage() {
  const [selection, setSelection] = useState<Selection>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const containerListProps = {
    selectedId:
      selection?.type === 'container' ? selection.container.id : null,
    selectedServiceName:
      selection?.type === 'service' ? selection.service.serviceName : null,
  };

  const handleSelectContainer = (c: Container, closeSheet?: boolean) => {
    setSelection({ type: 'container', container: c });
    if (closeSheet) setSheetOpen(false);
  };

  const handleSelectService = (s: ServiceGroup, closeSheet?: boolean) => {
    setSelection({ type: 'service', service: s });
    if (closeSheet) setSheetOpen(false);
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
        {selection?.type === 'service' ? (
          <ServiceLogViewer service={selection.service} />
        ) : selection?.type === 'container' ? (
          <LogViewer
            containerId={selection.container.id}
            containerName={selection.container.name}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-center px-4">
            <div>
              <p>Select a container or service to view logs</p>
              <p className="text-sm mt-1 md:hidden">
                Tap the <PanelLeft className="inline h-4 w-4" /> button to
                browse containers
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
