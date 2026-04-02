import { useMemo, useState } from 'react';
import { Copy, Mail, Plus } from 'lucide-react';
import { useTabs } from '../features/tabs/TabsProvider';

type MailtoDetails = {
  rawUrl: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
};

function parseMailtoList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMailtoDetails(url: string): MailtoDetails | null {
  const query = url.split('?')[1] || '';
  const mailtoUrl = new URLSearchParams(query).get('url')?.trim() ?? '';
  if (!mailtoUrl) return null;

  try {
    const parsed = new URL(mailtoUrl);
    if (parsed.protocol.toLowerCase() !== 'mailto:') return null;

    return {
      rawUrl: parsed.toString(),
      to: parseMailtoList(decodeURIComponent(parsed.pathname || '')),
      cc: parseMailtoList(parsed.searchParams.get('cc')),
      bcc: parseMailtoList(parsed.searchParams.get('bcc')),
      subject: parsed.searchParams.get('subject')?.trim() ?? '',
      body: parsed.searchParams.get('body') ?? '',
    };
  } catch {
    return null;
  }
}

function DetailRow(props: { label: string; value: string | string[] }) {
  const text = Array.isArray(props.value) ? props.value.join(', ') : props.value;
  if (!text) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--surfaceBgHover, var(--tabBgHover))',
        border: '1px solid var(--surfaceBorder, var(--tabBorder))',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text3)',
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--text1)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function MailtoPage() {
  const { activeId, tabs, navigateToNewTabPage } = useTabs();
  const [copyStatus, setCopyStatus] = useState('');
  const activeTabUrl = tabs.find((tab) => tab.id === activeId)?.url ?? '';
  const details = useMemo(() => parseMailtoDetails(activeTabUrl), [activeTabUrl]);

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copy failed.');
    }
  };

  if (!details) {
    return (
      <div style={{ padding: 24, color: 'var(--text1)' }}>
        This email link could not be opened.
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100%',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 20px',
        boxSizing: 'border-box',
        background:
          'radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 18%, transparent), transparent 42%), var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: '24px',
          borderRadius: 16,
          border: '1px solid var(--surfaceBorder, var(--tabBorder))',
          background: 'var(--surfaceBg, var(--tabBg))',
          boxShadow: '0 18px 40px color-mix(in srgb, var(--bg) 75%, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent) 18%, var(--surfaceBgHover, var(--tabBgHover)))',
              color: 'var(--text1)',
            }}
          >
            <Mail size={22} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ margin: 0, color: 'var(--text1)', fontSize: 24 }}>Compose Email</h1>
            <p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.5 }}>
              Mira opened this <code>mailto:</code> link in a new tab and parsed the message
              details for you.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className="theme-btn theme-btn-nav"
            onClick={() => copyText(details.rawUrl, 'Copied full mailto link.')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Copy size={16} />
            Copy Link
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-nav"
            onClick={() => copyText(details.to.join(', '), 'Copied recipients.')}
            disabled={details.to.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Copy size={16} />
            Copy Recipients
          </button>
          <button
            type="button"
            className="theme-btn theme-btn-nav"
            onClick={navigateToNewTabPage}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={16} />
            Open New Tab
          </button>
        </div>

        {copyStatus ? (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>{copyStatus}</div>
        ) : null}

        <DetailRow label="To" value={details.to} />
        <DetailRow label="Cc" value={details.cc} />
        <DetailRow label="Bcc" value={details.bcc} />
        <DetailRow label="Subject" value={details.subject} />
        <DetailRow label="Body" value={details.body} />
      </div>
    </div>
  );
}
