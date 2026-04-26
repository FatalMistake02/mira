export type FrozenTabState = {
  scrollX: number;
  scrollY: number;
  timestamp: number;
};

export type Tab = {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  history: string[];
  historyIndex: number;
  reloadToken: number;
  isSleeping: boolean;
  lastActiveAt: number;
  frozenState?: FrozenTabState;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loading?: boolean;
  progress?: number;
};
