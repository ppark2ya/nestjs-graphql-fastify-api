import { useCallback, useEffect, useRef, useState } from 'react';
import ContainerList from '../ContainerList';
import LogViewer from '../LogViewer';
import ServiceLogViewer from '../ServiceLogViewer';
import { Container, ServiceGroup } from '../graphql';

type Selection =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup }
  | null;

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

export default function LiveStreamPage() {
  const [selection, setSelection] = useState<Selection>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className="border-r border-gray-700 flex flex-col overflow-hidden shrink-0"
        style={{ width: sidebarWidth }}
      >
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

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 hover:bg-blue-500/50 active:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
      />

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
