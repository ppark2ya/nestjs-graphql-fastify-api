import { useEffect, useState } from 'react';

export interface Tab<T = unknown> {
  id: string;
  label: string;
  data: T;
}

interface UseTabsOptions<T> {
  maxTabs: number;
  storageKey?: string;
  initialTabs?: Tab<T>[];
  initialActiveTabId?: string | null;
}

interface PersistedState<T> {
  tabs: Tab<T>[];
  activeTabId: string | null;
}

function loadState<T>(storageKey: string): PersistedState<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState<T>;
      if (Array.isArray(parsed.tabs)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveState<T>(
  storageKey: string,
  tabs: Tab<T>[],
  activeTabId: string | null,
) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ tabs, activeTabId }));
  } catch {
    /* ignore */
  }
}

export function useTabs<T = unknown>(options: UseTabsOptions<T>) {
  const {
    maxTabs,
    storageKey,
    initialTabs = [],
    initialActiveTabId = null,
  } = options;

  const [tabs, setTabs] = useState<Tab<T>[]>(() => {
    if (storageKey) {
      const persisted = loadState<T>(storageKey);
      if (persisted) return persisted.tabs;
    }
    return initialTabs;
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    if (storageKey) {
      const persisted = loadState<T>(storageKey);
      if (persisted) return persisted.activeTabId;
    }
    return initialActiveTabId;
  });

  useEffect(() => {
    if (storageKey) {
      saveState(storageKey, tabs, activeTabId);
    }
  }, [tabs, activeTabId, storageKey]);

  const openTab = (tab: Tab<T>) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (existing) {
        setActiveTabId(tab.id);
        return prev;
      }
      let next = [...prev, tab];
      if (next.length > maxTabs) {
        const oldestInactive = next.find((t) => t.id !== activeTabId);
        if (oldestInactive) {
          next = next.filter((t) => t.id !== oldestInactive.id);
        }
      }
      setActiveTabId(tab.id);
      return next;
    });
  };

  const closeTab = (tabId: string) => {
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
  };

  const updateTabLabel = (tabId: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label } : t)));
  };

  return {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTabId,
    updateTabLabel,
  };
}
