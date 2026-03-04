import { X } from 'lucide-react';
import { Tab } from '../graphql';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border overflow-x-auto bg-card/50">
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
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                tab.type === 'service' ? 'bg-purple-500' : 'bg-green-500'
              }`}
            />
            <span className="max-w-[180px] truncate">{tab.label}</span>
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
    </div>
  );
}
