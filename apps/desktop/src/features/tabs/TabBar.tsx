import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTabs } from './TabsProvider';
import type { Tab } from './types';
import miraLogo from '../../assets/mira_logo.png';
import ContextMenu, { type ContextMenuEntry } from '../../components/ContextMenu';
import { electron } from '../../electronBridge';
import { BROWSER_SETTINGS_CHANGED_EVENT, getBrowserSettings } from '../settings/browserSettings';

const TAB_TARGET_WIDTH = 'var(--layoutTabTargetWidth, 220px)';
const TAB_MIN_WIDTH = 'var(--layoutTabMinWidth, 100px)';
const TAB_STRIP_GAP = 'var(--layoutTabGap, 6px)';
const TAB_ROW_HEIGHT = 'var(--layoutTabHeight, 30px)';
const TAB_SWAP_TRIGGER_RATIO = 0.1;
const TAB_SWAP_MIN_POINTER_DELTA_PX = 10;
const TAB_SWAP_COOLDOWN_MS = 70;
const TAB_APPEAR_SETTLE_MS = 24;
const TAB_ENTER_EXIT_DURATION_MS = 180;
const TAB_REORDER_ANIMATION_MS = 170;
const TAB_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

type RenderedTabState = {
  tab: Tab;
  phase: 'entering' | 'stable' | 'exiting';
  lastKnownIndex: number;
};

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
  const [nativeContextMenusEnabled, setNativeContextMenusEnabled] = useState(
    () => getBrowserSettings().nativeTextFieldContextMenu,
  );
  const [animationsEnabled, setAnimationsEnabled] = useState(
    () => getBrowserSettings().animationsEnabled,
  );
  const isMacOS = electron?.isMacOS ?? false;
  const primaryShortcutLabel = isMacOS ? 'Cmd' : 'Ctrl';
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevTabCountRef = useRef(tabs.length);
  const tabElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousRectsRef = useRef<Record<string, DOMRect>>({});
  const enterTimerByTabIdRef = useRef<Record<string, number>>({});
  const exitTimerByTabIdRef = useRef<Record<string, number>>({});
  const dragPointerToLeftRef = useRef(0);
  const dragOffsetXRef = useRef(0);
  const lastSwapClientXRef = useRef<number | null>(null);
  const lastSwapAtRef = useRef(0);
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const releasedDragTabIdRef = useRef<string | null>(null);
  const lastNativeTabCommandRef = useRef<{ signature: string; at: number } | null>(null);
  const [renderedTabs, setRenderedTabs] = useState<RenderedTabState[]>(() =>
    tabs.map((tab, index) => ({ tab, phase: 'stable', lastKnownIndex: index })),
  );
  const renderedTabsRef = useRef<RenderedTabState[]>(renderedTabs);

  useEffect(() => {
    renderedTabsRef.current = renderedTabs;
  }, [renderedTabs]);

  useEffect(() => {
    dragOffsetXRef.current = dragOffsetX;
  }, [dragOffsetX]);

  useEffect(() => {
    return () => {
      for (const timeout of Object.values(enterTimerByTabIdRef.current)) {
        window.clearTimeout(timeout);
      }
      for (const timeout of Object.values(exitTimerByTabIdRef.current)) {
        window.clearTimeout(timeout);
      }
      enterTimerByTabIdRef.current = {};
      exitTimerByTabIdRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!animationsEnabled) {
      for (const timeout of Object.values(enterTimerByTabIdRef.current)) {
        window.clearTimeout(timeout);
      }
      for (const timeout of Object.values(exitTimerByTabIdRef.current)) {
        window.clearTimeout(timeout);
      }
      enterTimerByTabIdRef.current = {};
      exitTimerByTabIdRef.current = {};

      const immediate: RenderedTabState[] = tabs.map((tab, index) => ({
        tab,
        phase: 'stable',
        lastKnownIndex: index,
      }));
      renderedTabsRef.current = immediate;
      setRenderedTabs(immediate);
      return;
    }

    const previous = renderedTabsRef.current;
    const previousById = new Map(previous.map((item) => [item.tab.id, item]));
    const nextById = new Map(tabs.map((tab) => [tab.id, tab]));
    const enteringIds: string[] = [];
    const removed: RenderedTabState[] = [];

    const next: RenderedTabState[] = tabs.map((tab, index) => {
      const existing = previousById.get(tab.id);
      if (!existing) {
        enteringIds.push(tab.id);
        return { tab, phase: 'entering', lastKnownIndex: index };
      }
      return {
        tab,
        phase: existing.phase === 'exiting' ? 'stable' : existing.phase,
        lastKnownIndex: index,
      };
    });

    for (const item of previous) {
      if (!nextById.has(item.tab.id)) {
        removed.push(item);
      }
    }

    removed
      .sort((a, b) => a.lastKnownIndex - b.lastKnownIndex)
      .forEach((item, offset) => {
        const insertAt = Math.min(item.lastKnownIndex + offset, next.length);
        next.splice(insertAt, 0, {
          tab: item.tab,
          phase: 'exiting',
          lastKnownIndex: item.lastKnownIndex,
        });
      });

    for (const tab of tabs) {
      const id = tab.id;
      const exitTimer = exitTimerByTabIdRef.current[id];
      if (exitTimer) {
        window.clearTimeout(exitTimer);
        delete exitTimerByTabIdRef.current[id];
      }
    }

    for (const id of enteringIds) {
      const existingTimer = enterTimerByTabIdRef.current[id];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      enterTimerByTabIdRef.current[id] = window.setTimeout(() => {
        setRenderedTabs((current) =>
          current.map((item) =>
            item.tab.id === id && item.phase === 'entering' ? { ...item, phase: 'stable' } : item,
          ),
        );
        delete enterTimerByTabIdRef.current[id];
      }, TAB_APPEAR_SETTLE_MS);
    }

    for (const item of removed) {
      const id = item.tab.id;
      const existingTimer = exitTimerByTabIdRef.current[id];
      if (existingTimer) continue;
      exitTimerByTabIdRef.current[id] = window.setTimeout(() => {
        setRenderedTabs((current) => current.filter((entry) => entry.tab.id !== id));
        delete exitTimerByTabIdRef.current[id];
      }, TAB_ENTER_EXIT_DURATION_MS);
    }

    renderedTabsRef.current = next;
    setRenderedTabs(next);
  }, [tabs, animationsEnabled]);

  useEffect(() => {
    const syncSettings = () => {
      const settings = getBrowserSettings();
      setNativeContextMenusEnabled(settings.nativeTextFieldContextMenu);
      setAnimationsEnabled(settings.animationsEnabled);
    };
    syncSettings();
    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

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
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onNativeContextCommand = (_event: unknown, payload: unknown) => {
      if (typeof payload !== 'object' || !payload) return;
      const candidate = payload as { command?: unknown; tabId?: unknown };
      const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
      const tabId = typeof candidate.tabId === 'string' ? candidate.tabId.trim() : '';
      if (!command || !tabId) return;

      const dedupeSignature = `${command}|${tabId}`;
      const now = Date.now();
      const previous = lastNativeTabCommandRef.current;
      if (previous && previous.signature === dedupeSignature && now - previous.at < 250) {
        return;
      }
      lastNativeTabCommandRef.current = {
        signature: dedupeSignature,
        at: now,
      };

      if (command === 'new-tab-to-right') {
        newTabToRight(tabId);
        return;
      }
      if (command === 'reload') {
        reloadTab(tabId);
        return;
      }
      if (command === 'duplicate') {
        duplicateTab(tabId);
        return;
      }
      if (command === 'close') {
        closeTab(tabId);
        return;
      }
      if (command === 'close-others') {
        closeOtherTabs(tabId);
        return;
      }
      if (command === 'close-to-right') {
        closeTabsToRight(tabId);
      }
    };

    ipc.on('tab-native-context-command', onNativeContextCommand);
    return () => ipc.off('tab-native-context-command', onNativeContextCommand);
  }, [newTabToRight, reloadTab, duplicateTab, closeTab, closeOtherTabs, closeTabsToRight]);

  useEffect(() => {
    if (!draggingTabId) return;

    const onMouseMove = (event: MouseEvent) => {
      const draggedEl = tabElementRefs.current[draggingTabId];
      if (!draggedEl) return;
      const draggedRect = draggedEl.getBoundingClientRect();
      const desiredLeft = event.clientX - dragPointerToLeftRef.current;
      const untransformedLeft = draggedRect.left - dragOffsetXRef.current;
      const nextOffset = desiredLeft - untransformedLeft;
      setDragOffsetX(nextOffset);

      if (Math.abs(nextOffset) > 2) {
        dragMovedRef.current = true;
      }

      const currentIndex = tabs.findIndex((tab) => tab.id === draggingTabId);
      if (currentIndex === -1) return;
      const now = Date.now();
      if (now - lastSwapAtRef.current < TAB_SWAP_COOLDOWN_MS) return;

      const draggedCenterX = desiredLeft + draggedRect.width / 2;
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
            lastSwapClientXRef.current = event.clientX;
            lastSwapAtRef.current = now;
            return;
          }
        }
      }
    };

    const onMouseUp = () => {
      const moved = dragMovedRef.current;
      releasedDragTabIdRef.current = draggingTabId;
      setDraggingTabId(null);
      setDragOffsetX(0);
      dragOffsetXRef.current = 0;
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
    const releasedDragTabId = releasedDragTabIdRef.current;
    for (const item of renderedTabs) {
      const tabId = item.tab.id;
      const el = tabElementRefs.current[tabId];
      if (!el) continue;
      const nextRect = el.getBoundingClientRect();
      const prevRect = previousRectsRef.current[tabId];
      if (tabId === draggingTabId) {
        // Keep the pre-drag baseline rect so the drop doesn't animate from transformed geometry.
        if (prevRect) {
          nextRects[tabId] = prevRect;
        } else {
          nextRects[tabId] = nextRect;
        }
        continue;
      }
      nextRects[tabId] = nextRect;
      if (!prevRect) continue;
      if (tabId === releasedDragTabId) continue;
      const deltaX = prevRect.left - nextRect.left;
      if (Math.abs(deltaX) < 2) continue;
      if (!animationsEnabled) continue;

      // Prevent direction glitches by dropping any previous in-flight transform animations.
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }

      el.animate([{ transform: `translateX(${deltaX}px)` }, { transform: 'translateX(0px)' }], {
        duration: TAB_REORDER_ANIMATION_MS,
        easing: TAB_REORDER_EASING,
      });
    }
    previousRectsRef.current = nextRects;
    if (releasedDragTabId) {
      releasedDragTabIdRef.current = null;
    }
  }, [renderedTabs, draggingTabId, animationsEnabled]);

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
          {renderedTabs.map(({ tab, phase }) => {
            const displayFavicon = getDisplayFavicon(tab.url, tab.favicon);
            const displayTitle = getDisplayTitle(tab.url, tab.title);
            const isInternalTab = tab.url.startsWith('mira://');
            const faviconSize = isInternalTab ? 22 : 16;
            const isExiting = phase === 'exiting';
            const isCollapsed = phase !== 'stable';

            return (
              <div
                key={tab.id}
                ref={(el) => {
                  tabElementRefs.current[tab.id] = el;
                }}
                data-tab-id={tab.id}
                onClick={() => {
                  if (isExiting) return;
                  if (suppressClickRef.current) return;
                  setActive(tab.id);
                }}
                onMouseDown={(event) => {
                  if (isExiting) return;
                  if (event.button !== 0) return;
                  const targetEl = tabElementRefs.current[tab.id];
                  if (targetEl) {
                    const rect = targetEl.getBoundingClientRect();
                    dragPointerToLeftRef.current = event.clientX - rect.left;
                  } else {
                    dragPointerToLeftRef.current = 0;
                  }
                  lastSwapClientXRef.current = null;
                  lastSwapAtRef.current = 0;
                  dragMovedRef.current = false;
                  setDragOffsetX(0);
                  dragOffsetXRef.current = 0;
                  setDraggingTabId(tab.id);
                }}
                onContextMenu={(event) => {
                  if (isExiting) return;
                  event.preventDefault();
                  if (nativeContextMenusEnabled && electron?.ipcRenderer) {
                    const tabIndex = tabs.findIndex((entry) => entry.id === tab.id);
                    const hasTabsToRight = tabIndex >= 0 && tabIndex < tabs.length - 1;
                    const hasOtherTabs = tabs.length > 1;
                    setTabMenuState(null);
                    void electron.ipcRenderer
                      .invoke('tab-show-native-context-menu', {
                        tabId: tab.id,
                        x: event.clientX,
                        y: event.clientY,
                        hasTabsToRight,
                        hasOtherTabs,
                      })
                      .catch(() => undefined);
                    return;
                  }
                  setTabMenuState({ tabId: tab.id, x: event.clientX, y: event.clientY });
                }}
                className={`theme-tab ${tab.id === activeId ? 'theme-tab-selected' : ''}`}
                style={{
                  height: TAB_ROW_HEIGHT,
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
                  minWidth: isCollapsed ? 0 : TAB_MIN_WIDTH,
                  maxWidth: isCollapsed ? 0 : TAB_TARGET_WIDTH,
                  overflow: 'hidden',
                  padding: isCollapsed ? '0' : '0 10px',
                  position: 'relative',
                  marginBottom:
                    tab.id === activeId
                      ? 'calc(-1 * var(--layoutBorderWidth, 1px))'
                      : 'var(--layoutBorderWidth, 1px)',
                  background:
                    tab.id === activeId ? 'var(--surfaceBgHover, var(--tabBgHover))' : undefined,
                  opacity:
                    isCollapsed
                      ? 0
                      : draggingTabId === tab.id
                        ? 'var(--tabDragOpacity, 1)'
                        : 1,
                  transform: draggingTabId === tab.id ? `translateX(${dragOffsetX}px)` : undefined,
                  borderBottomColor:
                    tab.id === activeId ? 'var(--surfaceBgHover, var(--tabBgHover))' : undefined,
                  pointerEvents: isExiting ? 'none' : 'auto',
                  transition:
                    !animationsEnabled || draggingTabId === tab.id
                      ? 'none'
                      : `min-width ${TAB_ENTER_EXIT_DURATION_MS}ms cubic-bezier(0.2, 0, 0.2, 1), max-width ${TAB_ENTER_EXIT_DURATION_MS}ms cubic-bezier(0.2, 0, 0.2, 1), padding ${TAB_ENTER_EXIT_DURATION_MS}ms cubic-bezier(0.2, 0, 0.2, 1), opacity ${Math.floor(TAB_ENTER_EXIT_DURATION_MS * 0.7)}ms ease`,
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
        open={!nativeContextMenusEnabled && !!tabMenuState}
        anchor={tabMenuState ? { x: tabMenuState.x, y: tabMenuState.y } : null}
        entries={tabMenuEntries}
        onClose={closeTabMenu}
        minWidth={196}
      />
    </div>
  );
}
