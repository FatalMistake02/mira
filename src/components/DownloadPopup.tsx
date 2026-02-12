// src/components/DownloadPopup.tsx
import { useDownloads } from '../features/downloads/DownloadProvider';

interface Props {
  onClose: () => void;
}

export default function DownloadPopup({ onClose }: Props) {
  const { downloads, cancel, openFolder } = useDownloads();

  // Show the *most recent* 5 items (you can change the number)
  const recent = [...downloads].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 4px)',
        width: 300,
        maxHeight: 400,
        overflowY: 'auto',
        background: '#222',
        border: '1px solid #444',
        borderRadius: 4,
        zIndex: 1000,
        padding: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong style={{ color: '#fff' }}>Downloads</strong>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#fff' }}
        >
          ✕
        </button>
      </div>

      {recent.length === 0 && <div style={{ color: '#aaa' }}>No recent downloads</div>}

      {recent.map((d) => (
        <div key={d.id} style={{ marginBottom: 8, color: '#fff' }}>
          <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{d.filename}</div>

          {/* progress bar */}
          {d.status === 'in-progress' && (
            <div style={{ height: 4, background: '#555', borderRadius: 2, marginTop: 2 }}>
              <div
                style={{
                  width: `${(d.receivedBytes / (d.totalBytes || 1)) * 100}%`,
                  height: '100%',
                  background: '#4caf50',
                }}
              />
            </div>
          )}

          {/* status line */}
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
            {d.status === 'completed' && '✔ Completed'}
            {d.status === 'error' && `❌ ${d.error}`}
            {d.status === 'canceled' && '✖ Canceled'}
            {d.status === 'in-progress' &&
              `${(d.receivedBytes / 1024).toFixed(0)} KB / ${d.totalBytes ? `${(d.totalBytes / 1024).toFixed(0)} KB` : '??'}`}

            {/* actions */}
            {d.status === 'completed' && d.savePath && (
              <button
                onClick={() => openFolder(d.savePath!)}
                style={{
                  marginLeft: 6,
                  background: 'transparent',
                  border: 'none',
                  color: '#4caf50',
                  cursor: 'pointer',
                }}
              >
                📂
              </button>
            )}
            {d.status === 'in-progress' && (
              <button
                onClick={() => cancel(d.id)}
                style={{
                  marginLeft: 6,
                  background: 'transparent',
                  border: 'none',
                  color: '#e53935',
                  cursor: 'pointer',
                }}
              >
                ✖
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
