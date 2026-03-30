import { useTabs } from '../../features/tabs/TabsProvider';
import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

const UNSecureSiteStorage = {
  getKey: (url: string) => `mira.unsecure-site.allowed.${url}`,

  isAllowed: (url: string): boolean => {
    try {
      return localStorage.getItem(UNSecureSiteStorage.getKey(url)) === '1';
    } catch {
      return false;
    }
  },

  allow: (url: string): void => {
    try {
      localStorage.setItem(UNSecureSiteStorage.getKey(url), '1');
    } catch {}
  },
};

export default function UnsecureSiteWarningPage() {
  const { navigate, tabs, activeId } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeId);
  const httpUrl = activeTab?.url || '';
  // Extract URL from query parameter and decode it
  const urlParams = new URLSearchParams(httpUrl.split('?')[1] || '');
  const targetUrl = urlParams.get('url') || '';

  const [isRemembered, setIsRemembered] = useState(false);

  useEffect(() => {
    if (targetUrl && UNSecureSiteStorage.isAllowed(targetUrl)) {
      navigate(targetUrl);
    }
  }, [targetUrl, navigate]);

  const handleProceed = () => {
    if (isRemembered && targetUrl) {
      UNSecureSiteStorage.allow(targetUrl);
    }
    navigate(targetUrl);
  };

  const handleGoBack = () => {
    navigate('mira://newtab');
  };

  return (
    <div style={{
      minHeight: '100%',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: 'var(--bg)',
      boxSizing: 'border-box',
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: 'var(--surfaceBg, var(--tabBg))',
        borderRadius: 12,
        border: '1px solid var(--surfaceBorder, var(--tabBorder))',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>

        {/* Icon + Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--surfaceBgHover, var(--tabBgHover))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertTriangle size={20} color="var(--text1)" strokeWidth={2} />
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--text1)',
              lineHeight: 1.3,
            }}>
              Connection not secure
            </h1>
            <p style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: 'var(--text2)',
              lineHeight: 1.5,
            }}>
              This site doesn't support HTTPS. Proceeding will use an unencrypted connection where data may be visible to others.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleGoBack}
            className="theme-btn"
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderRadius: 8,
              background: 'var(--accent)',
              color: 'var(--textOnAccent, var(--text1))',
              border: '1px solid var(--surfaceBorder, var(--tabBorder))',
              boxShadow: '0 1px 3px var(--surfaceBorder, var(--tabBorder))',
            }}
          >
            <ArrowLeft size={15} />
            Go back
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="theme-btn"
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--text2)',
              border: 'none',
              boxShadow: 'none',
            }}
          >
            Proceed anyway
          </button>
        </div>

        {/* Remember checkbox */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={isRemembered}
            onChange={(e) => setIsRemembered(e.target.checked)}
            style={{
              width: 15,
              height: 15,
              accentColor: 'var(--accent)',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            Don't warn me again for this site
          </span>
        </label>

      </div>
    </div>
  );
}