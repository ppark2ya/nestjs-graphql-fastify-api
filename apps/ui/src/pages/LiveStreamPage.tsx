import { useState } from 'react';
import ContainerList from '../ContainerList';
import LogViewer from '../LogViewer';
import ServiceLogViewer from '../ServiceLogViewer';
import { Container, ServiceGroup } from '../graphql';

type Selection =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup }
  | null;

export default function LiveStreamPage() {
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-64 border-r border-gray-700 flex flex-col overflow-hidden shrink-0">
        <div className="px-4 py-2 border-b border-gray-700">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Containers
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ContainerList
            selectedId={
              selection?.type === 'container' ? selection.container.id : null
            }
            selectedServiceName={
              selection?.type === 'service'
                ? selection.service.serviceName
                : null
            }
            onSelectContainer={(c) =>
              setSelection({ type: 'container', container: c })
            }
            onSelectService={(s) =>
              setSelection({ type: 'service', service: s })
            }
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {selection?.type === 'service' ? (
          <ServiceLogViewer service={selection.service} />
        ) : selection?.type === 'container' ? (
          <LogViewer
            containerId={selection.container.id}
            containerName={selection.container.name}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <p>Select a container or service to view logs</p>
          </div>
        )}
      </main>
    </div>
  );
}
