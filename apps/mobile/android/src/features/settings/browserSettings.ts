// Settings utilities

export interface BrowserSettings {
  enableDoNotTrack: boolean;
  enableNotifications: boolean;
  autoSaveTabs: boolean;
  defaultSearchEngine: 'google' | 'bing' | 'duckduckgo';
  enableJavaScript: boolean;
  blockAds: boolean;
}

const defaultSettings: BrowserSettings = {
  enableDoNotTrack: false,
  enableNotifications: true,
  autoSaveTabs: true,
  defaultSearchEngine: 'google',
  enableJavaScript: true,
  blockAds: false,
};

export { defaultSettings };
