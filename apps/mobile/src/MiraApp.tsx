import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, {
  type FileDownload,
  type WebViewNavigation,
} from 'react-native-webview';
import { getAppState, saveAppState } from './app/appState';
import { createId } from './app/ids';
import { BookmarksProvider, useBookmarks } from './features/bookmarks/BookmarksProvider';
import DownloadProvider, { useDownloads } from './features/downloads/DownloadProvider';
import {
  DEFAULT_BROWSER_SETTINGS,
  getBrowserSettings,
  saveBrowserSettings,
  SEARCH_ENGINE_OPTIONS,
  type BrowserSettings,
} from './features/settings/browserSettings';
import TabsProvider, { useTabs } from './features/tabs/TabsProvider';
import type { Tab } from './features/tabs/types';
import { getLayoutById } from './features/layouts/layoutLoader';
import { getThemeById } from './features/themes/themeLoader';
import InternalPageRouter from './internal/InternalPageRouter';
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Plus,
  BookMarked,
  Clock,
  Download,
  Settings,
  Palette,
  LayoutGrid,
  RefreshCw,
  X,
  Search,
  Menu,
  Copy,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Share2,
} from 'lucide-react-native';
import { AppButton, ChoiceChips, IconButton, MenuButton, TabCountButton, type MobileTheme, stylesFor } from './internal/shared';
import { initializeStorageCache } from './storage/cacheStorage';

