import { useQuery } from '@apollo/client/react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOG_APPS_QUERY, LogApp, MAX_SEARCH_TABS } from './graphql';
import { useTabs } from '@/hooks/useTabs';
import HistoryTabBar from './components/HistoryTabBar';
import SearchPanel from './components/SearchPanel';

function createTab() {
  return {
    id: `search-${Date.now()}`,
    label: 'New Search',
    data: null,
  };
}

export default function HistoryPage() {
  const initialTab = createTab();
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTabId,
    updateTabLabel,
  } = useTabs<null>({
    maxTabs: MAX_SEARCH_TABS,
    initialTabs: [initialTab],
    initialActiveTabId: initialTab.id,
  });

  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);
  const apps = appsData?.logApps ?? [];

  const addTab = () => {
    openTab(createTab());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <HistoryTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={addTab}
      />
      {tabs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Search className="h-10 w-10 opacity-30" />
          <p>No search tabs open</p>
          <Button variant="secondary" size="sm" onClick={addTab}>
            <Plus className="h-4 w-4 mr-1" />
            New Search
          </Button>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0 flex-col"
              style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            >
              <SearchPanel
                appsData={apps}
                onLabelChange={(label) => updateTabLabel(tab.id, label)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
