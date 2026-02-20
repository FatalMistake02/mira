import { useDownloads } from '../features/downloads/DownloadProvider';
import { useTabs } from '../features/tabs/TabsProvider';

interface Props {
  onClose: () => void;
}

export default function DownloadPopup({ onClose }: Props) {
  const { downloads, cancel, openFolder } = useDownloads();
  const { newTab } = useTabs();
  const recent = [...downloads].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);

  return (
    <div
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
            <div className="theme-text1" style={{ fontSize: 13, wordBreak: 'break-all' }}>
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
                `${(d.receivedBytes / 1024).toFixed(0)} KB / ${d.totalBytes > 0 ? `${(d.totalBytes / 1024).toFixed(0)} KB` : 'unknown size'}`}
              {d.status === 'completed' && 'Completed'}
              {d.status === 'error' && `Error: ${d.error ?? 'unknown'}`}
              {d.status === 'canceled' && 'Canceled'}

              {d.status === 'completed' && d.savePath && (
                <button
                  onClick={() => openFolder(d.savePath!)}
                  className="theme-btn theme-btn-download"
                  style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
                >
                  Show
                </button>
              )}

              {isActive && (
                <button
                  onClick={() => cancel(d.id)}
                  className="theme-btn theme-btn-nav"
                  style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
