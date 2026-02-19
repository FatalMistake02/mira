import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabs } from './features/tabs/TabsProvider';
import TabsProvider from './features/tabs/TabsProvider';
import TabBar from './features/tabs/TabBar';
import TabView from './features/tabs/TabView';
import AddressBar from './components/AddressBar';
import FindBar from './components/FindBar';
import TopBar from './components/TopBar';
import RestoreTabsPrompt from './components/RestoreTabsPrompt';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import DownloadProvider from './features/downloads/DownloadProvider';
import { electron } from './electronBridge';
import Onboarding from './browser_pages/Onboarding';
import {
  BROWSER_SETTINGS_CHANGED_EVENT,
  getBrowserSettings,
} from './features/settings/browserSettings';
import { applyTheme } from './features/themes/applyTheme';
import { getThemeById } from './features/themes/themeLoader';
import { applyLayout } from './features/layouts/applyLayout';
import { getLayoutById } from './features/layouts/layoutLoader';

type PerformanceMemoryInfo = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
};

type PerformanceWithMemory = Performance & {
  memory?: PerformanceMemoryInfo;
};

type PerfOverlayStats = {
  fps: number;
  frameTimeMs: number;
  totalMemoryMb: number | null;
};

function readHeapMetric(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value / (1024 * 1024);
}

type PerfMemorySnapshotResponse = {
  totalMemoryMb: number | null;
};

function normalizeMbValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function readHeapTotalFallbackMb(): number | null {
  const memory = (performance as PerformanceWithMemory).memory;
  return readHeapMetric(memory?.totalJSHeapSize);
}

async function readTotalMemoryUsage(): Promise<PerfMemorySnapshotResponse> {
  if (!electron?.ipcRenderer) {
    return {
      totalMemoryMb: readHeapTotalFallbackMb(),
    };
  }

  try {
    const snapshot = await electron.ipcRenderer.invoke<{
      totalMemoryMb?: unknown;
    }>('perf-memory-snapshot');
    return {
      totalMemoryMb: normalizeMbValue(snapshot?.totalMemoryMb),
    };
  } catch {
    return {
      totalMemoryMb: readHeapTotalFallbackMb(),
    };
  }
}

