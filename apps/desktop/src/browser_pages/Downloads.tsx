import { useDownloads } from '../features/downloads/DownloadProvider';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

function formatDuration(start?: number, end?: number): string {
  if (!start || !end || end < start) return '-';
  const secs = Math.round((end - start) / 1000);
  return `${secs}s`;
}

export default function Downloads() {
  const { downloads, cancel, openFolder } = useDownloads();
  const items = [...downloads].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div style={{ padding: 20, background: 'var(--bg)', color: 'var(--text1)', minHeight: '100%' }}>
      <h2 style={{ marginTop: 0 }}>Downloads</h2>
      {items.length === 0 && <div>No downloads yet.</div>}

      {items.map((d) => {
        const progress =
          d.totalBytes > 0 ? Math.min((d.receivedBytes / d.totalBytes) * 100, 100) : 0;
        const isActive = d.status === 'pending' || d.status === 'in-progress';
        const sourceHost = (() => {
          try {
            return new URL(d.url).host;
          } catch {
            return '-';
          }
        })();

        return (
          <div
            key={`${d.id}-${d.startedAt}`}
            className="theme-panel"
            style={{
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, wordBreak: 'break-all' }}>
              {d.filename}
            </div>

            <div
              style={{ fontSize: 12, marginBottom: 8, wordBreak: 'break-all' }}
              className="theme-text2"
            >
              {d.url}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                gap: 4,
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              <div className="theme-text3">Status</div>
              <div>{d.status}</div>

              <div className="theme-text3">Source</div>
              <div>{sourceHost}</div>

              <div className="theme-text3">Progress</div>
              <div>
                {formatBytes(d.receivedBytes)} /{' '}
                {d.totalBytes > 0 ? formatBytes(d.totalBytes) : 'Unknown size'} (
                {d.totalBytes > 0 ? `${progress.toFixed(1)}%` : '-'})
              </div>

              <div className="theme-text3">Started</div>
              <div>{formatTime(d.startedAt)}</div>

              <div className="theme-text3">Finished</div>
              <div>{formatTime(d.endedAt)}</div>

              <div className="theme-text3">Duration</div>
              <div>{formatDuration(d.startedAt, d.endedAt)}</div>

              <div className="theme-text3">Download ID</div>
              <div style={{ wordBreak: 'break-all' }}>{d.id}</div>

              {d.savePath && (
                <>
                  <div className="theme-text3">Saved to</div>
                  <div style={{ wordBreak: 'break-all' }}>{d.savePath}</div>
                </>
              )}

              {d.error && (
                <>
                  <div className="theme-text3">Error</div>
                  <div className="theme-text3">{d.error}</div>
                </>
              )}
            </div>

            {isActive && (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    height: 6,
                    background: 'var(--tabBorder)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'var(--downloadButtonBg)',
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              {d.status === 'completed' && d.savePath && (
                <button
                  onClick={() => openFolder(d.savePath!)}
                  className="theme-btn theme-btn-download"
                  style={{
                    padding: '4px 8px',
                  }}
                >
                  Show in folder
                </button>
              )}

              {isActive && (
                <button
                  onClick={() => cancel(d.id)}
                  className="theme-btn theme-btn-nav"
                  style={{
                    padding: '4px 8px',
                  }}
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
