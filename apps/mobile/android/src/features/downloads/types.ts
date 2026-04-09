export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  size?: number;
  startedAt: number;
  completedAt?: number;
}
