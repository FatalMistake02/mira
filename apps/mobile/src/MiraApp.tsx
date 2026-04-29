import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { BookmarksProvider } from './features/bookmarks/BookmarksProvider';
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
  Plus,
  RefreshCw,
  X,
  Search,
  Menu,
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

type MenuState = 'closed' | 'half-open' | 'fully-open';

function MenuButtonWithGesture({
  theme,
  onPress,
  children,
}: {
  theme: MobileTheme;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);

  const handlePress = () => {
    if (!isDragging) {
      onPress();
    }
  };

  const onTouchStart = (e: { nativeEvent: { pageY: number } }) => {
    setIsDragging(true);
    dragStartY.current = e.nativeEvent.pageY;
  };

  const onTouchMove = (e: { nativeEvent: { touches: Array<{ pageY: number }> } }) => {
    if (!isDragging) return;
    
    const touch = e.nativeEvent.touches[0];
    const pageY = touch?.pageY ?? 0;
    const delta = dragStartY.current - pageY; // positive = swiping up
    
    // If swiping up significantly, trigger the menu open
    if (delta > 20) {
      setIsDragging(false);
      onPress();
    }
  };

  const onTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <Pressable
      onPress={handlePress}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        padding: 8,
        borderRadius: theme.metrics.radius,
        backgroundColor: pressed ? theme.colors.buttonBackground : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

function Sheet({
  visible,
  onClose,
  title,
  children,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  theme: MobileTheme;
}) {
  const styles = stylesFor(theme);
  const [menuState, setMenuState] = useState<MenuState>('half-open');
  const [contentScrollEnabled, setContentScrollEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const contentScrollY = useRef(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;

  // Convert menu state to height percentage
  const getHeightPercentage = (state: MenuState): number => {
    switch (state) {
      case 'closed': return 0;
      case 'half-open': return 50;
      case 'fully-open': return 85;
      default: return 50;
    }
  };

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setMenuState('half-open');
      setMenuState('half-open');
      dragStartY.current = 0;
    } else {
      // When opening, start from closed and animate to half-open
      animatedHeight.setValue(0);
      Animated.timing(animatedHeight, {
        toValue: getHeightPercentage('half-open'),
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [visible]);

  // Enable/disable content scroll based on state
  useEffect(() => {
    setContentScrollEnabled(menuState === 'fully-open');
  }, [menuState]);

  // Animate height changes
  useEffect(() => {
    if (visible) {
      Animated.timing(animatedHeight, {
        toValue: getHeightPercentage(menuState),
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [menuState, visible]);


  const onTouchStart = (e: { nativeEvent: { pageY: number } }) => {
    const pageY = e.nativeEvent.pageY;
    setIsDragging(true);
    dragStartY.current = pageY;
  };

  const onTouchMove = (e: { nativeEvent: { touches: Array<{ pageY: number }> } }) => {
    if (!isDragging) return;

    const touch = e.nativeEvent.touches[0];
    const pageY = touch?.pageY ?? 0;
    const currentHeight = getHeightPercentage(menuState);
    const delta = dragStartY.current - pageY; // positive = swiping up, negative = swiping down

    // Handle different states
    if (menuState === 'half-open') {
      if (delta > 0) {
        // Swipe up from half-open -> expand to fully-open
        const newHeight = Math.min(currentHeight + delta / 3, 85);
        animatedHeight.setValue(newHeight);
      } else if (delta < 0) {
        // Swipe down from half-open -> collapse to closed
        const absDelta = Math.abs(delta);
        const newHeight = Math.max(currentHeight - absDelta / 3, 0);
        animatedHeight.setValue(newHeight);
      }
    } else if (menuState === 'fully-open') {
      if (delta < 0) {
        // Swipe down from fully-open -> only if at top of content
        if (contentScrollY.current <= 0) {
          const absDelta = Math.abs(delta);
          const newHeight = Math.max(currentHeight - absDelta / 3, 50);
          animatedHeight.setValue(newHeight);
        }
      }
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    // Get current animated value - using addListener to safely access the value
    let finalHeight = 0;
    animatedHeight.addListener(({ value }) => {
      finalHeight = value;
    });
    animatedHeight.removeAllListeners();

    // Determine final state based on height with forgiving thresholds
    if (finalHeight > 65) {
      setMenuState('fully-open');
    } else if (finalHeight > 25) {
      setMenuState('half-open');
    } else {
      setMenuState('closed');
      onClose();
    }
  };

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    contentScrollY.current = event.nativeEvent.contentOffset.y;
  };

  const handleOutsidePress = () => {
    if (!isDragging) {
      setMenuState('closed');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }} onPress={handleOutsidePress}>
        <Pressable
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.metrics.panelRadius,
            borderTopRightRadius: theme.metrics.panelRadius,
            padding: theme.metrics.spacing,
            gap: theme.metrics.spacing,
            height: animatedHeight.interpolate({
              inputRange: [0, 85],
              outputRange: ['0%', '85%'],
              extrapolate: 'clamp',
            }),
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable
            style={{ alignItems: 'center', paddingBottom: 4 }}
            onPress={() => {
              if (menuState === 'fully-open') {
                setMenuState('closed');
                onClose();
              }
            }}
            onTouchStart={menuState === 'fully-open' ? onTouchStart : undefined}
            onTouchMove={menuState === 'fully-open' ? onTouchMove : undefined}
            onTouchEnd={menuState === 'fully-open' ? onTouchEnd : undefined}
          >
            <View style={{ 
              width: 36, 
              height: 4, 
              borderRadius: 2, 
              backgroundColor: theme.colors.border,
              opacity: menuState === 'closed' ? 0 : 1,
              transform: [{ scale: menuState === 'closed' ? 0.8 : 1 }]
            }} />
          </Pressable>
          {title && menuState !== 'closed' && <Text style={styles.sectionTitle}>{title}</Text>}
          {menuState !== 'closed' && (
            <View style={{ flex: 1 }}>
              <ScrollView 
                scrollEventThrottle={16} 
                scrollEnabled={contentScrollEnabled} 
                onScroll={handleScroll}
                showsVerticalScrollIndicator={menuState === 'fully-open'}
                nestedScrollEnabled={true}
                style={{ opacity: 1 }}
              >
                <View style={{ minHeight: menuState === 'half-open' ? 200 : 300 }}>
                  {children}
                </View>
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
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
        const isMainFrame = (request as any).isMainFrame ?? true;
        const navigationType = (request as any).navigationType;

        // Handle internal mira:// URLs
        if (url.startsWith('mira://')) {
          navigate(url, tab.id, { skipInputNormalization: true, fromWebView: true });
          return false;
        }

        // Handle mailto: links
        if (url.startsWith('mailto:')) {
          navigate(`mira://mailto?url=${encodeURIComponent(url)}`, tab.id, {
            skipInputNormalization: true,
            fromWebView: true,
          });
          return false;
        }

        // HTTPS-First: Handle HTTP URLs
        if (url.startsWith('http://') && isMainFrame) {
          // Try to upgrade to HTTPS first
          const httpsUrl = url.replace(/^http:/i, 'https:');

          // If this is a link click or redirect from HTTPS page, try HTTPS upgrade
          if (tab.url?.startsWith('https://')) {
            // This is an HTTPS -> HTTP downgrade, try HTTPS first
            navigate(httpsUrl, tab.id, { skipInputNormalization: true, fromWebView: true });
            return false;
          }

          // If user typed HTTP directly or clicked HTTP link from non-HTTPS page,
          // try HTTPS first anyway (HTTPS-First policy)
          if (navigationType === 'other' || navigationType === 'link') {
            // Navigate to HTTPS version instead
            navigate(httpsUrl, tab.id, { skipInputNormalization: true, fromWebView: true });
            return false;
          }

          // For form submissions or other navigations, show warning
          navigate(`mira://errors/unsecure-site?url=${encodeURIComponent(url)}`, tab.id, {
            skipInputNormalization: true,
            fromWebView: true,
          });
          return false;
        }

        // Block non-HTTPS protocols on main frame (external apps handle these)
        if (
          isMainFrame &&
          !url.startsWith('https://')
          && !url.startsWith('about:blank')
          && !url.startsWith('data:')
          && !url.startsWith('http://') // Already handled above
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
    closeTab,
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
  const initialUrlHandledRef = useRef(false);

  useEffect(() => {
    setAddressValue(activeTab?.url ?? settings.newTabPage);
  }, [activeTab?.url, settings.newTabPage]);

  // Handle incoming URLs from external apps (when set as default browser)
  useEffect(() => {
    // Get initial URL that launched the app - only handle once
    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      Linking.getInitialURL().then((url) => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          newTab(url, { activate: true });
        }
      }).catch(() => undefined);
    }

    // Listen for URLs when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      const url = event.url;
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        newTab(url, { activate: true });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [newTab]);

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
        <MenuButtonWithGesture theme={theme} onPress={() => { setTabSheetOpen(false); setMenuOpen(true); }}>
          <Menu size={24} color={theme.colors.text} />
        </MenuButtonWithGesture>
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
