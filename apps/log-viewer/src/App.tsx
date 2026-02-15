import { useState, useMemo } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { createApolloClient } from './apollo';
import ContainerList from './ContainerList';
import LogViewer from './LogViewer';
import { Container } from './graphql';

const DEFAULT_GATEWAY_URL = 'http://localhost:4000/graphql';

export default function App() {
  const [selected, setSelected] = useState<Container | null>(null);
  const client = useMemo(() => createApolloClient(DEFAULT_GATEWAY_URL), []);

  return (
    <ApolloProvider client={client}>
      <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900">
          <h1 className="text-base font-semibold">Docker Log Viewer</h1>
          <span className="text-xs text-gray-500">
            Gateway: {DEFAULT_GATEWAY_URL}
          </span>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Container List */}
          <aside className="w-64 border-r border-gray-700 flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-2 border-b border-gray-700">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Containers
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ContainerList
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            </div>
          </aside>

          {/* Right Panel - Log Viewer */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <LogViewer
                containerId={selected.id}
                containerName={selected.name}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                <p>Select a container to view logs</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </ApolloProvider>
  );
}
