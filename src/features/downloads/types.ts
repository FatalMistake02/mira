// src/features/downloads/types.ts
export type DownloadStatus = 'pending' | 'in-progress' | 'completed' | 'error' | 'canceled';

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  totalBytes: number; // 0 if unknown
  receivedBytes: number; // updated as it downloads
  status: DownloadStatus;
  startedAt: number; // timestamp ms
  endedAt?: number; // timestamp ms (optional)
  savePath?: string; // filled when completed
  error?: string; // filled on failure
}
