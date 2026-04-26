import React from 'react';
import { View } from 'react-native';
import type { BrowserSettings } from '../features/settings/browserSettings';
import { useTabs } from '../features/tabs/TabsProvider';
import type { MobileTheme } from './shared';
import BookmarksPage from './BookmarksPage';
import DownloadsPage from './DownloadsPage';
import ErrorPage from './ErrorPage';
import HistoryPage from './HistoryPage';
import LayoutCreatorPage from './LayoutCreatorPage';
import MailtoPage from './MailtoPage';
import NewTabPage from './NewTabPage';
import SettingsPage from './SettingsPage';
import ThemeCreatorPage from './ThemeCreatorPage';
import UpdatesPage from './UpdatesPage';
import { AppButton } from './shared';

function parseInternalRoute(url: string): {
  route: string;
  searchParams: URLSearchParams;
} {
  const normalized = url.replace(/^mira:\/\//i, '');
  const [routeAndQuery] = normalized.split('#', 1);
  const [route, search = ''] = routeAndQuery.split('?', 2);
  return {
    route: route.replace(/^\/+|\/+$/g, '').toLowerCase(),
    searchParams: new URLSearchParams(search),
  };
}

export default function InternalPageRouter({
  url,
  mobileTheme,
  settings,
  updateSettings,
}: {
  url: string;
  mobileTheme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
}) {
  const parsed = parseInternalRoute(url);
  const { navigate } = useTabs();

  switch (parsed.route) {
    case 'newtab':
      return <NewTabPage theme={mobileTheme} settings={settings} />;
    case 'history':
      return <HistoryPage theme={mobileTheme} />;
    case 'downloads':
      return <DownloadsPage theme={mobileTheme} />;
    case 'bookmarks':
      return <BookmarksPage theme={mobileTheme} />;
    case 'settings':
      return (
        <SettingsPage
          theme={mobileTheme}
          settings={settings}
          updateSettings={updateSettings}
          section={(parsed.searchParams.get('section') ?? '').toLowerCase()}
        />
      );
    case 'themecreator':
      return (
        <ThemeCreatorPage theme={mobileTheme} settings={settings} updateSettings={updateSettings} />
      );
    case 'layoutcreator':
      return (
        <LayoutCreatorPage theme={mobileTheme} settings={settings} updateSettings={updateSettings} />
      );
    case 'updates':
      return <UpdatesPage theme={mobileTheme} />;
    case 'mailto':
      return <MailtoPage theme={mobileTheme} mailtoUrl={parsed.searchParams.get('url') ?? ''} />;
    case 'errors/unsecure-site':
      const unsafeUrl = parsed.searchParams.get('url') ?? '';
      const httpsUpgradeUrl = unsafeUrl.replace(/^http:/i, 'https:');
      return (
        <ErrorPage
          theme={mobileTheme}
          title="HTTPS-First Warning"
          description="Mira protects your connection by using HTTPS. This site attempted to load over an unsecure HTTP connection."
        >
          <View style={{ gap: mobileTheme.metrics.spacing, marginTop: mobileTheme.metrics.spacing }}>
            <AppButton
              theme={mobileTheme}
              label="Try HTTPS Version"
              primary
              onPress={() => {
                navigate(httpsUpgradeUrl, undefined, {
                  skipInputNormalization: true,
                  fromWebView: true,
                });
              }}
            />
            <AppButton
              theme={mobileTheme}
              label="Continue to HTTP (Unsafe)"
              onPress={() => {
                navigate(unsafeUrl, undefined, {
                  skipInputNormalization: true,
                  fromWebView: true,
                });
              }}
            />
          </View>
        </ErrorPage>
      );
    case 'errors/crash':
      return (
        <ErrorPage
          theme={mobileTheme}
          title="Tab Crashed"
          description="The Android WebView process crashed. Reload to recover."
        />
      );
    case 'errors/network':
    case 'errors/external-network':
      return (
        <ErrorPage
          theme={mobileTheme}
          title="Network Error"
          description="The page could not be loaded right now."
        />
      );
    case 'errors/external-offline':
      return <ErrorPage theme={mobileTheme} title="Offline" description="The device appears to be offline." />;
    case 'errors/external-404':
      return <ErrorPage theme={mobileTheme} title="Not Found" description="The page returned a 404 error." />;
    case 'errors/internal-404':
    default:
      return (
        <ErrorPage
          theme={mobileTheme}
          title="Page Not Found"
          description={`The internal page "${parsed.route || 'newtab'}" does not exist.`}
        />
      );
  }
}
