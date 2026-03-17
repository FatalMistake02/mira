import { useCallback, useEffect, useRef, useState } from 'react';
import { electron } from '../electronBridge';

type PrintPreviewStatus = 'idle' | 'loading' | 'ready';

type PrintPreviewSettings = {
  landscape: boolean;
  printBackground: boolean;
  deviceName: string;
  useSystemDialog: boolean;
  pageSize?: 'A4' | 'A3' | 'A5' | 'Legal' | 'Letter' | 'Tabloid';
  marginsType?: 'default' | 'none' | 'minimum';
};

type Props = {
  open: boolean;
  status: PrintPreviewStatus;
  title?: string;
  previewUrl?: string;
  settings: PrintPreviewSettings;
  onSettingsChange: (settings: Partial<PrintPreviewSettings>) => void;
  onPrint: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
};

type PreviewWebviewElement = HTMLElement & {
  print?: (options?: unknown, callback?: (success: boolean, failureReason: string) => void) => void;
};

type PrinterInfo = {
  name: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
};

export default function PrintPreview({
  open,
  status,
  title,
  previewUrl,
  settings,
  onSettingsChange,
  onPrint,
  onClose,
}: Props) {
  const webviewRef = useRef<PreviewWebviewElement | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printerStatus, setPrinterStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    if (!open) {
      setIsPrinting(false);
      setPrintError('');
    }
  }, [open, previewUrl]);

  const refreshPrinters = useCallback(() => {
    if (!electron?.ipcRenderer) return;
    setPrinterStatus('loading');
    electron.ipcRenderer
      .invoke<PrinterInfo[]>('print-preview-printers')
      .then((items) => {
        if (!Array.isArray(items)) {
          setPrinterStatus('error');
          return;
        }
        setPrinters(items);
        setPrinterStatus('idle');
      })
      .catch(() => {
        setPrinterStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshPrinters();
  }, [open, refreshPrinters]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPrintError('');
    const result = await onPrint();
    setIsPrinting(false);
    if (!result.ok) {
      setPrintError(result.error || 'Print failed.');
    }
  };

  const panelTitle = title?.trim() || 'Print Preview';
  const isReady = status === 'ready' && !!previewUrl;
  const labelStyle = {
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2200,
      }}
    >
      <div
        className="theme-panel"
        style={{
          width: 'min(1100px, calc(100vw - 32px))',
          height: 'min(820px, calc(100vh - 32px))',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 40px color-mix(in srgb, var(--bg) 65%, transparent)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 12px',
            borderBottom:
              '1px solid color-mix(in srgb, var(--surfaceBorder, var(--tabBorder)) 70%, transparent)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }} className="theme-text1">
            {panelTitle}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="theme-btn theme-btn-nav"
              style={{ padding: '6px 12px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="theme-btn theme-btn-go"
              style={{ padding: '6px 12px' }}
              disabled={!isReady || isPrinting}
            >
              {isPrinting ? 'Printing...' : 'Print'}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            style={{
              width: 280,
              padding: 12,
              borderRight:
                '1px solid color-mix(in srgb, var(--surfaceBorder, var(--tabBorder)) 70%, transparent)',
              background: 'color-mix(in srgb, var(--surfaceBg, var(--tabBg)) 92%, black 8%)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <div className="theme-text2" style={labelStyle}>
                Printer
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="theme-input"
                  value={settings.deviceName}
                  onChange={(event) => onSettingsChange({ deviceName: event.target.value })}
                  style={{ flex: 1, height: 32 }}
                  disabled={printerStatus === 'loading'}
                >
                  <option value="">System Default</option>
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName || printer.name}
                      {printer.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshPrinters}
                  className="theme-btn theme-btn-nav"
                  style={{ padding: '6px 10px', height: 32 }}
                >
                  Refresh
                </button>
              </div>
              {printerStatus === 'loading' && (
                <div className="theme-text2" style={{ marginTop: 6, fontSize: 12 }}>
                  Loading printers...
                </div>
              )}
              {printerStatus === 'error' && (
                <div className="theme-text2" style={{ marginTop: 6, fontSize: 12 }}>
                  Could not load printers.
                </div>
              )}
              {printerStatus === 'idle' && printers.length === 0 && (
                <div className="theme-text2" style={{ marginTop: 6, fontSize: 12 }}>
                  No printers found.
                </div>
              )}
            </div>

            <div>
              <div className="theme-text2" style={labelStyle}>
                Layout
              </div>
              <select
                className="theme-input"
                value={settings.landscape ? 'landscape' : 'portrait'}
                onChange={(event) =>
                  onSettingsChange({ landscape: event.target.value === 'landscape' })
                }
                style={{ width: '100%', height: 32 }}
                disabled={status === 'loading'}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>

            <div>
              <div className="theme-text2" style={labelStyle}>
                Page Size
              </div>
              <select
                className="theme-input"
                value={settings.pageSize || 'A4'}
                onChange={(event) =>
                  onSettingsChange({ pageSize: event.target.value as PrintPreviewSettings['pageSize'] })
                }
                style={{ width: '100%', height: 32 }}
                disabled={status === 'loading'}
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="A5">A5</option>
                <option value="Legal">Legal</option>
                <option value="Letter">Letter</option>
                <option value="Tabloid">Tabloid</option>
              </select>
            </div>

            <div>
              <div className="theme-text2" style={labelStyle}>
                Margins
              </div>
              <select
                className="theme-input"
                value={settings.marginsType || 'default'}
                onChange={(event) =>
                  onSettingsChange({ marginsType: event.target.value as PrintPreviewSettings['marginsType'] })
                }
                style={{ width: '100%', height: 32 }}
                disabled={status === 'loading'}
              >
                <option value="default">Default</option>
                <option value="none">None</option>
                <option value="minimum">Minimum</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.printBackground}
                onChange={(event) => onSettingsChange({ printBackground: event.target.checked })}
              />
              <span className="theme-text1">Print background graphics</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.useSystemDialog}
                onChange={(event) => onSettingsChange({ useSystemDialog: event.target.checked })}
              />
              <span className="theme-text1">Use system print dialog</span>
            </label>

            {!!printError && (
              <div className="theme-text2" style={{ fontSize: 12 }}>
                {printError}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              position: 'relative',
              background: 'var(--bg)',
            }}
          >
            {status === 'loading' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                }}
                className="theme-text2"
              >
                Generating preview...
              </div>
            )}
            {isReady && (
              <webview
                ref={(node) => {
                  webviewRef.current = node as PreviewWebviewElement | null;
                }}
                src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
