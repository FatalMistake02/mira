import React, { useState } from 'react';
import miraLogo from '../assets/mira_logo.png';
import { useTabs } from '../features/tabs/TabsProvider';
import { getBrowserSettings } from '../features/settings/browserSettings';

const NEW_TAB_INTRO_SHOWN_KEY = 'mira.newtab.intro.shown.v1';
const INTRO_BLOCK_HEIGHT = 300;

export default function NewTab() {
  const [query, setQuery] = useState('');
  const [introState] = useState(() => {
    try {
      const settings = getBrowserSettings();
      const showBranding = settings.showNewTabBranding;
      if (settings.disableNewTabIntro) {
        return { showBranding, showIntro: false };
      }
      const alreadyShown = sessionStorage.getItem(NEW_TAB_INTRO_SHOWN_KEY) === '1';
      if (alreadyShown) {
        return { showBranding, showIntro: false };
      }
      sessionStorage.setItem(NEW_TAB_INTRO_SHOWN_KEY, '1');
      return { showBranding, showIntro: true };
    } catch {
      return { showBranding: true, showIntro: true };
    }
  });
  const shouldRenderBranding = introState.showBranding || introState.showIntro;
  const { navigate } = useTabs();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const searchQuery = new URLSearchParams({ q: trimmed }).toString();
    navigate(`https://www.google.com/search?${searchQuery}`);
    setQuery('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '12vh',
        background: 'var(--bg)',
        color: 'var(--text1)',
      }}
    >
      <div
        style={{
          minHeight: INTRO_BLOCK_HEIGHT,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {shouldRenderBranding ? (
          <>
            <style>{`
              @keyframes miraLogoFadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }

              @keyframes miraTypewriter {
                from { clip-path: inset(0 100% 0 0); }
                to { clip-path: inset(0 0 0 0); }
              }

              @keyframes miraCaretBlink {
                0% { border-color: currentColor; }
                10% { border-color: transparent; }
                20% { border-color: currentColor; }
                30% { border-color: transparent; }
                40% { border-color: currentColor; }
                50% { border-color: transparent; }
                60% { border-color: currentColor; }
                70% { border-color: transparent; }
                80% { border-color: currentColor; }
                90% { border-color: transparent; }
                100% { border-color: transparent; }
              }
            `}</style>
            <img
              src={miraLogo}
              alt="Mira logo"
              style={{
                width: 220,
                height: 220,
                objectFit: 'contain',
                opacity: introState.showIntro ? 0 : 1,
                animation: introState.showIntro ? 'miraLogoFadeIn 900ms ease-out forwards' : undefined,
              }}
            />
            <div style={{ width: '100%', textAlign: 'center', marginTop: 20 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    clipPath: introState.showIntro ? 'inset(0 100% 0 0)' : 'inset(0 0 0 0)',
                    borderRight: introState.showIntro ? '2px solid currentColor' : 'none',
                    animation: introState.showIntro
                      ? 'miraTypewriter 1.6s steps(15, end) 400ms forwards, miraCaretBlink 1.8s step-end 400ms forwards'
                      : undefined,
                  }}
                >
                  Welcome to Mira
                </span>
              </h1>
            </div>
          </>
        ) : null}
      </div>
      <form
        onSubmit={handleSearch}
        style={{ display: 'flex', width: '60%', maxWidth: 600, minWidth: 320, marginTop: 28 }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Google..."
          style={{
            flex: 1,
            padding: '10px 15px',
            fontSize: 18,
            borderRadius: '6px 0 0 6px',
          }}
          className="theme-input"
        />
        <button
          type="submit"
          className="theme-btn theme-btn-go"
          style={{
            padding: '10px 20px',
            fontSize: 18,
            borderRadius: '0 6px 6px 0',
          }}
        >
          Search
        </button>
      </form>
    </div>
  );
}