function parseSizeValue(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveMobileTheme(settings: BrowserSettings): MobileTheme {
  const theme = getThemeById(settings.themeId);
  const layout = getLayoutById(settings.layoutId);
  const colors = theme?.colors ?? {};
  const values = layout?.values ?? {};
  const isDark = (theme?.mode ?? 'dark') === 'dark';

  // Derive accent from theme colors the same way desktop does.
  // Mira themes use tabBorderActive/downloadButtonBg (pink/red) as accent.
  // Default themes use neutral grays matching desktop CSS defaults.
  const accentCandidate = colors.tabBorderActive ?? colors.downloadButtonBg ?? colors.urlBarBorderActive;
  const isMiraTheme = theme?.name?.toLowerCase().includes('mira') ?? false;
  const accent = accentCandidate ?? (isDark ? (isMiraTheme ? '#FF268A' : '#8f8f85') : (isMiraTheme ? '#FF268A' : '#8f8f85'));
  const accentSoft = colors.tabBgActive ?? colors.surfaceBgActive ?? (isDark ? (isMiraTheme ? '#201135' : '#77776f') : (isMiraTheme ? '#200840' : '#77776f'));

  return {
    isDark,
    colors: {
      background: colors.bg ?? (isDark ? '#141414' : '#f5f5f3'),
      surface: colors.surfaceBg ?? colors.tabBg ?? (isDark ? '#1d1d1d' : '#e9e9e6'),
      surfaceAlt: colors.surfaceBgHover ?? colors.tabBgHover ?? (isDark ? '#272727' : '#ddddda'),
      border: colors.surfaceBorder ?? colors.tabBorder ?? (isDark ? '#353535' : '#bfbfb9'),
      text: colors.text1 ?? (isDark ? '#e8e8e8' : '#191919'),
      textMuted: colors.text2 ?? (isDark ? '#b9b9b9' : '#494949'),
      textDim: colors.text3 ?? (isDark ? '#8f8f8f' : '#707070'),
      accent,
      accentSoft,
      inputBackground: colors.fieldBg ?? colors.urlBarBg ?? (isDark ? '#181818' : '#ffffff'),
      inputBorder: colors.fieldBorder ?? colors.urlBarBorder ?? (isDark ? '#3a3a3a' : '#b3b3ab'),
      buttonBackground: colors.navButtonBgActive ?? colors.downloadButtonBg ?? (isDark ? '#ffffff2e' : '#00000024'),
      buttonText: colors.navButtonTextActive ?? colors.downloadButtonText ?? (isDark ? '#ffffff' : '#1a1a1a'),
      danger: '#d65353',
      success: '#34b26f',
    },
    metrics: {
      radius: parseSizeValue(values.layoutControlRadius, 12),
      panelRadius: parseSizeValue(values.layoutPanelRadius, 18),
      spacing: 12,
      controlHeight: parseSizeValue(values.layoutSettingsControlHeight, 42),
      tabHeight: parseSizeValue(values.layoutTabHeight, 42),
    },
  };
}

function OnboardingScreen({
  theme,
  settings,
  updateSettings,
  onFinish,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
  onFinish: () => void;
}) {
  const styles = stylesFor(theme);
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageScroll}>
        <Text style={styles.title}>Welcome to Mira Mobile</Text>
        <Text style={styles.subtitle}>
          This Android app mirrors Mira&apos;s desktop features where they make sense on a phone: tabs,
          bookmarks, history, settings, themes, layouts, downloads, internal pages, and session restore.
        </Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick setup</Text>
          <ChoiceChips
            theme={theme}
            value={settings.searchEngine}
            options={SEARCH_ENGINE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => updateSettings({ searchEngine: value })}
          />
          <View style={styles.cardRow}>
            <AppButton
              theme={theme}
              label={settings.adBlockEnabled ? 'Ad Block On' : 'Ad Block Off'}
              onPress={() => updateSettings({ adBlockEnabled: !settings.adBlockEnabled })}
            />
            <AppButton
              theme={theme}
              label={settings.trackerBlockEnabled ? 'Tracker Block On' : 'Tracker Block Off'}
              onPress={() =>
                updateSettings({ trackerBlockEnabled: !settings.trackerBlockEnabled })
              }
            />
            <AppButton
              theme={theme}
              label={settings.showNewTabBranding ? 'Branding On' : 'Branding Off'}
              onPress={() => updateSettings({ showNewTabBranding: !settings.showNewTabBranding })}
            />
          </View>
        </View>
        <AppButton theme={theme} label="Start Browsing" primary onPress={onFinish} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Sheet({
  visible,
  onClose,
  title,
  children,
  theme,
  fullScreen = false,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  theme: MobileTheme;
  fullScreen?: boolean;
}) {
  const styles = stylesFor(theme);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollY = useRef(0);

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    setIsAtTop(scrollY.current <= 0);
  };

  const handleScrollEndDrag = (event: { nativeEvent: { velocity?: { y?: number }; contentOffset: { y: number } } }) => {
    const velocity = event.nativeEvent.velocity?.y ?? 0;
    const y = event.nativeEvent.contentOffset.y;
    if (y <= 0 && velocity > 0.5) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: fullScreen ? 0 : theme.metrics.panelRadius,
            borderTopRightRadius: fullScreen ? 0 : theme.metrics.panelRadius,
            padding: theme.metrics.spacing,
            gap: theme.metrics.spacing,
            height: fullScreen ? '100%' : '50%',
          }}
          onPress={() => undefined}
        >
          <Pressable style={{ alignItems: 'center', paddingBottom: 4 }} onPress={onClose}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
          </Pressable>
          {title && <Text style={styles.sectionTitle}>{title}</Text>}
          <ScrollView
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
            scrollEventThrottle={16}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BookmarksStrip({ theme }: { theme: MobileTheme }) {
  const styles = stylesFor(theme);
  const { bookmarks } = useBookmarks();
  const { navigate, openBookmarks } = useTabs();
  const topLevel = bookmarks.slice(0, 10);

  if (!topLevel.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
      {topLevel.map((bookmark) => (
        <Pressable
          key={bookmark.id}
          style={styles.chip}
          onPress={() => {
            if (bookmark.type === 'folder') {
              openBookmarks();
              return;
            }
            if (bookmark.url) navigate(bookmark.url);
          }}
        >
          <Text style={styles.chipText}>{bookmark.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MobileWebTab({
  tab,
  settings,
  theme,
}: {
  tab: Tab;
  settings: BrowserSettings;
  theme: MobileTheme;
}) {
  const { registerWebView, updateTabNavigationState, updateTabProgress, navigate, newTab } = useTabs();
  const { upsertDownload, updateDownload } = useDownloads();
  const webViewRef = useRef<WebView | null>(null);

  useEffect(() => {
    registerWebView(tab.id, {
      goBack: () => webViewRef.current?.goBack(),
      goForward: () => webViewRef.current?.goForward(),
      reload: () => webViewRef.current?.reload(),
      stopLoading: () => webViewRef.current?.stopLoading(),
      injectJavaScript: (script: string) => webViewRef.current?.injectJavaScript(script),
    });
    return () => registerWebView(tab.id, null);
  }, [registerWebView, tab.id]);

  return (
    <WebView
      key={`${tab.id}-${tab.reloadToken}`}
      ref={webViewRef}
      source={{ uri: tab.url }}
      setSupportMultipleWindows
      onNavigationStateChange={(state: WebViewNavigation) => {
        updateTabNavigationState(tab.id, {
          url: state.url,
          title: state.title,
          canGoBack: state.canGoBack,
          canGoForward: state.canGoForward,
          loading: state.loading,
        });
      }}
      onLoadProgress={(event) => updateTabProgress(tab.id, event.nativeEvent.progress)}
      onShouldStartLoadWithRequest={(request) => {
        const url = request.url.trim();
        if (url.startsWith('mira://')) {
          navigate(url, tab.id, { skipInputNormalization: true, fromWebView: true });
          return false;
        }
        if (url.startsWith('mailto:')) {
          navigate(`mira://mailto?url=${encodeURIComponent(url)}`, tab.id, {
            skipInputNormalization: true,
            fromWebView: true,
          });
          return false;
        }
        if (url.startsWith('http://')) {
          navigate(`mira://errors/unsecure-site?url=${encodeURIComponent(url)}`, tab.id, {
            skipInputNormalization: true,
            fromWebView: true,
          });
          return false;
        }
        if (
          !url.startsWith('https://')
          && !url.startsWith('about:blank')
          && !url.startsWith('data:')
        ) {
          Linking.openURL(url).catch(() => undefined);
          return false;
        }
        return true;
      }}
      onOpenWindow={(event) => {
        newTab(event.nativeEvent.targetUrl || 'about:blank');
      }}
      onFileDownload={(event: { nativeEvent: FileDownload }) => {
        const id = createId('download');
        upsertDownload({
          id,
          url: event.nativeEvent.downloadUrl,
          filename: event.nativeEvent.downloadUrl.split('/').pop() || 'download',
          totalBytes: 0,
          receivedBytes: 0,
          status: 'pending',
          startedAt: Date.now(),
        });
        Linking.openURL(event.nativeEvent.downloadUrl)
          .then(() => {
            updateDownload(id, {
              status: 'completed',
              endedAt: Date.now(),
              error: 'Handed off to Android download handling.',
            });
          })
          .catch(() => {
            updateDownload(id, {
              status: 'error',
              endedAt: Date.now(),
              error: 'Unable to hand the download off to Android.',
            });
          });
      }}
      onRenderProcessGone={(event: { nativeEvent: { didCrash: boolean } }) => {
        if (event.nativeEvent.didCrash) {
          navigate('mira://errors/crash', tab.id, {
            skipInputNormalization: true,
            fromWebView: true,
          });
        }
      }}
      incognito={!settings.cookiesEnabled}
      domStorageEnabled
      cacheEnabled
      javaScriptEnabled
      startInLoadingState
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      injectedJavaScriptBeforeContentLoaded={
        settings.adBlockEnabled || settings.trackerBlockEnabled
          ? `
            (function() {
              try {
                var selectors = ['iframe[src*="ads"]', '[class*="ad-"]', '[id*="ad-"]', '[data-testid*="ad"]'];
                var hide = function () {
                  selectors.forEach(function (selector) {
                    document.querySelectorAll(selector).forEach(function (node) {
                      node.style.display = 'none';
                    });
                  });
                };
                hide();
                new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
              } catch (error) {}
              true;
            })();
          `
          : undefined
      }
    />
  );
}

function BrowserChrome({
  settings,
  updateSettings,
  theme,
}: {
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
  theme: MobileTheme;
}) {
  const styles = stylesFor(theme);
  const {
    tabs,
    activeTab,
    newTab,
    duplicateTab,
    reopenLastClosedTab,
    canReopenClosedTab,
    openBookmarks,
    openDownloads,
    openHistory,
    openLayoutCreator,
    openSettings,
    openThemeCreator,
    openUpdates,
    bookmarkAllTabs,
    bookmarkCurrentPage,
    closeOtherTabs,
    closeTab,
    closeTabsToRight,
    goBack,
    goForward,
    navigate,
    reload,
    searchInPage,
    setActive,
  } = useTabs();
  const [addressValue, setAddressValue] = useState(activeTab?.url ?? settings.newTabPage);
  const [tabSheetOpen, setTabSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [findSheetOpen, setFindSheetOpen] = useState(false);
  const [findValue, setFindValue] = useState('');

  useEffect(() => {
    setAddressValue(activeTab?.url ?? settings.newTabPage);
  }, [activeTab?.url, settings.newTabPage]);

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {!activeTab?.url?.startsWith('mira://NewTab') && (
        <View style={{ padding: theme.metrics.spacing, gap: theme.metrics.spacing }}>
          <View style={styles.row}>
            <TextInput
              value={addressValue}
              onChangeText={setAddressValue}
              placeholder="Search or enter address"
              placeholderTextColor={theme.colors.textDim}
              style={[styles.textInput, { flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => navigate(addressValue)}
            />
          </View>
          {settings.showBookmarksBar && <BookmarksStrip theme={theme} />}
        </View>
      )}
      <View style={{ flex: 1 }}>
        {activeTab ? (
          activeTab.url.startsWith('mira://') ? (
            <InternalPageRouter
              url={activeTab.url}
              mobileTheme={theme}
              settings={settings}
              updateSettings={updateSettings}
            />
          ) : (
            <MobileWebTab tab={activeTab} settings={settings} theme={theme} />
          )
        ) : null}
        {tabSheetOpen && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.surface,
              padding: theme.metrics.spacing,
            }}
          >
            <Pressable style={{ alignItems: 'center', paddingBottom: 12 }} onPress={() => setTabSheetOpen(false)}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
            </Pressable>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 15, fontWeight: '500' }}>{tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <IconButton theme={theme} icon={Plus} onPress={() => newTab()} />
                {canReopenClosedTab && <IconButton theme={theme} icon={RefreshCw} onPress={reopenLastClosedTab} />}
              </View>
            </View>
            <ScrollView>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {tabs.map((tab) => {
                  const domain = tab.url?.replace(/^https?:\/\//, '').split('/')[0] || '';
                  const letter = domain.charAt(0).toUpperCase() || '?';
                  return (
                    <Pressable
                      key={tab.id}
                      style={{
                        width: '31%',
                        aspectRatio: 0.75,
                        backgroundColor: theme.colors.background,
                        borderRadius: theme.metrics.radius,
                        borderWidth: activeTab?.id === tab.id ? 2 : 1,
                        borderColor: activeTab?.id === tab.id ? theme.colors.accent : theme.colors.border,
                        overflow: 'hidden',
                      }}
                      onPress={() => { setActive(tab.id); setTabSheetOpen(false); }}
                    >
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.inputBackground }}>
                        <Text style={{ fontSize: 32, fontWeight: '300', color: theme.colors.textMuted }}>{letter}</Text>
                        <Text style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 4, paddingHorizontal: 4 }} numberOfLines={1}>{domain}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 6 }}>
                        <IconButton theme={theme} icon={X} onPress={() => closeTab(tab.id)} danger />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {!tabs.length && <Text style={styles.empty}>No tabs open.</Text>}
              {canReopenClosedTab && !tabs.length && <Text style={styles.mutedText}>Recently closed tabs can be reopened.</Text>}
            </ScrollView>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          padding: theme.metrics.spacing,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <IconButton theme={theme} icon={ChevronLeft} onPress={goBack} />
        <IconButton theme={theme} icon={ChevronRight} onPress={goForward} />
        <IconButton theme={theme} icon={Plus} onPress={() => newTab()} />
        <TabCountButton theme={theme} count={tabs.length} onPress={() => setTabSheetOpen(!tabSheetOpen)} />
        <IconButton theme={theme} icon={Menu} onPress={() => { setTabSheetOpen(false); setMenuOpen(true); }} />
      </View>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} theme={theme}>
        {!!activeTab && (
          <>
            <View style={{ flexDirection: 'column', gap: 2 }}>
              <MenuButton theme={theme} label="Refresh" onPress={() => { reload(); setMenuOpen(false); }} />
              <MenuButton theme={theme} label="Duplicate Tab" onPress={() => { duplicateTab(activeTab.id); setMenuOpen(false); }} />
              <MenuButton theme={theme} label="Bookmark Page" onPress={() => { bookmarkCurrentPage(); setMenuOpen(false); }} />
              <MenuButton theme={theme} label="Share" onPress={() => { if (activeTab?.url) Share.share({ url: activeTab.url, title: activeTab.title }); setMenuOpen(false); }} />
              <MenuButton theme={theme} label="Close Tab" danger onPress={() => { closeTab(activeTab.id); setMenuOpen(false); }} />
            </View>
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />
          </>
        )}
        <View style={{ flexDirection: 'column', gap: 2 }}>
          <MenuButton theme={theme} label="Bookmarks" onPress={openBookmarks} />
          <MenuButton theme={theme} label="History" onPress={openHistory} />
          <MenuButton theme={theme} label="Downloads" onPress={openDownloads} />
          <MenuButton theme={theme} label="Settings" onPress={openSettings} />
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />
        <View style={{ flexDirection: 'column', gap: 2 }}>
          <MenuButton theme={theme} label="Bookmark All Tabs" onPress={bookmarkAllTabs} />
          <MenuButton theme={theme} label="Find in Page" onPress={() => setFindSheetOpen(true)} />
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />
        <View style={{ flexDirection: 'column', gap: 2 }}>
          <MenuButton theme={theme} label="Theme Creator" onPress={openThemeCreator} />
          <MenuButton theme={theme} label="Layout Creator" onPress={openLayoutCreator} />
          <MenuButton theme={theme} label="Check for Updates" onPress={openUpdates} />
        </View>
      </Sheet>

      <Sheet visible={findSheetOpen} onClose={() => setFindSheetOpen(false)} title="Find in Page" theme={theme}>
        <TextInput
          value={findValue}
          onChangeText={setFindValue}
          placeholder="Search in current page"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
          onSubmitEditing={() => {
            searchInPage(findValue);
            setFindSheetOpen(false);
          }}
        />
        <IconButton
          theme={theme}
          icon={Search}
          primary
          onPress={() => {
            searchInPage(findValue);
            setFindSheetOpen(false);
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

function BrowserRoot({
  settings,
  updateSettings,
  theme,
}: {
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
  theme: MobileTheme;
}) {
  return (
    <BookmarksProvider>
      <TabsProvider>
        <DownloadProvider>
          <BrowserChrome settings={settings} updateSettings={updateSettings} theme={theme} />
        </DownloadProvider>
      </TabsProvider>
    </BookmarksProvider>
  );
}

export default function MiraApp() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<BrowserSettings>(DEFAULT_BROWSER_SETTINGS);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  useEffect(() => {
    initializeStorageCache().then(() => {
      const nextSettings = getBrowserSettings();
      setSettings(nextSettings);
      setOnboardingCompleted(getAppState().onboardingCompleted);
      setReady(true);
    });
  }, []);

  const theme = useMemo(() => resolveMobileTheme(settings), [settings]);
  const styles = stylesFor(theme);

  const updateSettings = (patch: Partial<BrowserSettings>) => {
    const next = saveBrowserSettings(patch);
    setSettings(next);
  };

  if (!ready) {
    return (
      <SafeAreaView style={[styles.page, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.subtitle}>Loading Mira Mobile...</Text>
      </SafeAreaView>
    );
  }

  if (!onboardingCompleted) {
    return (
      <OnboardingScreen
        theme={theme}
        settings={settings}
        updateSettings={updateSettings}
        onFinish={() => {
          saveAppState({ onboardingCompleted: true, lastOpenedAt: Date.now() });
          setOnboardingCompleted(true);
        }}
      />
    );
  }

  return <BrowserRoot settings={settings} updateSettings={updateSettings} theme={theme} />;
}
