import { Download } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDownloads } from '../features/downloads/DownloadProvider';
import DownloadPopup from './DownloadPopup';

export default function DownloadButton() {
  const { downloads } = useDownloads();
  const [show, setShow] = useState(false);
  const [visibilityMode, setVisibilityMode] = useState<'always' | 'sometimes' | 'never'>('always');
  const [sometimesVisible, setSometimesVisible] = useState(false);
  const [indicatorPhase, setIndicatorPhase] = useState<'idle' | 'active' | 'complete' | 'fading'>(
    'idle',
  );
  const prevPendingRef = useRef(0);
  const completionHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sometimesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const COMPLETION_HOLD_MS = 1200;
  const COMPLETION_FADE_MS = 600;
  const SOMETIMES_HIDE_AFTER_INTERACTION_MS = 10000;

  const pendingCount = downloads.filter(
    (d) => d.status !== 'completed' && d.status !== 'canceled' && d.status !== 'error',
  ).length;
  const activeDownloads = useMemo(
    () => downloads.filter((d) => d.status === 'pending' || d.status === 'in-progress'),
    [downloads],
  );

  const ringProgress = useMemo(() => {
    if (!activeDownloads.length) return null;

    const knownTotals = activeDownloads.filter((d) => d.totalBytes > 0);
    if (!knownTotals.length) return null;

    const totalBytes = knownTotals.reduce((sum, d) => sum + d.totalBytes, 0);
    const receivedBytes = knownTotals.reduce((sum, d) => sum + Math.min(d.receivedBytes, d.totalBytes), 0);
    if (totalBytes <= 0) return null;

    return Math.max(0, Math.min(receivedBytes / totalBytes, 1));
  }, [activeDownloads]);

  useEffect(() => {
    const readMode = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--layoutDownloadIndicatorVisibility')
        .trim()
        .toLowerCase();
      if (raw === 'never' || raw === 'sometimes' || raw === 'always') {
        setVisibilityMode(raw);
        return;
      }
      setVisibilityMode('always');
    };

    readMode();
    const observer = new MutationObserver(readMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (completionHoldTimerRef.current) {
      clearTimeout(completionHoldTimerRef.current);
      completionHoldTimerRef.current = null;
    }
    if (completionFadeTimerRef.current) {
      clearTimeout(completionFadeTimerRef.current);
      completionFadeTimerRef.current = null;
    }

    if (pendingCount > 0) {
      setIndicatorPhase('active');
      prevPendingRef.current = pendingCount;
      return;
    }

    if (prevPendingRef.current > 0) {
      setIndicatorPhase('complete');
      completionHoldTimerRef.current = setTimeout(() => {
        setIndicatorPhase('fading');
        completionFadeTimerRef.current = setTimeout(() => {
          setIndicatorPhase('idle');
        }, COMPLETION_FADE_MS);
      }, COMPLETION_HOLD_MS);
    } else {
      setIndicatorPhase('idle');
    }

    prevPendingRef.current = pendingCount;
  }, [pendingCount]);

  useEffect(() => {
    return () => {
      if (completionHoldTimerRef.current) {
        clearTimeout(completionHoldTimerRef.current);
      }
      if (completionFadeTimerRef.current) {
        clearTimeout(completionFadeTimerRef.current);
      }
      if (sometimesHideTimerRef.current) {
        clearTimeout(sometimesHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const clearHideTimer = () => {
      if (!sometimesHideTimerRef.current) return;
      clearTimeout(sometimesHideTimerRef.current);
      sometimesHideTimerRef.current = null;
    };

    if (visibilityMode !== 'sometimes') {
      clearHideTimer();
      setSometimesVisible(false);
      return;
    }

    const hasHistory = downloads.length > 0;
    const hasActiveDownload = pendingCount > 0;

    if (show || hasActiveDownload) {
      clearHideTimer();
      setSometimesVisible(true);
      return;
    }

    if (!hasHistory) {
      clearHideTimer();
      setSometimesVisible(false);
      return;
    }

    setSometimesVisible(true);

    const hideNow = () => {
      clearHideTimer();
      setSometimesVisible(false);
    };

    const scheduleHideAfterInteraction = () => {
      if (!document.hasFocus()) {
        hideNow();
        return;
      }
      clearHideTimer();
      sometimesHideTimerRef.current = setTimeout(() => {
        setSometimesVisible(false);
      }, SOMETIMES_HIDE_AFTER_INTERACTION_MS);
    };

    const onBlur = () => {
      hideNow();
    };

    window.addEventListener('mousedown', scheduleHideAfterInteraction, true);
    window.addEventListener('keydown', scheduleHideAfterInteraction, true);
    window.addEventListener('touchstart', scheduleHideAfterInteraction, true);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('mousedown', scheduleHideAfterInteraction, true);
      window.removeEventListener('keydown', scheduleHideAfterInteraction, true);
      window.removeEventListener('touchstart', scheduleHideAfterInteraction, true);
      window.removeEventListener('blur', onBlur);
      clearHideTimer();
    };
  }, [visibilityMode, show, downloads.length, pendingCount]);

  const ringVisible = indicatorPhase !== 'idle';
  const ringOpacity = indicatorPhase === 'fading' ? 0 : 1;
  const isIndeterminate = indicatorPhase === 'active' && ringProgress === null;
  const progressRatio = indicatorPhase === 'active' ? ringProgress ?? 0.32 : 1;
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progressRatio);
  const shouldShowButton =
    visibilityMode === 'always' ||
    (visibilityMode === 'sometimes' && sometimesVisible);
  if (!shouldShowButton) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShow((prev) => !prev)}
        title="Downloads"
        className="theme-btn theme-btn-download"
        style={{
          width: 'var(--layoutDownloadButtonSize, 34px)',
          height: 'var(--layoutNavButtonHeight, 30px)',
          padding: 0,
          fontSize: 15,
          marginLeft: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <Download size={16} strokeWidth={2} aria-hidden="true" />
        {ringVisible && (
          <svg
            width="30"
            height="30"
            viewBox="0 0 30 30"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '50% auto auto 50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              opacity: ringOpacity,
              transition: `opacity ${COMPLETION_FADE_MS}ms ease`,
            }}
          >
            <circle
              cx="15"
              cy="15"
              r={radius}
              fill="none"
              stroke="var(--downloadButtonBorder)"
              strokeWidth="2"
              opacity={0.45}
            />
            <circle
              cx="15"
              cy="15"
              r={radius}
              fill="none"
              stroke="var(--downloadButtonText)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 15 15)"
              className={isIndeterminate ? 'download-ring-indeterminate' : undefined}
            />
          </svg>
        )}
        {pendingCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: 'var(--downloadButtonBgActive)',
              border: '1px solid var(--downloadButtonBorderActive)',
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              lineHeight: '16px',
              textAlign: 'center',
              fontSize: 10,
              color: 'var(--downloadButtonTextActive)',
              padding: '0 3px',
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {show && <DownloadPopup onClose={() => setShow(false)} />}
    </div>
  );
}
