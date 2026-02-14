import { useEffect, useState } from 'react';
import { useTabs } from './TabsProvider';
import miraLogo from '../../assets/mira_logo.png';

function getDisplayTitle(url: string, title?: string): string {
  const normalizedTitle = title?.trim();
  if (normalizedTitle) return normalizedTitle;

  if (url.startsWith('mira://')) {
    const route = url.replace(/^mira:\/\//, '').trim();
    if (!route || route.toLowerCase() === 'newtab') return 'New Tab';
    return route;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url || 'New Tab';
  }
}

function getDisplayFavicon(url: string, favicon?: string): string | undefined {
  const normalizedFavicon = favicon?.trim();
  if (normalizedFavicon) return normalizedFavicon;
  if (url.startsWith('mira://')) return miraLogo;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return undefined;
  }
}

export default function TabBar() {
  const { tabs, activeId, setActive, closeTab, moveTabToNewWindow, newTab } = useTabs();
  const [menuTabId, setMenuTabId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menuPos) return;
    const closeMenu = () => {
      setMenuTabId(null);
      setMenuPos(null);
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, [menuPos]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '4px 0',
        alignItems: 'center',
        minWidth: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {tabs.map((tab) => {
        const displayFavicon = getDisplayFavicon(tab.url, tab.favicon);
        const displayTitle = getDisplayTitle(tab.url, tab.title);
        const isInternalTab = tab.url.startsWith('mira://');
        const faviconSize = isInternalTab ? 22 : 16;

        return (
          <div
            key={tab.id}
            onClick={() => setActive(tab.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuTabId(tab.id);
              setMenuPos({ x: event.clientX, y: event.clientY });
            }}
            className={`theme-tab ${tab.id === activeId ? 'theme-tab-selected' : ''}`}
            style={{
              padding: '6px 10px',
              cursor: 'pointer',
              borderRadius: tab.id === activeId ? '8px 8px 0 0' : '8px',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              position: 'relative',
              zIndex: tab.id === activeId ? 2 : 1,
              marginBottom: tab.id === activeId ? -1 : 1,
              background:
                tab.id === activeId
                  ? 'var(--surfaceBgHover, var(--tabBgHover))'
                  : undefined,
              borderBottomColor:
                tab.id === activeId
                  ? 'var(--surfaceBgHover, var(--tabBgHover))'
                  : undefined,
            }}
          >
            {displayFavicon ? (
              <img
                src={displayFavicon}
                alt=""
                style={{ width: faviconSize, height: faviconSize, borderRadius: 3, flexShrink: 0 }}
              />
            ) : (
              <span
                aria-hidden={true}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  display: 'inline-block',
                  background: 'var(--borderColor, rgba(255,255,255,0.2))',
                  flexShrink: 0,
                }}
              />
            )}
            <span
              title={displayTitle}
              style={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayTitle}
            </span>
            {tab.isSleeping ? (
              <span title="Sleeping" style={{ fontSize: 10, opacity: 0.75 }}>
                zz
              </span>
            ) : null}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{ opacity: 0.8 }}
            >
              x
            </span>
          </div>
        );
      })}

          >
            {displayFavicon ? (
              <img
                src={displayFavicon}
                alt=""
                style={{ width: faviconSize, height: faviconSize, borderRadius: 3, flexShrink: 0 }}
              />
            ) : (
              <span
                aria-hidden={true}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  display: 'inline-block',
                  background: 'var(--borderColor, rgba(255,255,255,0.2))',
                  flexShrink: 0,
                }}
              />
            )}
            <span
              title={displayTitle}
              style={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayTitle}
            </span>
            {tab.isSleeping ? (
              <span title="Sleeping" style={{ fontSize: 10, opacity: 0.75 }}>
                zz
              </span>
            ) : null}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{ opacity: 0.8 }}
            >
              x
            </span>
          </div>
        );
      })}

      <button
        onClick={() => newTab()}
        className="theme-btn theme-btn-nav"
        style={{ padding: '5px 10px', minWidth: 34, flexShrink: 0 }}
      >
        +
      </button>

      {menuPos && menuTabId ? (
        <div
          style={{
            position: 'fixed',
            left: menuPos.x,
            top: menuPos.y,
            zIndex: 9999,
            minWidth: 170,
            background: 'var(--surfaceBg, var(--tabBg))',
            border: '1px solid var(--surfaceBorder, var(--tabBorder))',
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            className="theme-btn theme-btn-nav"
            style={{ width: '100%', textAlign: 'left', padding: '8px 10px', justifyContent: 'flex-start' }}
            onClick={() => {
              moveTabToNewWindow(menuTabId);
              setMenuTabId(null);
              setMenuPos(null);
            }}
          >
            Move to New Window
          </button>
        </div>
      ) : null}
    </div>
  );
}
