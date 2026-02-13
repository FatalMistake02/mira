export type Tab = {
  id: string;
  url: string;
  history: string[];
  historyIndex: number;
  reloadToken: number;
  isSleeping: boolean;
  lastActiveAt: number;
};
