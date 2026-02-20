import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTabs } from './TabsProvider';
import miraLogo from '../../assets/mira_logo.png';
import ContextMenu, { type ContextMenuEntry } from '../../components/ContextMenu';
import { electron } from '../../electronBridge';

const TAB_TARGET_WIDTH = 'var(--layoutTabTargetWidth, 220px)';
const TAB_MIN_WIDTH = 'var(--layoutTabMinWidth, 100px)';
const TAB_STRIP_GAP = 'var(--layoutTabGap, 6px)';
const TAB_ROW_HEIGHT = 'var(--layoutNavButtonHeight, 30px)';
const TAB_SWAP_TRIGGER_RATIO = 0.1;
const TAB_SWAP_MIN_POINTER_DELTA_PX = 10;
const TAB_SWAP_COOLDOWN_MS = 70;

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
  const {
    tabs,
    activeId,
    setActive,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    moveTabToIndex,
    newTabToRight,
    newTab,
    reloadTab,
    duplicateTab,
  } = useTabs();
  const [tabMenuState, setTabMenuState] = useState<{ tabId: string; x: number; y: number } | null>(
    null,
  );
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isMacOS = electron?.isMacOS ?? false;
  const primaryShortcutLabel = isMacOS ? 'Cmd' : 'Ctrl';
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevTabCountRef = useRef(tabs.length);
  const tabElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousRectsRef = useRef<Record<string, DOMRect>>({});
  const dragStartClientXRef = useRef(0);
  const dragPointerToCenterRef = useRef(0);
  const lastSwapClientXRef = useRef<number | null>(null);
  const lastSwapAtRef = useRef(0);
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const getTabGapPx = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--layoutTabGap')
      .trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 6;
  };

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
    if (!tabMenuState) return;
    const tabStillExists = tabs.some((tab) => tab.id === tabMenuState.tabId);
    if (tabStillExists) return;
    setTabMenuState(null);
  }, [tabs, tabMenuState]);

  const closeTabMenu = useCallback(() => {
    setTabMenuState(null);
  }, []);

  const tabMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!tabMenuState) return [];

    const tabIndex = tabs.findIndex((tab) => tab.id === tabMenuState.tabId);
    const hasTabsToRight = tabIndex >= 0 && tabIndex < tabs.length - 1;
    const hasOtherTabs = tabs.length > 1;

    return [
      {
        type: 'item',
        label: 'New Tab to Right',
        onSelect: () => newTabToRight(tabMenuState.tabId),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Reload',
        shortcut: `${primaryShortcutLabel}+R`,
        onSelect: () => reloadTab(tabMenuState.tabId),
      },
      {
        type: 'item',
        label: 'Duplicate',
        onSelect: () => duplicateTab(tabMenuState.tabId),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Close',
        shortcut: `${primaryShortcutLabel}+W`,
        onSelect: () => closeTab(tabMenuState.tabId),
      },
      {
        type: 'item',
        label: 'Close Others',
        disabled: !hasOtherTabs,
        onSelect: () => closeOtherTabs(tabMenuState.tabId),
      },
      {
        type: 'item',
        label: 'Close to Right',
        disabled: !hasTabsToRight,
        onSelect: () => closeTabsToRight(tabMenuState.tabId),
      },
    ];
  }, [
    tabMenuState,
    tabs,
    newTabToRight,
    reloadTab,
    duplicateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    primaryShortcutLabel,
  ]);

  useEffect(() => {
    if (!draggingTabId) return;

    const onMouseMove = (event: MouseEvent) => {
      const nextOffset = event.clientX - dragStartClientXRef.current;
      setDragOffsetX(nextOffset);

      if (Math.abs(nextOffset) > 2) {
        dragMovedRef.current = true;
      }

      const currentIndex = tabs.findIndex((tab) => tab.id === draggingTabId);
      if (currentIndex === -1) return;
      const now = Date.now();
      if (now - lastSwapAtRef.current < TAB_SWAP_COOLDOWN_MS) return;

      const draggedCenterX = event.clientX - dragPointerToCenterRef.current;
      const gapPx = getTabGapPx();

      if (currentIndex > 0) {
        const prevTab = tabs[currentIndex - 1];
        const prevEl = prevTab ? tabElementRefs.current[prevTab.id] : null;
        if (prevEl) {
          const prevRect = prevEl.getBoundingClientRect();
          const prevTrigger = prevRect.left + prevRect.width * (1 - TAB_SWAP_TRIGGER_RATIO);
          const canSwap =
            lastSwapClientXRef.current === null ||
            Math.abs(event.clientX - lastSwapClientXRef.current) >= TAB_SWAP_MIN_POINTER_DELTA_PX;
          if (draggedCenterX < prevTrigger && canSwap) {
            moveTabToIndex(draggingTabId, currentIndex - 1);
            dragStartClientXRef.current -= prevRect.width + gapPx;
            lastSwapClientXRef.current = event.clientX;
            lastSwapAtRef.current = now;
            return;
          }
        }
      }

      if (currentIndex < tabs.length - 1) {
        const nextTab = tabs[currentIndex + 1];
        const nextEl = nextTab ? tabElementRefs.current[nextTab.id] : null;
        if (nextEl) {
          const nextRect = nextEl.getBoundingClientRect();
          const nextTrigger = nextRect.left + nextRect.width * TAB_SWAP_TRIGGER_RATIO;
          const canSwap =
            lastSwapClientXRef.current === null ||
            Math.abs(event.clientX - lastSwapClientXRef.current) >= TAB_SWAP_MIN_POINTER_DELTA_PX;
          if (draggedCenterX > nextTrigger && canSwap) {
            moveTabToIndex(draggingTabId, currentIndex + 1);
            dragStartClientXRef.current += nextRect.width + gapPx;
            lastSwapClientXRef.current = event.clientX;
            lastSwapAtRef.current = now;
            return;
          }
        }
      }
    };

    const onMouseUp = () => {
      const moved = dragMovedRef.current;
      setDraggingTabId(null);
      setDragOffsetX(0);
      lastSwapClientXRef.current = null;
      lastSwapAtRef.current = 0;
      dragMovedRef.current = false;
      if (moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
    };
  }, [draggingTabId, moveTabToIndex, tabs]);

  useLayoutEffect(() => {
    const nextRects: Record<string, DOMRect> = {};
    for (const tab of tabs) {
      const el = tabElementRefs.current[tab.id];
      if (!el) continue;
      const nextRect = el.getBoundingClientRect();
      nextRects[tab.id] = nextRect;

      const prevRect = previousRectsRef.current[tab.id];
      if (!prevRect) continue;
      if (tab.id === draggingTabId) continue;
      const deltaX = prevRect.left - nextRect.left;
      if (Math.abs(deltaX) < 2) continue;

      // Prevent direction glitches by dropping any previous in-flight transform animations.
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }

      el.animate([{ transform: `translateX(${deltaX}px)` }, { transform: 'translateX(0px)' }], {
        duration: 90,
        easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
      });
    }
    previousRectsRef.current = nextRects;
  }, [tabs, draggingTabId]);

  return (
    <div
      style={{
        display: 'flex',
        gap: TAB_STRIP_GAP,
        padding: 0,
        alignItems: 'center',
        minWidth: 0,
        flex: 1,
        width: '100%',
        WebkitAppRegion: 'drag',
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
            gap: TAB_STRIP_GAP,
            overflowX: 'auto',
            overflowY: 'hidden',
            alignItems: 'center',
            WebkitAppRegion: 'drag',
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
                ref={(el) => {
                  tabElementRefs.current[tab.id] = el;
                }}
                data-tab-id={tab.id}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  setActive(tab.id);
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  const targetEl = tabElementRefs.current[tab.id];
                  if (targetEl) {
                    const rect = targetEl.getBoundingClientRect();
                    dragPointerToCenterRef.current = event.clientX - (rect.left + rect.width / 2);
                  } else {
                    dragPointerToCenterRef.current = 0;
                  }
                  dragStartClientXRef.current = event.clientX;
                  lastSwapClientXRef.current = null;
                  lastSwapAtRef.current = 0;
                  dragMovedRef.current = false;
                  setDragOffsetX(0);
                  setDraggingTabId(tab.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setTabMenuState({ tabId: tab.id, x: event.clientX, y: event.clientY });
                }}
                className={`theme-tab ${tab.id === activeId ? 'theme-tab-selected' : ''}`}
                style={{
                  height: TAB_ROW_HEIGHT,
                  padding: '0 10px',
                  cursor: 'default',
                  WebkitAppRegion: 'no-drag',
                  borderRadius:
                    tab.id === activeId
                      ? 'var(--layoutTabRadius, 8px) var(--layoutTabRadius, 8px) 0 0'
                      : 'var(--layoutTabRadius, 8px)',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  flex: `1 1 ${TAB_TARGET_WIDTH}`,
                  minWidth: TAB_MIN_WIDTH,
                  maxWidth: TAB_TARGET_WIDTH,
                  position: 'relative',
                  marginBottom:
                    tab.id === activeId
                      ? 'calc(-1 * var(--layoutBorderWidth, 1px))'
                      : 'var(--layoutBorderWidth, 1px)',
                  background:
                    tab.id === activeId ? 'var(--surfaceBgHover, var(--tabBgHover))' : undefined,
                  opacity: draggingTabId === tab.id ? 0.75 : 1,
                  transform: draggingTabId === tab.id ? `translateX(${dragOffsetX}px)` : undefined,
                  borderBottomColor:
                    tab.id === activeId ? 'var(--surfaceBgHover, var(--tabBgHover))' : undefined,
                  transition: draggingTabId === tab.id ? 'none' : 'opacity 110ms ease',
                  zIndex: draggingTabId === tab.id ? 20 : tab.id === activeId ? 2 : 1,
                  boxShadow:
                    draggingTabId === tab.id
                      ? 'var(--tabDragShadow, 0 6px 18px rgba(0, 0, 0, 0.28))'
                      : undefined,
                }}
              >
                {displayFavicon ? (
                  <img
                    src={displayFavicon}
                    alt=""
                    draggable={false}
                    style={{
                      width: faviconSize,
                      height: faviconSize,
                      borderRadius: 3,
                      flexShrink: 0,
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  <span
                    aria-hidden={true}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      display: 'inline-block',
                      background: 'var(--tabPlaceholderBg, var(--surfaceBorder, var(--tabBorder)))',
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
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'default',
                    WebkitAppRegion: 'no-drag',
                  }}
                >
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <button
            onClick={() => newTab()}
            className="theme-btn theme-btn-nav nav-icon-btn tab-new-tab-btn"
            style={{
              height: TAB_ROW_HEIGHT,
              width: 'calc(var(--layoutNavButtonHeight, 30px) + 3px)',
              minWidth: 'calc(var(--layoutNavButtonHeight, 30px) + 3px)',
              marginTop: 1,
              flexShrink: 0,
              WebkitAppRegion: 'no-drag',
            }}
          >
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
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

      <ContextMenu
        open={!!tabMenuState}
        anchor={tabMenuState ? { x: tabMenuState.x, y: tabMenuState.y } : null}
        entries={tabMenuEntries}
        onClose={closeTabMenu}
        minWidth={196}
      />
    </div>
  );
}
