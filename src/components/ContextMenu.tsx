import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ContextMenuEntry =
  | {
      type: 'item';
      label: string;
      onSelect: () => void;
      disabled?: boolean;
    }
  | {
      type: 'separator';
    };

type Point = {
  x: number;
  y: number;
};

interface ContextMenuProps {
  open: boolean;
  anchor: Point | null;
  entries: ContextMenuEntry[];
  onClose: () => void;
  minWidth?: number;
  zIndex?: number;
}

const MENU_EDGE_MARGIN_PX = 8;

function clampMenuPosition(anchor: Point, width: number, height: number): Point {
  const maxX = Math.max(MENU_EDGE_MARGIN_PX, window.innerWidth - width - MENU_EDGE_MARGIN_PX);
  const maxY = Math.max(MENU_EDGE_MARGIN_PX, window.innerHeight - height - MENU_EDGE_MARGIN_PX);
  return {
    x: Math.min(Math.max(anchor.x, MENU_EDGE_MARGIN_PX), maxX),
    y: Math.min(Math.max(anchor.y, MENU_EDGE_MARGIN_PX), maxY),
  };
}

export default function ContextMenu({
  open,
  anchor,
  entries,
  onClose,
  minWidth = 200,
  zIndex = 10000,
}: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setPosition(clampMenuPosition(anchor, rect.width, rect.height));
  }, [open, anchor, entries]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        onClose();
        return;
      }
      if (rootRef.current?.contains(target)) return;
      onClose();
    };

    const onContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);

  if (!open || !anchor || entries.length === 0) return null;

  return (
    <>
      <div
        aria-hidden={true}
        className="mira-context-menu-backdrop"
        style={{ zIndex: Math.max(0, zIndex - 1) }}
        onMouseDown={() => onClose()}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={rootRef}
        role="menu"
        className="mira-context-menu"
        style={{
          left: position.x,
          top: position.y,
          minWidth,
          zIndex,
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {entries.map((entry, index) => {
          if (entry.type === 'separator') {
            return <hr key={`separator-${index}`} className="mira-context-menu-divider" />;
          }

          return (
          <button
            key={`item-${entry.label}-${index}`}
            type="button"
            role="menuitem"
            className="mira-context-menu-item"
            disabled={entry.disabled}
            onMouseDown={(event) => {
              // Keep focus in the underlying webview/field so edit actions apply
              // to the original target instead of this menu button.
              event.preventDefault();
            }}
            onClick={() => {
              onClose();
              window.setTimeout(() => {
                entry.onSelect();
              }, 0);
            }}
          >
            {entry.label}
          </button>
          );
        })}
      </div>
    </>
  );
}
