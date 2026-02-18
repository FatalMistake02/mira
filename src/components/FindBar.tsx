import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTabs } from '../features/tabs/TabsProvider';

type FindBarProps = {
  open: boolean;
  focusToken: number;
  onClose: () => void;
};

export default function FindBar({ open, focusToken, onClose }: FindBarProps) {
  const {
    tabs,
    activeId,
    searchInPage,
    stopFindInPage,
    findInPageActiveMatchOrdinal,
    findInPageMatches,
  } = useTabs();
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryRef = useRef('');
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const canSearchInPage = !!activeTab && !activeTab.url.startsWith('mira://');
  const hasQuery = query.trim().length > 0;
  const runSearch = useCallback((nextQuery: string) => {
    if (!canSearchInPage) {
      stopFindInPage();
      return;
    }

    const normalizedQuery = nextQuery.trim();
    if (!normalizedQuery) {
      stopFindInPage();
      return;
    }

    searchInPage(normalizedQuery, {
      forward: true,
      findNext: false,
      matchCase,
    });
  }, [canSearchInPage, matchCase, searchInPage, stopFindInPage]);

  const visibleMatchCount = canSearchInPage && hasQuery ? findInPageMatches : 0;
  const visibleActiveMatch = canSearchInPage && hasQuery
    ? Math.min(Math.max(findInPageActiveMatchOrdinal, 0), visibleMatchCount)
    : 0;

  useEffect(() => {
    if (!open) {
      stopFindInPage();
      return;
    }

    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
  }, [open, focusToken, stopFindInPage]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    runSearch(queryRef.current);
  }, [open, activeId, matchCase, runSearch]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  const findNext = (forward: boolean) => {
    if (!canSearchInPage || !hasQuery) return;
    searchInPage(query, {
      forward,
      findNext: true,
      matchCase,
    });
  };

  if (!open) return null;

  return (
    <div
      className="theme-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderTop: '1px solid var(--surfaceBorder, var(--tabBorder))',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          queryRef.current = nextQuery;
          setQuery(nextQuery);
          if (open) {
            runSearch(nextQuery);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            findNext(!event.shiftKey);
            return;
          }
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onClose();
        }}
        placeholder={canSearchInPage ? 'Find in page' : 'Find unavailable on internal pages'}
        disabled={!canSearchInPage}
        className="theme-input"
        style={{
          width: 280,
          padding: '6px 10px',
          minHeight: 'var(--layoutNavButtonHeight, 30px)',
        }}
      />
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        className="theme-btn theme-btn-nav nav-icon-btn"
        onClick={() => findNext(false)}
        disabled={!canSearchInPage || !hasQuery}
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronUp size={16} strokeWidth={2.1} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Next match (Enter)"
        className="theme-btn theme-btn-nav nav-icon-btn"
        onClick={() => findNext(true)}
        disabled={!canSearchInPage || !hasQuery}
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronDown size={16} strokeWidth={2.1} aria-hidden="true" />
      </button>
      <span
        className="theme-text3"
        aria-live="polite"
        style={{
          minWidth: 48,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {`${visibleActiveMatch}/${visibleMatchCount}`}
      </span>
      <label
        title="Match case"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginLeft: 2,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.85 }}>Case</span>
        <input
          type="checkbox"
          className="settings-toggle"
          checked={matchCase}
          disabled={!canSearchInPage}
          onChange={(event) => {
            setMatchCase(event.currentTarget.checked);
          }}
        />
      </label>
      <button
        type="button"
        title="Close find"
        className="theme-btn theme-btn-nav nav-icon-btn"
        onClick={onClose}
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );
}
