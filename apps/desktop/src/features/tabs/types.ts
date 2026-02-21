/**
 * In-memory tab model for navigation state and tab lifecycle flags.
 */
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
};
