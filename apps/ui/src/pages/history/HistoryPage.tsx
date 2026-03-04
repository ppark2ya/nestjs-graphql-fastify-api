import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOG_APPS_QUERY, LogApp, SearchTab, MAX_SEARCH_TABS } from './graphql';
import HistoryTabBar from './HistoryTabBar';
import SearchPanel from './SearchPanel';

function createTab(): SearchTab {
  return {
    id: `search-${Date.now()}`,
    label: 'New Search',
  };
}

const initialTab = createTab();

export default function HistoryPage() {
  const [tabs, setTabs] = useState<SearchTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);

  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);
  const apps = appsData?.logApps ?? [];

  const addTab = () => {
    const newTab = createTab();
    setTabs((prev) => {
      if (prev.length >= MAX_SEARCH_TABS) {
        const oldest = prev.find((t) => t.id !== activeTabId);
        if (oldest) {
          return [...prev.filter((t) => t.id !== oldest.id), newTab];
        }
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);

      if (tabId === activeTabId && next.length > 0) {
        // Activate adjacent tab
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }

      return next;
    });
  };

  const updateTabLabel = (tabId: string, label: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, label } : t)),
    );
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
