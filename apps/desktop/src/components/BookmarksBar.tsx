import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTabs } from '../features/tabs/TabsProvider';
import { useBookmarks, type Bookmark } from '../features/bookmarks/BookmarksProvider';
import { getBrowserSettings } from '../features/settings/browserSettings';
import { electron } from '../electronBridge';
import { Folder } from 'lucide-react';
import ContextMenu, { type ContextMenuEntry } from './ContextMenu';

const BOOKMARK_SWAP_TRIGGER_RATIO = 0.5;
const BOOKMARK_SWAP_MIN_POINTER_DELTA_PX = 5;
const BOOKMARK_SWAP_COOLDOWN_MS = 50;
const BOOKMARK_REORDER_ANIMATION_MS = 150;
const BOOKMARK_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

type RenderedBookmarkState = {
  bookmark: Bookmark;
  lastKnownIndex: number;
};

function BookmarkBarItem({
  bookmark,
  onNavigate,
  tabFavicon,
  isDragging,
  isDragOverlay,
}: {
  bookmark: Bookmark;
  onNavigate: (url: string) => void;
  tabFavicon?: string;
  isDragging?: boolean;
  isDragOverlay?: boolean;
}) {
  const handleClick = () => {
    if (bookmark.type === 'bookmark' && bookmark.url) {
      onNavigate(bookmark.url);
    }
  };

  const icon = bookmark.type === 'folder' ? (
    <Folder size={12} />
  ) : tabFavicon ? (
    <img
      src={tabFavicon}
      alt=""
      style={{
        width: 12,
        height: 12,
        marginRight: 4,
        display: 'block'
      }}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const fallback = target.nextElementSibling as HTMLElement;
        if (fallback) {
          fallback.style.display = 'block';
        }
      }}
    />
  ) : null;

  return (
    <button
      onClick={handleClick}
      className="theme-btn theme-btn-nav bookmarks-bar-item"
      title={bookmark.url || bookmark.title}
      style={{
        padding: '2px 6px',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minWidth: 0,
        maxWidth: 120,
        height: '22px',
        border: 'none',
        background: 'transparent',
        borderRadius: '3px',
        color: 'var(--text2)',
        transition: 'background-color 0.15s ease',
        opacity: isDragging ? 0 : 1,
        cursor: isDragOverlay ? 'grabbing' : 'default',
      }}
      onMouseEnter={(e) => {
        if (!isDragOverlay) {
          e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragOverlay) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {bookmark.type === 'folder' ? (
        <span style={{ color: 'var(--text3)', flexShrink: 0 }}>
          {icon}
        </span>
      ) : (
        <>
          {icon}
          {!icon && (
            <div
              style={{
                width: 12,
                height: 12,
                marginRight: 4,
                borderRadius: '2px',
                background: 'var(--accent)',
                flexShrink: 0,
                display: 'block'
              }}
            />
          )}
        </>
      )}
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1
      }}>
        {bookmark.title}
      </span>
    </button>
  );
}

