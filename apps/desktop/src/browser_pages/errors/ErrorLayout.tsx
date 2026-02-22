import miraIcon from '../../assets/mira_icon.png';

type ErrorLayoutProps = {
  title: string;
  subtitle: string;
  description: string;
  onReload: () => void;
  onOpenNewTab: () => void;
};

export default function ErrorLayout({
  title,
  subtitle,
  description,
  onReload,
  onOpenNewTab,
}: ErrorLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--text1)',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={onOpenNewTab}
        aria-label="Open new tab page"
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          padding: 0,
          margin: '0 0 14px 0',
          cursor: 'pointer',
        }}
      >
        <img
          src={miraIcon}
          alt="Mira Home"
          style={{
            width: 110,
            height: 110,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </button>
      <h1 style={{ margin: 0, fontSize: 48, lineHeight: 1.1 }}>{title}</h1>
      <h2 style={{ margin: '10px 0 0 0', fontSize: 24, fontWeight: 600 }}>{subtitle}</h2>
      <p style={{ margin: '12px 0 0 0', fontSize: 15, color: 'var(--text2)' }}>{description}</p>
      <button
        type="button"
        onClick={onReload}
        className="theme-btn theme-btn-go"
        style={{
          marginTop: 18,
          padding: '8px 14px',
          fontSize: 14,
        }}
      >
        Reload
      </button>
    </div>
  );
}
