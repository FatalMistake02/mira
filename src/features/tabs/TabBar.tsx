import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTabs } from './TabsProvider';
import miraLogo from '../../assets/mira_logo.png';

const TAB_TARGET_WIDTH_PX = 220;
const TAB_MIN_WIDTH_PX = 100;

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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevTabCountRef = useRef(tabs.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateOverflowHints = () => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(maxScrollLeft - el.scrollLeft > 1);
    };

    updateOverflowHints();
    el.addEventListener('scroll', updateOverflowHints, { passive: true });
    window.addEventListener('resize', updateOverflowHints);
    const rafId = window.requestAnimationFrame(updateOverflowHints);

    return () => {
      window.cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', updateOverflowHints);
      window.removeEventListener('resize', updateOverflowHints);
    };
  }, [tabs.length]);

  useEffect(() => {
    const previousCount = prevTabCountRef.current;
    prevTabCountRef.current = tabs.length;
    if (tabs.length <= previousCount) return;

    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [tabs.length]);

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
        flex: 1,
        width: '100%',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
        }}
      >
        <div
          ref={scrollRef}
          className="tab-strip-scroll"
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            overflowY: 'hidden',
            alignItems: 'center',
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
                  borderRadius:
                    tab.id === activeId
                      ? 'var(--layoutTabRadius, 8px) var(--layoutTabRadius, 8px) 0 0'
                      : 'var(--layoutTabRadius, 8px)',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  flex: `1 1 ${TAB_TARGET_WIDTH_PX}px`,
                  minWidth: TAB_MIN_WIDTH_PX,
                  maxWidth: TAB_TARGET_WIDTH_PX,
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
                    flex: 1,
                    minWidth: 0,
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
                <button
                  type="button"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="theme-btn tab-close-btn"
                  style={{
                    opacity: 0.8,
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={12} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <div
          aria-hidden={true}
          className="tab-strip-fade-left"
          style={{ opacity: canScrollLeft ? 1 : 0 }}
        />
        <div
          aria-hidden={true}
          className="tab-strip-fade-right"
          style={{ opacity: canScrollRight ? 1 : 0 }}
        />
      </div>

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