function formatMb(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(1)} MB`;
}

function PerfOverlay() {
  const [stats, setStats] = useState<PerfOverlayStats>(() => ({
    fps: 0,
    frameTimeMs: 0,
    totalMemoryMb: readHeapTotalFallbackMb(),
  }));

  useEffect(() => {
    let rafId = 0;
    let sampleStartedAt = performance.now();
    let lastFrameAt = sampleStartedAt;
    let frameCount = 0;
    let totalFrameMs = 0;

    const tick = (timestamp: number) => {
      const frameMs = Math.max(timestamp - lastFrameAt, 0);
      lastFrameAt = timestamp;
      frameCount += 1;
      totalFrameMs += frameMs;

      const elapsed = timestamp - sampleStartedAt;
      if (elapsed >= 500) {
        const fps = frameCount > 0 ? (frameCount * 1000) / elapsed : 0;
        const frameTimeMs = frameCount > 0 ? totalFrameMs / frameCount : 0;

        setStats((current) => ({
          ...current,
          fps,
          frameTimeMs,
        }));

        sampleStartedAt = timestamp;
        frameCount = 0;
        totalFrameMs = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updateMemory = async () => {
      const totalMemory = await readTotalMemoryUsage();
      if (cancelled) return;

      setStats((current) => ({
        ...current,
        ...totalMemory,
      }));
    };

    void updateMemory();
    const intervalId = window.setInterval(() => {
      void updateMemory();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 1200,
        pointerEvents: 'none',
        minWidth: 170,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid color-mix(in srgb, var(--surfaceBorder, var(--tabBorder)) 82%, black)',
        background: 'color-mix(in srgb, var(--surfaceBg, var(--tabBg)) 92%, black 8%)',
        color: 'var(--surfaceText, var(--text1))',
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 11,
        lineHeight: 1.45,
        boxShadow: '0 8px 18px color-mix(in srgb, var(--bg) 70%, transparent)',
      }}
    >
      <div>FPS: {Math.round(stats.fps)}</div>
      <div>Memory Total: {formatMb(stats.totalMemoryMb)}</div>
      <div>Frame: {stats.frameTimeMs.toFixed(1)} ms</div>
    </div>
  );
}

function Browser() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const previousTabIdsRef = useRef<string[] | null>(null);
  const didRequestLaunchAutoUpdateRef = useRef(false);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findBarFocusToken, setFindBarFocusToken] = useState(0);
  const [showPerfOverlay, setShowPerfOverlay] = useState(() => {
    const settings = getBrowserSettings();
    return settings.dev && settings.showPerfOverlay;
  });
  const {
    tabs,
    newTab,
    reopenLastClosedTab,
    openHistory,
    openDownloads,
    closeTab,
    reload,
    setActive,
    toggleDevTools,
    printPage,
    activeId,
  } = useTabs();
  const openFindBar = useCallback(() => {
    setFindBarOpen(true);
    setFindBarFocusToken((token) => token + 1);
  }, []);
  const closeFindBar = useCallback(() => {
    setFindBarOpen(false);
  }, []);
  const openNewWindow = () => {
    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('window-new').catch(() => undefined);
      return;
    }
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  useKeyboardShortcuts({
    newTab,
    reopenLastClosedTab,
    openHistory,
    openDownloads,
    openNewWindow,
    closeTab,
    reload,
    findInPage: openFindBar,
    printPage,
    toggleDevTools,
    activeId,
    tabs,
    setActive,
    addressInputRef,
  });

  useEffect(() => {
    const applyRuntimeSettings = () => {
      const settings = getBrowserSettings();
      applyTheme(getThemeById(settings.themeId));
      applyLayout(getLayoutById(settings.layoutId));
      setShowPerfOverlay(settings.dev && settings.showPerfOverlay);
      if (!electron?.ipcRenderer) return;

      const rootStyles = getComputedStyle(document.documentElement);
      const symbolColor = rootStyles.getPropertyValue('--text1').trim() || '#e8edf5';
      const overlayColor = rootStyles.getPropertyValue('--surfaceBg').trim() || '#1a2029';

      void Promise.allSettled([
        electron.ipcRenderer.invoke('settings-set-ad-block-enabled', settings.adBlockEnabled),
        electron.ipcRenderer.invoke(
          'settings-set-tracker-block-enabled',
          settings.trackerBlockEnabled,
        ),
        electron.ipcRenderer.invoke(
          'settings-set-quit-on-last-window-close',
          settings.quitOnLastWindowClose,
        ),
        electron.ipcRenderer.invoke('settings-set-run-on-startup', settings.runOnStartup),
        electron.ipcRenderer.invoke('window-set-titlebar-symbol-color', {
          symbolColor,
          color: overlayColor,
        }),
      ]);
    };

    applyRuntimeSettings();

    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
  }, []);

  useEffect(() => {
    if (!electron?.ipcRenderer || didRequestLaunchAutoUpdateRef.current) return;

    const settings = getBrowserSettings();
    if (!settings.autoUpdateOnLaunch) return;

    didRequestLaunchAutoUpdateRef.current = true;
    void electron.ipcRenderer
      .invoke('updates-run-launch-auto', {
        includePrerelease: settings.includePrereleaseUpdates,
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const previousTabIds = previousTabIdsRef.current;
    const currentTabIds = tabs.map((tab) => tab.id);
    if (!previousTabIds) {
      previousTabIdsRef.current = currentTabIds;
      return;
    }

    const hasAddedTab = currentTabIds.length > previousTabIds.length;
    const activeTabIsNewlyCreated = !previousTabIds.includes(activeId);
    const activeTab = tabs.find((tab) => tab.id === activeId);
    const normalizedActiveUrl = activeTab?.url.trim().toLowerCase();
    const normalizedNewTabUrl = getBrowserSettings().newTabPage.trim().toLowerCase();
    const isNewTabUrl =
      normalizedActiveUrl === normalizedNewTabUrl || normalizedActiveUrl === 'mira://newtab';

    if (hasAddedTab && activeTabIsNewlyCreated && isNewTabUrl) {
      window.requestAnimationFrame(() => {
        const addressInput = addressInputRef.current;
        if (!addressInput) return;
        addressInput.focus();
        addressInput.select();
      });
    }

    previousTabIdsRef.current = currentTabIds;
  }, [tabs, activeId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <TopBar>
        <TabBar />
      </TopBar>
      <AddressBar inputRef={addressInputRef} />
      <FindBar open={findBarOpen} focusToken={findBarFocusToken} onClose={closeFindBar} />
      <TabView />
      <RestoreTabsPrompt />
      {showPerfOverlay && <PerfOverlay />}
    </div>
  );
}

export default function App() {
  const isOnboardingWindow = new URLSearchParams(window.location.search).get('onboarding') === '1';
  if (isOnboardingWindow) {
    return <Onboarding />;
  }

  return (
    <TabsProvider>
      <DownloadProvider>
        <Browser />
      </DownloadProvider>
    </TabsProvider>
  );
}
