export type DownloadStatus = 'pending' | 'in-progress' | 'completed' | 'error' | 'canceled';

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  status: DownloadStatus;
  startedAt: number;
  endedAt?: number;
  savePath?: string;
  error?: string;
  mimeType?: string;
}
