import { Plus, Search, X } from 'lucide-react';
import type { Tab } from '@/hooks/useTabs';
import { MAX_SEARCH_TABS } from '../graphql';

interface Props {
  tabs: Tab<null>[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export default function HistoryTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: Props) {
  return (
    <div data-testid="history-tab-bar" className="flex items-center border-b border-border overflow-x-auto bg-card/50">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3 py-2 text-xs shrink-0 border-r border-border transition-colors ${
              isActive
                ? 'bg-background text-foreground border-b-2 border-b-primary'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <Search className="h-3 w-3 shrink-0 text-blue-400" />
            <span className="max-w-[200px] truncate">{tab.label}</span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className={`ml-1 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive shrink-0 ${
                isActive
                  ? 'opacity-60 hover:opacity-100'
                  : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
              }`}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
      <button
        onClick={onNewTab}
        disabled={tabs.length >= MAX_SEARCH_TABS}
        className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
