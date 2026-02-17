import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useTabs } from '../features/tabs/TabsProvider';
import {
  DEFAULT_BROWSER_SETTINGS,
  getBrowserSettings,
  saveBrowserSettings,
  type DevToolsOpenMode,
  type TabSleepMode,
} from '../features/settings/browserSettings';
import { applyTheme } from '../features/themes/applyTheme';
import {
  deleteCustomTheme,
  getAllThemes,
  getThemeById,
  importThemeFromJson,
  type ThemeEntry,
} from '../features/themes/themeLoader';
import { applyLayout } from '../features/layouts/applyLayout';
import {
  deleteCustomLayout,
  getAllLayouts,
  getLayoutById,
  importLayoutFromJson,
  type LayoutEntry,
} from '../features/layouts/layoutLoader';
import { electron } from '../electronBridge';

type UpdateCheckPayload = {
  mode: 'portable' | 'installer';
  currentVersion: string;
  latestVersion: string;
  latestIsPrerelease: boolean;
  hasUpdate: boolean;
  releaseName: string;
  assetName: string;
  downloadUrl: string;
};

type UpdateCheckResponse =
  | { ok: true; data: UpdateCheckPayload }
  | { ok: false; error: string };

type DefaultBrowserStatusResponse = {
  isDefault: boolean;
  message?: string;
  support?: {
    code:
      | 'ok'
      | 'dev-build'
      | 'windows-portable'
      | 'manual-confirmation-required'
      | 'registration-failed';
    canAttemptRegistration: boolean;
    requiresUserAction: boolean;
    message: string;
    platform: string;
    isPackaged: boolean;
    isPortableBuild: boolean;
    processDefaultApp: boolean;
  };
};

type SetDefaultBrowserResponse = {
  ok: boolean;
  isDefault: boolean;
  requiresUserAction?: boolean;
  message?: string;
  support?: {
    code:
      | 'ok'
      | 'dev-build'
      | 'windows-portable'
      | 'manual-confirmation-required'
      | 'registration-failed';
    canAttemptRegistration: boolean;
    requiresUserAction: boolean;
    message: string;
    platform: string;
    isPackaged: boolean;
    isPortableBuild: boolean;
    processDefaultApp: boolean;
  };
};

type SettingsSectionId = 'general' | 'customization' | 'app';

const SETTINGS_SECTION_TABS: Array<{
  id: SettingsSectionId;
  label: string;
}> = [
  {
    id: 'general',
    label: 'General',
  },
  {
    id: 'customization',
    label: 'Customization',
  },
  {
    id: 'app',
    label: 'App',
  },
];