export default function BookmarksBar() {
  const { navigate, tabs, newTab } = useTabs();
  const { bookmarks, moveBookmark, deleteBookmark } = useBookmarks();

  const [draggingBookmarkId, setDraggingBookmarkId] = useState<string | null>(null);
  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null);
  const [originalPosition, setOriginalPosition] = useState<{ x: number; y: number } | null>(null);
  const dragPointerToLeftRef = useRef(0);
  const dragPointerToTopRef = useRef(0);
  const lastSwapClientXRef = useRef<number | null>(null);
  const lastSwapAtRef = useRef(0);
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const releasedDragIdRef = useRef<string | null>(null);
  const bookmarkElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousRectsRef = useRef<Record<string, DOMRect>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragMovedEnoughRef = useRef(false);
  const lastNativeBookmarkCommandRef = useRef<{ signature: string; at: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    anchor: { x: number; y: number };
    bookmark: Bookmark;
  } | null>(null);
  const [nativeContextMenusEnabled, setNativeContextMenusEnabled] = useState(
    () => getBrowserSettings().nativeTextFieldContextMenu,
  );

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    bookmark: Bookmark | null;
  }>({ open: false, bookmark: null });

  // Get only top-level bookmarks (not in folders)
  const topLevelBookmarks = bookmarks.filter(bookmark => !bookmark.parentId);

  const [renderedBookmarks, setRenderedBookmarks] = useState<RenderedBookmarkState[]>(() =>
    topLevelBookmarks.map((bookmark, index) => ({ bookmark, lastKnownIndex: index }))
  );
  const renderedBookmarksRef = useRef(renderedBookmarks);
  const bookmarksRef = useRef(topLevelBookmarks);

  // Sync rendered bookmarks with actual bookmarks
  useEffect(() => {
    const newTopLevel = bookmarks.filter(b => !b.parentId);
    setRenderedBookmarks(prev => {
      // Keep existing rendered state but update bookmark data
      const newRendered = newTopLevel.map((bookmark, index) => {
        const existing = prev.find(r => r.bookmark.id === bookmark.id);
        return existing ? { ...existing, bookmark, lastKnownIndex: index } : { bookmark, lastKnownIndex: index };
      });
      return newRendered;
    });
    bookmarksRef.current = newTopLevel;
  }, [bookmarks]);

  // Sync native context menu setting
  useEffect(() => {
    const syncSettings = () => {
      const settings = getBrowserSettings();
      setNativeContextMenusEnabled(settings.nativeTextFieldContextMenu);
    };
    syncSettings();
    
    // Listen for settings changes
    const handleSettingsChange = () => syncSettings();
    window.addEventListener('BROWSER_SETTINGS_CHANGED_EVENT', handleSettingsChange);
    return () => window.removeEventListener('BROWSER_SETTINGS_CHANGED_EVENT', handleSettingsChange);
  }, []);

  useEffect(() => {
    renderedBookmarksRef.current = renderedBookmarks;
  }, [renderedBookmarks]);

  // Handle drag mouse events
  useEffect(() => {
    if (!draggingBookmarkId) return;

    const onMouseMove = (event: MouseEvent) => {
      const currentBookmarks = bookmarksRef.current;
      if (!draggingBookmarkId) return;

      // Check if moved enough to start dragging
      if (!dragMovedEnoughRef.current) {
        if (Math.abs(event.movementX) > 2 || Math.abs(event.movementY) > 2) {
          dragMovedEnoughRef.current = true;
          dragMovedRef.current = true;
        } else {
          return;
        }
      }

      // Update dragged position
      const containerRect = containerRef.current?.getBoundingClientRect();
      const draggedEl = bookmarkElementRefs.current[draggingBookmarkId];
      const draggedRect = draggedEl?.getBoundingClientRect();
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

      let nextX = event.clientX;
      if (containerRect && draggedRect) {
        const minX = containerRect.left + dragPointerToLeftRef.current;
        const maxX = containerRect.right - (draggedRect.width - dragPointerToLeftRef.current);
        nextX = clamp(nextX, minX, maxX);
      }
      setDraggedPosition({ x: nextX, y: 0 });

      // Handle swapping
      const currentIndex = currentBookmarks.findIndex((b) => b.id === draggingBookmarkId);
      if (currentIndex === -1) return;

      const now = Date.now();
      if (now - lastSwapAtRef.current < BOOKMARK_SWAP_COOLDOWN_MS) return;

      const draggedCenterX = event.clientX;

      // Check swap with previous bookmark
      if (currentIndex > 0) {
        const prevBookmark = currentBookmarks[currentIndex - 1];
        const prevEl = prevBookmark ? bookmarkElementRefs.current[prevBookmark.id] : null;
        if (prevEl) {
          const prevRect = prevEl.getBoundingClientRect();
          const prevTrigger = prevRect.left + prevRect.width * (1 - BOOKMARK_SWAP_TRIGGER_RATIO);
          const canSwap = lastSwapClientXRef.current === null ||
            Math.abs(event.clientX - (lastSwapClientXRef.current ?? 0)) >= BOOKMARK_SWAP_MIN_POINTER_DELTA_PX;

          if (draggedCenterX < prevTrigger && canSwap) {
            moveBookmark(draggingBookmarkId, currentIndex - 1);
            lastSwapClientXRef.current = event.clientX;
            lastSwapAtRef.current = now;
            return;
          }
        }
      }

      // Check swap with next bookmark
      if (currentIndex < currentBookmarks.length - 1) {
        const nextBookmark = currentBookmarks[currentIndex + 1];
        const nextEl = nextBookmark ? bookmarkElementRefs.current[nextBookmark.id] : null;
        if (nextEl) {
          const nextRect = nextEl.getBoundingClientRect();
          const nextTrigger = nextRect.left + nextRect.width * BOOKMARK_SWAP_TRIGGER_RATIO;
          const canSwap = lastSwapClientXRef.current === null ||
            Math.abs(event.clientX - (lastSwapClientXRef.current ?? 0)) >= BOOKMARK_SWAP_MIN_POINTER_DELTA_PX;

          if (draggedCenterX > nextTrigger && canSwap) {
            moveBookmark(draggingBookmarkId, currentIndex + 1);
            lastSwapClientXRef.current = event.clientX;
            lastSwapAtRef.current = now;
            return;
          }
        }
      }
    };

    const onMouseUp = () => {
      const moved = dragMovedRef.current;
      releasedDragIdRef.current = draggingBookmarkId;
      setDraggingBookmarkId(null);
      setDraggedPosition(null);
      setOriginalPosition(null);
      lastSwapClientXRef.current = null;
      lastSwapAtRef.current = 0;
      dragMovedRef.current = false;
      dragMovedEnoughRef.current = false;
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
  }, [draggingBookmarkId, moveBookmark]);

  // Animation effect for reordering
  useLayoutEffect(() => {
    const nextRects: Record<string, DOMRect> = {};
    const releasedDragId = releasedDragIdRef.current;

    for (const item of renderedBookmarks) {
      const el = bookmarkElementRefs.current[item.bookmark.id];
      if (!el) continue;
      // Cancel any in-flight animations
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }
    }

    for (const item of renderedBookmarks) {
      const bookmarkId = item.bookmark.id;
      const el = bookmarkElementRefs.current[bookmarkId];
      if (!el) continue;
      const nextRect = el.getBoundingClientRect();
      const prevRect = previousRectsRef.current[bookmarkId];

      if (bookmarkId === draggingBookmarkId) {
        // Keep the pre-drag baseline rect
        if (prevRect) {
          nextRects[bookmarkId] = prevRect;
        } else {
          nextRects[bookmarkId] = nextRect;
        }
        continue;
      }

      nextRects[bookmarkId] = nextRect;
      if (!prevRect) continue;
      if (bookmarkId === releasedDragId) continue;

      const delta = prevRect.left - nextRect.left;
      if (Math.abs(delta) < 2) continue;

      const deltaAbs = Math.abs(delta);
      const isDeliberateReorder = draggingBookmarkId
        ? deltaAbs > 4 && deltaAbs < 400
        : deltaAbs > 10 && deltaAbs < 200;
      if (!isDeliberateReorder) continue;

      // Cancel previous animations
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }

      el.animate(
        [
          { transform: `translateX(${delta}px)` },
          { transform: 'translateX(0px)' },
        ],
        {
          duration: BOOKMARK_REORDER_ANIMATION_MS,
          easing: BOOKMARK_REORDER_EASING,
        },
      );
    }

    previousRectsRef.current = nextRects;
    if (releasedDragId) {
      releasedDragIdRef.current = null;
    }
  }, [renderedBookmarks, draggingBookmarkId]);

  const handleNavigate = useCallback((url: string) => {
    if (suppressClickRef.current) return;
    navigate(url);
  }, [navigate]);

  // Function to get favicon for a bookmark URL
  const getTabFavicon = (url?: string) => {
    if (!url) return undefined;

    // First try to find an open tab with this URL
    const tab = tabs.find(tab => tab.url === url);
    if (tab?.favicon) {
      return tab.favicon;
    }

    // If no open tab, try to construct favicon URL
    try {
      const urlObj = new URL(url);
      const faviconUrl = `${urlObj.origin}/favicon.ico`;
      return faviconUrl;
    } catch {
      return undefined;
    }
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Handle bookmark native context menu commands
  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const handleBookmarkCommand = (_event: unknown, payload: unknown) => {
      if (typeof payload !== 'object' || !payload) return;
      const candidate = payload as { command?: unknown; bookmarkId?: unknown };
      const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
      const bookmarkId = typeof candidate.bookmarkId === 'string' ? candidate.bookmarkId.trim() : '';
      if (!command || !bookmarkId) return;

      // Deduplicate rapid commands (same pattern as TabBar.tsx)
      const dedupeSignature = `${command}|${bookmarkId}`;
      const now = Date.now();
      const previous = lastNativeBookmarkCommandRef.current;
      if (previous && previous.signature === dedupeSignature && now - previous.at < 250) {
        return;
      }
      lastNativeBookmarkCommandRef.current = { signature: dedupeSignature, at: now };

      // Find the bookmark
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) return;

      switch (command) {
        case 'open':
          if (bookmark.type === 'bookmark' && bookmark.url) {
            handleNavigate(bookmark.url);
          }
          break;
        case 'open-in-new-tab':
          if (bookmark.type === 'bookmark' && bookmark.url) {
            newTab(bookmark.url);
          }
          break;
        case 'open-in-new-window':
          if (bookmark.type === 'bookmark' && bookmark.url) {
            const renderer = electron?.ipcRenderer;
            if (renderer) {
              void renderer.invoke('window-new-with-url', bookmark.url).catch(() => undefined);
            } else {
              window.open(bookmark.url, '_blank', 'noopener,noreferrer');
            }
          }
          break;
        case 'delete':
          if (bookmark) {
            setDeleteDialog({ open: true, bookmark });
          }
          break;
      }
    };

    ipc.on('bookmark-native-context-command', handleBookmarkCommand);
    return () => {
      ipc.off('bookmark-native-context-command', handleBookmarkCommand);
    };
  }, [bookmarks, handleNavigate, deleteBookmark, newTab]);

  if (topLevelBookmarks.length === 0) {
    return null;
  }

  // Context menu handlers
  const handleContextMenu = (event: React.MouseEvent, bookmark: Bookmark) => {
    event.preventDefault();
    event.stopPropagation();

    if (nativeContextMenusEnabled && electron?.ipcRenderer) {
      // Use native OS context menu for bookmarks
      setContextMenu(null);
      void electron.ipcRenderer
        .invoke('bookmark-show-native-context-menu', {
          bookmarkId: bookmark.id,
          x: event.clientX,
          y: event.clientY,
          hasUrl: bookmark.type === 'bookmark' && !!bookmark.url,
          isFolder: bookmark.type === 'folder',
        })
        .catch(() => undefined);
      return;
    }

    // Fall back to custom context menu
    setContextMenu({
      anchor: { x: event.clientX, y: event.clientY },
      bookmark
    });
  };

  const getContextMenuEntries = (bookmark: Bookmark): ContextMenuEntry[] => {
    const entries: ContextMenuEntry[] = [];

    if (bookmark.type === 'bookmark' && bookmark.url) {
      entries.push({
        type: 'item',
        label: 'Open',
        onSelect: () => {
          if (bookmark.url) handleNavigate(bookmark.url);
        },
      });
    }

    entries.push({
      type: 'item',
      label: 'Delete',
      onSelect: () => {
        setDeleteDialog({ open: true, bookmark });
      },
    });

    return entries;
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const draggedBookmark = draggingBookmarkId && draggedPosition
    ? topLevelBookmarks.find(b => b.id === draggingBookmarkId)
    : null;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '2px 6px',
        gap: 1,
        background: 'var(--surfaceBgHover, var(--tabBgHover))',
        borderBottom: '1px solid var(--surfaceBorder, var(--tabBorder))',
        minHeight: '26px',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        userSelect: draggingBookmarkId ? 'none' : 'auto',
      }}
    >
      {renderedBookmarks.map(({ bookmark }) => (
        <div
          key={bookmark.id}
          ref={(el) => {
            bookmarkElementRefs.current[bookmark.id] = el;
          }}
          data-bookmark-id={bookmark.id}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            const targetEl = bookmarkElementRefs.current[bookmark.id];
            if (targetEl) {
              const rect = targetEl.getBoundingClientRect();
              dragPointerToLeftRef.current = event.clientX - rect.left;
              dragPointerToTopRef.current = event.clientY - rect.top;
              setOriginalPosition({ x: rect.left, y: rect.top });
            } else {
              dragPointerToLeftRef.current = 0;
              dragPointerToTopRef.current = 0;
              setOriginalPosition({ x: event.clientX, y: event.clientY });
            }
            lastSwapClientXRef.current = null;
            lastSwapAtRef.current = 0;
            dragMovedRef.current = false;
            dragMovedEnoughRef.current = false;
            setDraggingBookmarkId(bookmark.id);
          }}
          onContextMenu={(event) => handleContextMenu(event, bookmark)}
          style={{
            position: 'relative',
            zIndex: draggingBookmarkId === bookmark.id ? 20 : 1,
          }}
        >
          <BookmarkBarItem
            bookmark={bookmark}
            onNavigate={handleNavigate}
            tabFavicon={getTabFavicon(bookmark.url)}
            isDragging={draggingBookmarkId === bookmark.id && draggedPosition !== null}
          />
        </div>
      ))}

      {/* Drag overlay */}
      {draggedBookmark && draggedPosition && originalPosition && (
        <div
          style={{
            position: 'fixed',
            left: draggedPosition.x - dragPointerToLeftRef.current,
            top: originalPosition.y,
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            borderRadius: '3px',
            background: 'var(--surfaceBg, white)',
          }}
        >
          <BookmarkBarItem
            bookmark={draggedBookmark}
            onNavigate={() => { }}
            tabFavicon={getTabFavicon(draggedBookmark.url)}
            isDragOverlay={true}
          />
        </div>
      )}

      {/* Context Menu - only show when native menus are disabled */}
      <ContextMenu
        open={!nativeContextMenusEnabled && !!contextMenu}
        anchor={contextMenu?.anchor || null}
        entries={contextMenu ? getContextMenuEntries(contextMenu.bookmark) : []}
        onClose={closeContextMenu}
        minWidth={150}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialog.open && deleteDialog.bookmark && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setDeleteDialog({ open: false, bookmark: null })}
        >
          <div
            className="theme-panel"
            style={{
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 10,
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0' }} className="theme-text1">
              Delete Bookmark?
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, lineHeight: 1.4 }} className="theme-text2">
              Are you sure you want to delete "{deleteDialog.bookmark.title}"?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setDeleteDialog({ open: false, bookmark: null })}
                className="theme-btn theme-btn-nav"
                style={{ padding: '7px 12px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteDialog.bookmark) {
                    deleteBookmark(deleteDialog.bookmark.id);
                  }
                  setDeleteDialog({ open: false, bookmark: null });
                }}
                className="theme-btn"
                style={{
                  padding: '7px 12px',
                  background: 'var(--windowCloseButtonBgHover, #e81123)',
                  border: '1px solid var(--windowCloseButtonBgHover, #e81123)',
                  color: 'var(--windowCloseButtonText, #ffffff)',
                  borderRadius: 'var(--layoutControlRadius, 6px)',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
