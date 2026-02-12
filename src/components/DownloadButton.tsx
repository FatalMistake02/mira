// src/components/DownloadButton.tsx
import { useState } from 'react';
import { useDownloads } from '../features/downloads/DownloadProvider';
import DownloadPopup from './DownloadPopup';

export default function DownloadButton() {
  const { downloads } = useDownloads();
  const [show, setShow] = useState(false);

  // Count only unfinished items for the badge
  const pendingCount = downloads.filter(
    (d) => d.status !== 'completed' && d.status !== 'canceled' && d.status !== 'error',
  ).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShow((prev) => !prev)}
        title="Downloads"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          marginLeft: 8,
        }}
      >
        ⬇️
        {pendingCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: '#e53935',
              borderRadius: '50%',
              padding: '2px 6px',
              fontSize: 10,
              color: '#fff',
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {show && <DownloadPopup onClose={() => setShow(false)} />}
    </div>
  );
}