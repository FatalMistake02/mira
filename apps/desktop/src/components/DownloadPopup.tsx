import { useDownloads } from '../features/downloads/DownloadProvider';
import { useTabs } from '../features/tabs/TabsProvider';
import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
}

export default function DownloadPopup({ onClose }: Props) {
  const { downloads, cancel, openFolder, openFile } = useDownloads();
  const { newTab } = useTabs();
  const recent = [...downloads].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  const [openWhenDone, setOpenWhenDone] = useState<Set<string>>(new Set());

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const toggleOpenWhenDone = (downloadId: string) => {
    setOpenWhenDone(prev => {
      const newSet = new Set(prev);
      if (newSet.has(downloadId)) {
        newSet.delete(downloadId);
      } else {
        newSet.add(downloadId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    downloads.forEach(download => {
      if (download.status === 'completed' && download.savePath && openWhenDone.has(download.id)) {
        // Auto-open the file and remove from the set to prevent re-opening
        openFile(download.savePath);
        setOpenWhenDone(prev => {
          const newSet = new Set(prev);
          newSet.delete(download.id);
          return newSet;
        });
      }
    });
  }, [downloads, openWhenDone, openFile]);

  return (
    <div
      data-download-popup
      className="theme-panel"
      style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 4px)',
        width: 340,
        maxHeight: 420,
        overflowY: 'auto',
        borderRadius: 8,
        zIndex: 1000,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong className="theme-text1">Downloads</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              newTab('mira://Downloads');
              onClose();
            }}
            className="theme-btn theme-btn-nav"
            style={{ fontSize: 12, padding: '3px 8px' }}
          >
            Open Page
          </button>
          <button
            onClick={onClose}
            className="theme-btn theme-btn-nav"
            style={{ fontSize: 12, padding: '3px 8px' }}
          >
            Close
          </button>
        </div>
      </div>

      {recent.length === 0 && <div className="theme-text3">No recent downloads</div>}

      {recent.map((d) => {
        const progress = d.totalBytes > 0 ? (d.receivedBytes / d.totalBytes) * 100 : 0;
        const isActive = d.status === 'pending' || d.status === 'in-progress';

        return (
          <div key={`${d.id}-${d.startedAt}`} style={{ marginBottom: 12 }}>
            <div 
              className="theme-text1" 
              style={{ 
                fontSize: 13, 
                wordBreak: 'break-all',
                cursor: d.status === 'completed' && d.savePath ? 'pointer' : 'default',
                textDecoration: d.status === 'completed' && d.savePath ? 'underline' : 'none'
              }}
              onClick={() => {
                if (d.status === 'completed' && d.savePath) {
                  openFile(d.savePath);
                }
              }}
            >
              {d.filename}
            </div>

            {isActive && (
              <div
                style={{
                  height: 4,
                  background: 'var(--tabBorder)',
                  borderRadius: 999,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    width: `${Math.min(progress, 100)}%`,
                    height: '100%',
                    background: 'var(--downloadButtonBg)',
                    borderRadius: 999,
                  }}
                />
              </div>
            )}

            <div className="theme-text2" style={{ fontSize: 11, marginTop: 4 }}>
              {d.status === 'pending' && 'Starting...'}
              {d.status === 'in-progress' &&
                `${formatFileSize(d.receivedBytes)} / ${d.totalBytes > 0 ? formatFileSize(d.totalBytes) : 'unknown size'}`}
              {d.status === 'completed' && `Completed (${formatFileSize(d.totalBytes || d.receivedBytes)})`}
              {d.status === 'error' && `Error: ${d.error ?? 'unknown'}`}
              {d.status === 'canceled' && 'Canceled'}

              {d.status === 'completed' && d.savePath && (
                <>
                  <button
                    onClick={() => openFile(d.savePath!)}
                    className="theme-btn theme-btn-download"
                    style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => openFolder(d.savePath!)}
                    className="theme-btn theme-btn-download"
                    style={{ marginLeft: 4, fontSize: 11, padding: '1px 6px' }}
                  >
                    Show
                  </button>
                </>
              )}

              {isActive && (
                <>
                  <button
                    onClick={() => toggleOpenWhenDone(d.id)}
                    className={`theme-btn ${openWhenDone.has(d.id) ? 'theme-btn-download' : 'theme-btn-nav'}`}
                    style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
                  >
                    {openWhenDone.has(d.id) ? '✓ Open when done' : 'Open when done'}
                  </button>
                  <button
                    onClick={() => cancel(d.id)}
                    className="theme-btn theme-btn-nav"
                    style={{ marginLeft: 4, fontSize: 11, padding: '1px 6px' }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