export default function Settings() {
  const AUTO_SAVE_DELAY_MS = 300;
  const SAVED_BADGE_MS = 1600;

  const initialSettings = getBrowserSettings();
  const [newTabPage, setNewTabPage] = useState(() => initialSettings.newTabPage);
  const [themeId, setThemeId] = useState(() => initialSettings.themeId);
  const [rawFileDarkModeEnabled, setRawFileDarkModeEnabled] = useState(
    () => initialSettings.rawFileDarkModeEnabled,
  );
  const [layoutId, setLayoutId] = useState(() => initialSettings.layoutId);
  const [tabSleepValue, setTabSleepValue] = useState(() => initialSettings.tabSleepValue);
  const [tabSleepUnit, setTabSleepUnit] = useState(() => initialSettings.tabSleepUnit);
  const [tabSleepMode, setTabSleepMode] = useState(() => initialSettings.tabSleepMode);
  const [devToolsOpenMode, setDevToolsOpenMode] = useState(() => initialSettings.devToolsOpenMode);
  const [adBlockEnabled, setAdBlockEnabled] = useState(() => initialSettings.adBlockEnabled);
  const [quitOnLastWindowClose, setQuitOnLastWindowClose] = useState(
    () => initialSettings.quitOnLastWindowClose,
  );
  const [showNewTabBranding, setShowNewTabBranding] = useState(
    () => initialSettings.showNewTabBranding,
  );
  const [disableNewTabIntro, setDisableNewTabIntro] = useState(
    () => initialSettings.disableNewTabIntro,
  );
  const [includePrereleaseUpdates, setIncludePrereleaseUpdates] = useState(
    () => initialSettings.includePrereleaseUpdates,
  );
  const [themes, setThemes] = useState<ThemeEntry[]>(() => getAllThemes());
  const [layouts, setLayouts] = useState<LayoutEntry[]>(() => getAllLayouts());
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [layoutDropdownOpen, setLayoutDropdownOpen] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const themeFileInputRef = useRef<HTMLInputElement | null>(null);
  const layoutFileInputRef = useRef<HTMLInputElement | null>(null);
  const layoutDropdownRef = useRef<HTMLDivElement | null>(null);
  const themeDropdownRef = useRef<HTMLDivElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckPayload | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isRunningUpdateAction, setIsRunningUpdateAction] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [isDefaultBrowser, setIsDefaultBrowser] = useState<boolean | null>(null);
  const [canAttemptDefaultBrowserRegistration, setCanAttemptDefaultBrowserRegistration] = useState(
    true,
  );
  const [defaultBrowserStatus, setDefaultBrowserStatus] = useState('');
  const [isCheckingDefaultBrowser, setIsCheckingDefaultBrowser] = useState(false);
  const [isSettingDefaultBrowser, setIsSettingDefaultBrowser] = useState(false);
  const isFirstAutoSaveRef = useRef(true);
  const clearSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { navigate } = useTabs();

  const handleThemeChange = (nextThemeId: string) => {
    setThemeId(nextThemeId);
    setSaveStatus('saving');
    applyTheme(getThemeById(nextThemeId));
  };

  const handleLayoutChange = (nextLayoutId: string) => {
    setLayoutId(nextLayoutId);
    setSaveStatus('saving');
    applyLayout(getLayoutById(nextLayoutId));
  };

  const handleDeleteTheme = (deleteThemeId: string) => {
    const deleted = deleteCustomTheme(deleteThemeId);
    if (!deleted) return;

    const updatedThemes = getAllThemes();
    setThemes(updatedThemes);
    setSaveStatus('saving');

    if (themeId === deleteThemeId) {
      const fallbackThemeId = updatedThemes[0]?.id ?? DEFAULT_BROWSER_SETTINGS.themeId;
      setThemeId(fallbackThemeId);
      applyTheme(getThemeById(fallbackThemeId));
    }

    setImportMessage('Theme deleted.');
  };

  const handleDeleteLayout = (deleteLayoutId: string) => {
    const deleted = deleteCustomLayout(deleteLayoutId);
    if (!deleted) return;

    const updatedLayouts = getAllLayouts();
    setLayouts(updatedLayouts);
    setSaveStatus('saving');

    if (layoutId === deleteLayoutId) {
      const fallbackLayoutId = updatedLayouts[0]?.id ?? DEFAULT_BROWSER_SETTINGS.layoutId;
      setLayoutId(fallbackLayoutId);
      applyLayout(getLayoutById(fallbackLayoutId));
    }

    setImportMessage('Layout deleted.');
  };

  const handleImportTheme = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importThemeFromJson(text);
      const updatedThemes = getAllThemes();

      setThemes(updatedThemes);
      setThemeId(imported.id);
      applyTheme(imported.theme);
      setSaveStatus('saving');
      setImportMessage(`Imported: ${imported.theme.name} by ${imported.theme.author}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import theme JSON.';
      setImportMessage(message);
    }
  };

  useEffect(() => {
    if (isFirstAutoSaveRef.current) {
      isFirstAutoSaveRef.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveBrowserSettings({
        newTabPage,
        themeId,
        rawFileDarkModeEnabled,
        layoutId,
        tabSleepValue,
        tabSleepUnit,
        tabSleepMode,
        devToolsOpenMode,
        adBlockEnabled,
        quitOnLastWindowClose,
        showNewTabBranding,
        disableNewTabIntro,
        includePrereleaseUpdates,
      });
      setSaveStatus('saved');

      if (clearSavedTimerRef.current) {
        clearTimeout(clearSavedTimerRef.current);
      }
      clearSavedTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, SAVED_BADGE_MS);
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    newTabPage,
    themeId,
    rawFileDarkModeEnabled,
    layoutId,
    tabSleepValue,
    tabSleepUnit,
    tabSleepMode,
    devToolsOpenMode,
    adBlockEnabled,
    quitOnLastWindowClose,
    showNewTabBranding,
    disableNewTabIntro,
    includePrereleaseUpdates,
  ]);

  useEffect(() => {
    return () => {
      if (clearSavedTimerRef.current) {
        clearTimeout(clearSavedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!layoutDropdownOpen && !themeDropdownOpen) return;

    const isInsideDropdown = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      return (
        !!layoutDropdownRef.current?.contains(target) ||
        !!themeDropdownRef.current?.contains(target)
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideDropdown(event.target)) {
        setLayoutDropdownOpen(false);
        setThemeDropdownOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isInsideDropdown(event.target)) {
        setLayoutDropdownOpen(false);
        setThemeDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLayoutDropdownOpen(false);
        setThemeDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [layoutDropdownOpen, themeDropdownOpen]);

  const selectedTheme = themes.find((entry) => entry.id === themeId) ?? themes[0] ?? null;
  const selectedLayout = layouts.find((entry) => entry.id === layoutId) ?? layouts[0] ?? null;
  const formatThemeLabel = (entry: ThemeEntry) => {
    const modeLabel = entry.theme.mode === 'light' ? 'Light' : 'Dark';
    return `${entry.theme.name} - ${entry.theme.author} (${modeLabel})`;
  };

  const handleImportLayout = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importLayoutFromJson(text);
      const updatedLayouts = getAllLayouts();

      setLayouts(updatedLayouts);
      setLayoutId(imported.id);
      applyLayout(imported.layout);
      setSaveStatus('saving');
      setImportMessage(`Imported layout: ${imported.layout.name} by ${imported.layout.author}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import layout JSON.';
      setImportMessage(message);
    }
  };
  const formatLayoutLabel = (entry: LayoutEntry) => `${entry.layout.name} - ${entry.layout.author}`;

  const checkForUpdates = async () => {
    if (!electron?.ipcRenderer) {
      setUpdateStatus('Update checks are only available in the desktop app.');
      return;
    }

    setIsCheckingUpdates(true);
    setUpdateStatus('');
    setUpdateCheckResult(null);
    try {
      const response = await electron.ipcRenderer.invoke<UpdateCheckResponse>('updates-check', {
        includePrerelease: includePrereleaseUpdates,
      });

      if (!response.ok) {
        setUpdateStatus(response.error);
        return;
      }

      const result = response.data;
      setUpdateCheckResult(result);

      if (!result.hasUpdate) {
        setUpdateStatus(`You are up to date (v${result.currentVersion}).`);
        return;
      }

      const prereleaseLabel = result.latestIsPrerelease ? ' (pre-release)' : '';
      setUpdateStatus(`Update available: v${result.latestVersion}${prereleaseLabel}.`);
    } catch {
      setUpdateStatus('Failed to check for updates.');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const runUpdateAction = async () => {
    if (!electron?.ipcRenderer || !updateCheckResult || !updateCheckResult.hasUpdate) return;

    setIsRunningUpdateAction(true);
    try {
      if (updateCheckResult.mode === 'portable') {
        await electron.ipcRenderer.invoke('updates-open-download', updateCheckResult.downloadUrl);
        setUpdateStatus('Opened update download in your browser.');
        return;
      }

      const response = await electron.ipcRenderer.invoke<{ ok: boolean; error?: string }>(
        'updates-download-and-install',
        {
          downloadUrl: updateCheckResult.downloadUrl,
          assetName: updateCheckResult.assetName,
        },
      );
      if (!response.ok) {
        setUpdateStatus(response.error || 'Failed to download update.');
        return;
      }

      setUpdateStatus('Update downloaded. Installer launched.');
    } catch {
      setUpdateStatus('Failed to run update action.');
    } finally {
      setIsRunningUpdateAction(false);
    }
  };

  const refreshDefaultBrowserStatus = async () => {
    if (!electron?.ipcRenderer) {
      setDefaultBrowserStatus('Default browser controls are only available in the desktop app.');
      return;
    }

    setIsCheckingDefaultBrowser(true);
    setDefaultBrowserStatus('');
    try {
      const response =
        await electron.ipcRenderer.invoke<DefaultBrowserStatusResponse>('default-browser-status');
      setIsDefaultBrowser(response.isDefault);
      setCanAttemptDefaultBrowserRegistration(response.support?.canAttemptRegistration ?? true);
      setDefaultBrowserStatus(
        response.isDefault
          ? 'Mira is already your default browser.'
          : response.message || response.support?.message || '',
      );
    } catch {
      setDefaultBrowserStatus('Failed to check default browser status.');
    } finally {
      setIsCheckingDefaultBrowser(false);
    }
  };

  const setAsDefaultBrowser = async () => {
    if (!electron?.ipcRenderer) {
      setDefaultBrowserStatus('Default browser controls are only available in the desktop app.');
      return;
    }

    setIsSettingDefaultBrowser(true);
    setDefaultBrowserStatus('');
    try {
      const response =
        await electron.ipcRenderer.invoke<SetDefaultBrowserResponse>('default-browser-set');
      setIsDefaultBrowser(response.isDefault);
      setCanAttemptDefaultBrowserRegistration(response.support?.canAttemptRegistration ?? true);
      setDefaultBrowserStatus(
        response.message
          || response.support?.message
          || (response.ok
            ? response.requiresUserAction
              ? 'Mira was registered for web links. Confirm Mira in your OS default apps settings, then refresh status.'
              : 'Mira is now set as your default browser.'
            : 'Could not set Mira as default browser. Check your OS default apps settings.'),
      );
    } catch {
      setDefaultBrowserStatus('Failed to set default browser.');
    } finally {
      setIsSettingDefaultBrowser(false);
    }
  };

  useEffect(() => {
    void refreshDefaultBrowserStatus();
    // Run once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <h1 className="settings-title">Settings</h1>
        </div>
        <div className="settings-header-actions">
          {saveStatus === 'saving' && <div className="theme-text2 settings-save-indicator">Saving...</div>}
          {saveStatus === 'saved' && <div className="theme-text2 settings-save-indicator">Saved</div>}
        </div>
      </header>

      <div className="settings-body">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
        >
          {SETTINGS_SECTION_TABS.map((section) => (
            <button
              key={section.id}
              id={`settings-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls={`settings-panel-${section.id}`}
              onClick={() => {
                setActiveSection(section.id);
                setThemeDropdownOpen(false);
                setLayoutDropdownOpen(false);
              }}
              className={`theme-btn theme-btn-nav settings-tab-btn ${
                activeSection === section.id ? 'settings-tab-btn-active' : ''
              }`}
            >
              <span className="settings-tab-label">{section.label}</span>
            </button>
          ))}
        </div>

        <div
          id={`settings-panel-${activeSection}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeSection}`}
          className="settings-section"
        >
        {activeSection === 'general' && (
          <>
            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">New Tab</h2>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="new-tab-page"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">New Tab Page URL</span>
                  <span className="settings-setting-description">
                    URL opened whenever a new tab is created.
                  </span>
                </label>
                <input
                  id="new-tab-page"
                  type="text"
                  value={newTabPage}
                  onChange={(e) => {
                    setNewTabPage(e.target.value);
                    setSaveStatus('saving');
                  }}
                  placeholder={DEFAULT_BROWSER_SETTINGS.newTabPage}
                  className="theme-input settings-text-input settings-setting-control settings-setting-control-grow settings-setting-control-right"
                />
              </div>
              <label
                htmlFor="show-new-tab-branding"
                className="settings-setting-row"
              >
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Show New Tab branding</span>
                  <span className="settings-setting-description">
                    Display Mira logo and welcome message on new tabs.
                  </span>
                </span>
                <input
                  id="show-new-tab-branding"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={showNewTabBranding}
                  onChange={(e) => {
                    setShowNewTabBranding(e.currentTarget.checked);
                    setSaveStatus('saving');
                  }}
                />
              </label>
              <label
                htmlFor="disable-new-tab-intro"
                className="settings-setting-row"
              >
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Disable intro animation</span>
                  <span className="settings-setting-description">
                    Skip the new-tab intro animation at all times.
                  </span>
                </span>
                <input
                  id="disable-new-tab-intro"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={disableNewTabIntro}
                  onChange={(e) => {
                    setDisableNewTabIntro(e.currentTarget.checked);
                    setSaveStatus('saving');
                  }}
                />
              </label>
            </section>

            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Tab Sleep</h2>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="tab-sleep-value"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">Sleep timeout</span>
                  <span className="settings-setting-description">
                    Time a background tab waits before sleep mode is applied.
                  </span>
                </label>
                <div className="settings-inline-controls settings-setting-control settings-setting-control-grow settings-setting-control-right">
                  <input
                    id="tab-sleep-value"
                    type="number"
                    min={1}
                    step={1}
                    value={tabSleepValue}
                    onChange={(e) => {
                      const nextValue = e.currentTarget.valueAsNumber;
                      if (!Number.isFinite(nextValue)) return;
                      setTabSleepValue(Math.max(1, Math.floor(nextValue)));
                      setSaveStatus('saving');
                    }}
                    className="theme-input settings-number-input"
                  />
                  <select
                    id="tab-sleep-unit"
                    value={tabSleepUnit}
                    onChange={(e) => {
                      const nextUnit = e.currentTarget.value;
                      if (nextUnit === 'seconds' || nextUnit === 'minutes' || nextUnit === 'hours') {
                        setTabSleepUnit(nextUnit);
                      }
                      setSaveStatus('saving');
                    }}
                    className="theme-input settings-select-input"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="tab-sleep-mode"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">Sleep behavior</span>
                  <span className="settings-setting-description">
                    Choose whether sleeping tabs freeze state or get discarded.
                  </span>
                </label>
                <select
                  id="tab-sleep-mode"
                  value={tabSleepMode}
                  onChange={(e) => {
                    const nextMode = e.currentTarget.value;
                    if (nextMode === 'freeze' || nextMode === 'discard') {
                      setTabSleepMode(nextMode as TabSleepMode);
                    }
                    setSaveStatus('saving');
                  }}
                  className="theme-input settings-select-input settings-select-limit settings-setting-control"
                >
                  <option value="freeze">Freeze (keep page state)</option>
                  <option value="discard">Discard (save more memory)</option>
                </select>
              </div>
            </section>

            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Browsing</h2>
              </div>
              <label
                htmlFor="ad-block-enabled"
                className="settings-setting-row"
              >
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Enable ad blocking</span>
                  <span className="settings-setting-description">
                    Block known ad and tracker requests while browsing.
                  </span>
                </span>
                <input
                  id="ad-block-enabled"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={adBlockEnabled}
                  onChange={(e) => {
                    setAdBlockEnabled(e.currentTarget.checked);
                    setSaveStatus('saving');
                  }}
                />
              </label>
            </section>
          </>
        )}

        {activeSection === 'customization' && (
          <>
            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Layout</h2>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="layout-dropdown-button"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">Active layout</span>
                  <span className="settings-setting-description">
                    Choose which layout profile is used by the browser UI.
                  </span>
                </label>
                <div
                  ref={layoutDropdownRef}
                  className="settings-dropdown-wrap settings-setting-control settings-setting-control-grow"
                >
                  <button
                    id="layout-dropdown-button"
                    type="button"
                    onClick={() =>
                      setLayoutDropdownOpen((open) => {
                        const nextOpen = !open;
                        if (nextOpen) setThemeDropdownOpen(false);
                        return nextOpen;
                      })
                    }
                    className={`theme-btn theme-btn-nav settings-dropdown-trigger ${
                      layoutDropdownOpen ? 'settings-dropdown-trigger-open' : ''
                    }`}
                  >
                    <span className="settings-dropdown-value">
                      {selectedLayout ? formatLayoutLabel(selectedLayout) : 'No layouts available'}
                    </span>
                    {layoutDropdownOpen ? (
                      <ChevronUp
                        size={14}
                        className="settings-dropdown-caret-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        size={14}
                        className="settings-dropdown-caret-icon"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {layoutDropdownOpen && (
                    <div className="theme-panel settings-dropdown-menu">
                      {layouts.map((entry) => (
                        <div
                          key={entry.id}
                          className="settings-dropdown-item"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleLayoutChange(entry.id);
                              setLayoutDropdownOpen(false);
                            }}
                            className={`theme-btn settings-dropdown-choice ${
                              entry.id === layoutId
                                ? 'theme-btn-go settings-dropdown-choice-selected'
                                : 'theme-btn-nav'
                            }`}
                          >
                            <span className="settings-dropdown-choice-label">{formatLayoutLabel(entry)}</span>
                            {entry.id === layoutId && (
                              <Check
                                size={14}
                                className="settings-dropdown-choice-check"
                                aria-hidden="true"
                              />
                            )}
                          </button>

                          {entry.source === 'custom' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteLayout(entry.id)}
                              className="theme-btn theme-btn-nav settings-btn-pad"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-actions-row">
                <button
                  onClick={() => layoutFileInputRef.current?.click()}
                  type="button"
                  className="theme-btn theme-btn-nav settings-btn-pad"
                >
                  Add Layout JSON
                </button>
                <input
                  ref={layoutFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportLayout}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => navigate('mira://LayoutCreator')}
                  className="theme-btn theme-btn-nav settings-btn-pad"
                >
                  Open Layout Creator
                </button>
              </div>
            </section>

            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Theme</h2>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="theme-dropdown-button"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">Active theme</span>
                  <span className="settings-setting-description">
                    Choose which color theme is applied across the app.
                  </span>
                </label>
                <div
                  ref={themeDropdownRef}
                  className="settings-dropdown-wrap settings-setting-control settings-setting-control-grow"
                >
                  <button
                    id="theme-dropdown-button"
                    type="button"
                    onClick={() =>
                      setThemeDropdownOpen((open) => {
                        const nextOpen = !open;
                        if (nextOpen) setLayoutDropdownOpen(false);
                        return nextOpen;
                      })
                    }
                    className={`theme-btn theme-btn-nav settings-dropdown-trigger ${
                      themeDropdownOpen ? 'settings-dropdown-trigger-open' : ''
                    }`}
                  >
                    <span className="settings-dropdown-value">
                      {selectedTheme ? formatThemeLabel(selectedTheme) : 'No themes available'}
                    </span>
                    {themeDropdownOpen ? (
                      <ChevronUp
                        size={14}
                        className="settings-dropdown-caret-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        size={14}
                        className="settings-dropdown-caret-icon"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {themeDropdownOpen && (
                    <div className="theme-panel settings-dropdown-menu">
                      {themes.map((entry) => (
                        <div
                          key={entry.id}
                          className="settings-dropdown-item"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleThemeChange(entry.id);
                              setThemeDropdownOpen(false);
                            }}
                            className={`theme-btn settings-dropdown-choice ${
                              entry.id === themeId
                                ? 'theme-btn-go settings-dropdown-choice-selected'
                                : 'theme-btn-nav'
                            }`}
                          >
                            <span className="settings-dropdown-choice-label">{formatThemeLabel(entry)}</span>
                            {entry.id === themeId && (
                              <Check
                                size={14}
                                className="settings-dropdown-choice-check"
                                aria-hidden="true"
                              />
                            )}
                          </button>

                          {entry.source === 'custom' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTheme(entry.id)}
                              className="theme-btn theme-btn-nav settings-btn-pad"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-actions-row">
                <button
                  onClick={() => themeFileInputRef.current?.click()}
                  type="button"
                  className="theme-btn theme-btn-nav settings-btn-pad"
                >
                  Add Theme JSON
                </button>
                <input
                  ref={themeFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportTheme}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => navigate('mira://ThemeCreator')}
                  className="theme-btn theme-btn-nav settings-btn-pad"
                >
                  Open Theme Creator
                </button>
              </div>
              <label
                htmlFor="raw-file-dark-mode-enabled"
                className="settings-setting-row"
              >
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Dark mode raw files</span>
                  <span className="settings-setting-description">
                    Show plain-text/raw files as white text on a black background when a dark theme
                    is active.
                  </span>
                </span>
                <input
                  id="raw-file-dark-mode-enabled"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={rawFileDarkModeEnabled}
                  onChange={(e) => {
                    setRawFileDarkModeEnabled(e.currentTarget.checked);
                    setSaveStatus('saving');
                  }}
                />
              </label>
            </section>

            {!!importMessage && <div className="theme-text2 settings-inline-message">{importMessage}</div>}
          </>
        )}

        {activeSection === 'app' && (
          <>
            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Dev Tools</h2>
              </div>
              <div className="settings-setting-row">
                <label
                  htmlFor="devtools-open-mode"
                  className="settings-setting-meta"
                >
                  <span className="settings-setting-label">Developer Tools mode</span>
                  <span className="settings-setting-description">
                    Open DevTools docked to the side or in a separate window.
                  </span>
                </label>
                <select
                  id="devtools-open-mode"
                  value={devToolsOpenMode}
                  onChange={(e) => {
                    const nextMode = e.currentTarget.value;
                    if (nextMode === 'side' || nextMode === 'window') {
                      setDevToolsOpenMode(nextMode as DevToolsOpenMode);
                    }
                    setSaveStatus('saving');
                  }}
                  className="theme-input settings-select-input settings-select-limit settings-setting-control"
                >
                  <option value="side">Docked to side (default)</option>
                  <option value="window">Separate window</option>
                </select>
              </div>
            </section>

            {electron?.isMacOS && (
              <section className="theme-panel settings-card">
                <div className="settings-card-header">
                  <h2 className="settings-card-title">App Lifecycle</h2>
                </div>
                <label
                  htmlFor="quit-on-last-window-close"
                  className="settings-setting-row"
                >
                  <span className="settings-setting-meta">
                    <span className="settings-setting-label">Quit on last window close</span>
                    <span className="settings-setting-description">
                      Exit the app immediately after the final window closes.
                    </span>
                  </span>
                  <input
                    id="quit-on-last-window-close"
                    type="checkbox"
                    className="settings-toggle settings-setting-control"
                    checked={quitOnLastWindowClose}
                    onChange={(e) => {
                      setQuitOnLastWindowClose(e.currentTarget.checked);
                      setSaveStatus('saving');
                    }}
                  />
                </label>
              </section>
            )}

            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Default Browser</h2>
              </div>
              <div className="settings-setting-row">
                <div className="settings-setting-meta">
                  <span className="settings-setting-label">System default app for links</span>
                  <span className="settings-setting-description">
                    Register Mira to open <code>http</code> and <code>https</code> links by default.
                  </span>
                </div>
                <div className="settings-actions-row settings-setting-control settings-setting-control-grow settings-setting-control-right">
                  <button
                    type="button"
                    onClick={refreshDefaultBrowserStatus}
                    className="theme-btn theme-btn-nav settings-btn-pad"
                    disabled={isCheckingDefaultBrowser}
                  >
                    {isCheckingDefaultBrowser ? 'Checking...' : 'Refresh Status'}
                  </button>
                  <button
                    type="button"
                    onClick={setAsDefaultBrowser}
                    className="theme-btn theme-btn-go settings-btn-pad"
                    disabled={
                      isSettingDefaultBrowser
                      || isDefaultBrowser === true
                      || !canAttemptDefaultBrowserRegistration
                    }
                  >
                    {isSettingDefaultBrowser
                      ? 'Setting...'
                      : !canAttemptDefaultBrowserRegistration
                        ? 'Unavailable'
                      : isDefaultBrowser
                        ? 'Already Default'
                        : 'Make Default'}
                  </button>
                </div>
              </div>
              {!!defaultBrowserStatus && (
                <div className="theme-text2 settings-status">{defaultBrowserStatus}</div>
              )}
            </section>

            <section className="theme-panel settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Updates</h2>
              </div>
              <label
                htmlFor="include-prerelease-updates"
                className="settings-setting-row"
              >
                <span className="settings-setting-meta">
                  <span className="settings-setting-label">Include pre-release updates</span>
                  <span className="settings-setting-description">
                    Also check beta/preview builds when searching for updates.
                  </span>
                </span>
                <input
                  id="include-prerelease-updates"
                  type="checkbox"
                  className="settings-toggle settings-setting-control"
                  checked={includePrereleaseUpdates}
                  onChange={(e) => {
                    setIncludePrereleaseUpdates(e.currentTarget.checked);
                    setSaveStatus('saving');
                  }}
                />
              </label>
              <div className="settings-setting-row">
                <div className="settings-setting-meta">
                  <span className="settings-setting-label">Update actions</span>
                  <span className="settings-setting-description">
                    Check for updates and install/download when available.
                  </span>
                </div>
                <div className="settings-actions-row settings-setting-control settings-setting-control-grow settings-setting-control-right">
                  <button
                    type="button"
                    onClick={checkForUpdates}
                    className="theme-btn theme-btn-nav settings-btn-pad"
                    disabled={isCheckingUpdates}
                  >
                    {isCheckingUpdates ? 'Checking...' : 'Check for Updates'}
                  </button>
                  {updateCheckResult?.hasUpdate && (
                    <button
                      type="button"
                      onClick={runUpdateAction}
                      className="theme-btn theme-btn-go settings-btn-pad"
                      disabled={isRunningUpdateAction}
                    >
                      {isRunningUpdateAction
                        ? 'Working...'
                        : updateCheckResult.mode === 'portable'
                          ? 'Download'
                          : 'Download and Install'}
                    </button>
                  )}
                </div>
              </div>
              {!!updateStatus && <div className="theme-text2 settings-status">{updateStatus}</div>}
            </section>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
