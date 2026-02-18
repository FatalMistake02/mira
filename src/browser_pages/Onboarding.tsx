import { useEffect, useMemo, useState } from 'react';
import miraLogo from '../assets/mira_logo.png';
import { electron } from '../electronBridge';
import {
  getBrowserSettings,
  saveBrowserSettings,
  type StartupRestoreBehavior,
} from '../features/settings/browserSettings';
import { applyTheme } from '../features/themes/applyTheme';
import { getAllThemes, getThemeById, type ThemeEntry } from '../features/themes/themeLoader';
import { applyLayout } from '../features/layouts/applyLayout';
import { getAllLayouts, getLayoutById, type LayoutEntry } from '../features/layouts/layoutLoader';

type ThemePreference = 'system' | 'light' | 'dark';
type ThemeMode = 'light' | 'dark';

type RunOnStartupStatusResponse = {
  canConfigure: boolean;
};

type UpdateLaunchAutoSupportResponse = {
  canAutoInstall: boolean;
};

function getSystemThemeMode(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function pickThemeIdForMode(
  mode: ThemeMode,
  themes: ThemeEntry[],
  fallbackThemeId: string,
): string {
  const builtInId = mode === 'dark' ? 'default_dark' : 'default_light';
  if (themes.some((entry) => entry.id === builtInId)) {
    return builtInId;
  }

  const modeMatch = themes.find((entry) => entry.theme.mode === mode);
  if (modeMatch) {
    return modeMatch.id;
  }

  if (themes.some((entry) => entry.id === fallbackThemeId)) {
    return fallbackThemeId;
  }

  return themes[0]?.id ?? fallbackThemeId;
}

function formatLayoutLabel(entry: LayoutEntry): string {
  return `${entry.layout.name} - ${entry.layout.author}`;
}

export default function Onboarding() {
  const initialSettings = getBrowserSettings();
  const allThemes = useMemo(() => getAllThemes(), []);
  const allLayouts = useMemo(() => getAllLayouts(), []);

  const fallbackLayoutId = allLayouts[0]?.id ?? initialSettings.layoutId;
  const [stepIndex, setStepIndex] = useState(0);
  const [systemThemeMode, setSystemThemeMode] = useState<ThemeMode>(() => getSystemThemeMode());
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [layoutId, setLayoutId] = useState(() => {
    const hasCurrentLayout = allLayouts.some((entry) => entry.id === initialSettings.layoutId);
    return hasCurrentLayout ? initialSettings.layoutId : fallbackLayoutId;
  });
  const [startupRestoreBehavior, setStartupRestoreBehavior] = useState<StartupRestoreBehavior>(
    () => initialSettings.startupRestoreBehavior,
  );
  const [runOnStartup, setRunOnStartup] = useState(() => initialSettings.runOnStartup);
  const [autoUpdateOnLaunch, setAutoUpdateOnLaunch] = useState(
    () => initialSettings.autoUpdateOnLaunch,
  );
  const [canConfigureRunOnStartup, setCanConfigureRunOnStartup] = useState(false);
  const [canAutoInstallOnLaunch, setCanAutoInstallOnLaunch] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const resolvedThemeMode: ThemeMode =
    themePreference === 'system' ? systemThemeMode : themePreference;
  const resolvedThemeId = useMemo(
    () => pickThemeIdForMode(resolvedThemeMode, allThemes, initialSettings.themeId),
    [resolvedThemeMode, allThemes, initialSettings.themeId],
  );
  const stepCount = 3;
  const isLastStep = stepIndex === stepCount - 1;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setSystemThemeMode(mediaQuery.matches ? 'dark' : 'light');
    };

    onChange();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  useEffect(() => {
    applyTheme(getThemeById(resolvedThemeId));
  }, [resolvedThemeId]);

  useEffect(() => {
    applyLayout(getLayoutById(layoutId));
  }, [layoutId]);

  useEffect(() => {
    if (!electron?.ipcRenderer) return;

    let isSubscribed = true;
    void electron.ipcRenderer
      .invoke<RunOnStartupStatusResponse>('settings-run-on-startup-status')
      .then((response) => {
        if (!isSubscribed) return;
        setCanConfigureRunOnStartup(response.canConfigure === true);
      })
      .catch(() => {
        if (!isSubscribed) return;
        setCanConfigureRunOnStartup(false);
      });

    void electron.ipcRenderer
      .invoke<UpdateLaunchAutoSupportResponse>('updates-launch-auto-support')
      .then((response) => {
        if (!isSubscribed) return;
        setCanAutoInstallOnLaunch(response.canAutoInstall === true);
      })
      .catch(() => {
        if (!isSubscribed) return;
        setCanAutoInstallOnLaunch(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    if (canAutoInstallOnLaunch) return;
    if (!autoUpdateOnLaunch) return;
    setAutoUpdateOnLaunch(false);
  }, [canAutoInstallOnLaunch, autoUpdateOnLaunch]);

  const finishOnboarding = async () => {
    if (isFinishing) return;
    setIsFinishing(true);

    saveBrowserSettings({
      themeId: resolvedThemeId,
      layoutId,
      startupRestoreBehavior,
      runOnStartup: canConfigureRunOnStartup ? runOnStartup : false,
      autoUpdateOnLaunch: canAutoInstallOnLaunch ? autoUpdateOnLaunch : false,
    });

    if (!electron?.ipcRenderer) {
      setIsFinishing(false);
      return;
    }

    try {
      await electron.ipcRenderer.invoke('onboarding-complete');
    } finally {
      setIsFinishing(false);
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      void finishOnboarding();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, stepCount - 1));
  };

  const titleByStep = ['', 'Appearance', 'Startup and updates'];
  const subtitleByStep = ['', 'Customize the look of Mira.', 'Choose startup and update behavior.'];

  return (
    <div
      className="onboarding-root"
      style={{
        height: '100vh',
        width: '100vw',
        padding: 16,
        background: 'var(--bg)',
        color: 'var(--text1)',
      }}
    >
      <style>{`
        .onboarding-root,
        .onboarding-root * {
          user-select: none;
          -webkit-user-select: none;
        }

        .onboarding-card {
          background: var(--surfaceBg, var(--tabBg));
          color: var(--surfaceText, var(--text1));
          border: none;
          border-radius: var(--layoutPanelRadius, 8px);
        }

        .onboarding-drag-panel {
          -webkit-app-region: drag;
        }

        .onboarding-no-drag {
          -webkit-app-region: no-drag;
        }

        @keyframes miraOnboardingLogoFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes miraOnboardingTypewriter {
          from { clip-path: inset(0 100% 0 0); }
          to { clip-path: inset(0 0 0 0); }
        }

        @keyframes miraOnboardingCaretBlink {
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

      <div
        className="onboarding-card onboarding-drag-panel"
        style={{
          height: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <div className="theme-text2" style={{ fontSize: 12 }}>
            Step {stepIndex + 1} of {stepCount}
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, lineHeight: 1.2 }}>
            {titleByStep[stepIndex]}
          </h1>
          <p className="theme-text2" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {subtitleByStep[stepIndex]}
          </p>
        </div>

        <div className="onboarding-no-drag" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {stepIndex === 0 && (
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 14,
              }}
            >
              <img
                src={miraLogo}
                alt="Mira logo"
                style={{
                  width: 180,
                  height: 180,
                  objectFit: 'contain',
                  opacity: 0,
                  animation: 'miraOnboardingLogoFadeIn 900ms ease-out forwards',
                }}
              />
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>
                <span
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    clipPath: 'inset(0 100% 0 0)',
                    borderRight: '2px solid currentColor',
                    animation:
                      'miraOnboardingTypewriter 1.6s steps(15, end) 320ms forwards, miraOnboardingCaretBlink 1.8s step-end 320ms forwards',
                  }}
                >
                  Welcome to Mira
                </span>
              </h2>
            </div>
          )}

          {stepIndex === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="settings-setting-row" htmlFor="onboarding-theme">
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Theme preference</span>
                  <span className="settings-setting-description">
                    System follows your OS theme.
                  </span>
                </span>
                <select
                  id="onboarding-theme"
                  className="theme-input settings-select-input settings-setting-control"
                  value={themePreference}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === 'system' || value === 'light' || value === 'dark') {
                      setThemePreference(value as ThemePreference);
                    }
                  }}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="settings-setting-row" htmlFor="onboarding-layout">
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Layout</span>
                  <span className="settings-setting-description">
                    Pick how your browser controls should look.
                  </span>
                </span>
                <select
                  id="onboarding-layout"
                  className="theme-input settings-select-input settings-setting-control"
                  value={layoutId}
                  onChange={(event) => setLayoutId(event.currentTarget.value)}
                >
                  {allLayouts.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {formatLayoutLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {stepIndex === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="settings-setting-row" htmlFor="onboarding-startup-restore-behavior">
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Restore behavior</span>
                  <span className="settings-setting-description">
                    Choose how Mira restores your previous session on startup.
                  </span>
                </span>
                <select
                  id="onboarding-startup-restore-behavior"
                  className="theme-input settings-select-input settings-setting-control"
                  value={startupRestoreBehavior}
                  onChange={(event) => {
                    const nextMode = event.currentTarget.value;
                    if (
                      nextMode === 'ask'
                      || nextMode === 'windows'
                      || nextMode === 'tabs'
                      || nextMode === 'fresh'
                    ) {
                      setStartupRestoreBehavior(nextMode as StartupRestoreBehavior);
                    }
                  }}
                >
                  <option value="ask">Always Ask (default)</option>
                  <option value="windows">Auto Restore All Windows</option>
                  <option value="tabs">Auto Restore Tabs</option>
                  <option value="fresh">Auto Start Fresh</option>
                </select>
              </label>

              <label className="settings-setting-row" htmlFor="onboarding-run-on-startup">
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Run on startup</span>
                  <span className="settings-setting-description">
                    Launch Mira when you sign in.
                  </span>
                </span>
                <input
                  id="onboarding-run-on-startup"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={runOnStartup}
                  disabled={!canConfigureRunOnStartup}
                  onChange={(event) => setRunOnStartup(event.currentTarget.checked)}
                />
              </label>

              {!canConfigureRunOnStartup && (
                <div className="theme-text2" style={{ fontSize: 12 }}>
                  Run on startup is unavailable in this build.
                </div>
              )}

              <label className="settings-setting-row" htmlFor="onboarding-auto-update">
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Auto-update on launch</span>
                  <span className="settings-setting-description">
                    Check updates on app launch and auto install when possible.
                  </span>
                </span>
                <input
                  id="onboarding-auto-update"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={autoUpdateOnLaunch}
                  disabled={!canAutoInstallOnLaunch}
                  onChange={(event) => setAutoUpdateOnLaunch(event.currentTarget.checked)}
                />
              </label>

              {!canAutoInstallOnLaunch && (
                <div className="theme-text2" style={{ fontSize: 12 }}>
                  Auto-update on launch is unavailable in this build.
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="onboarding-no-drag"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          {stepIndex > 0 ? (
            <button
              type="button"
              className="theme-btn theme-btn-nav settings-btn-pad"
              onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
              disabled={isFinishing}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            className="theme-btn theme-btn-go settings-btn-pad"
            onClick={handleNext}
            disabled={isFinishing}
          >
            {isLastStep ? (isFinishing ? 'Starting...' : 'Start Browsing') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
