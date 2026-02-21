// src/features/downloads/types.ts
/**
 * Current lifecycle status for a download entry.
 */
export type DownloadStatus = 'pending' | 'in-progress' | 'completed' | 'error' | 'canceled';

/**
 * Download metadata mirrored from the Electron main process.
 */
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
