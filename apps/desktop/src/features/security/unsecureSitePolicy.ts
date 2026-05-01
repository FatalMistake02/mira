const UNSECURE_SITE_ALLOWED_PREFIX = 'mira.unsecure-site.allowed.';
const UNSECURE_SITE_BYPASS_ONCE_PREFIX = 'mira.unsecure-site.bypass-once.';
const UNSECURE_SITE_PENDING_HTTPS_UPGRADE_PREFIX = 'mira.unsecure-site.pending-https-upgrade.';

function normalizeSchemeUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeUnsecureSiteScope(url: string): string | null {
  const parsed = normalizeSchemeUrl(url);
  if (!parsed) return null;

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) return null;
  const port = parsed.port.trim();
  return port ? `${hostname}:${port}` : hostname;
}

function normalizeAbsoluteSiteUrl(url: string): string | null {
  const parsed = normalizeSchemeUrl(url);
  if (!parsed) return null;
  return parsed.toString();
}

function getAllowedSiteKey(url: string): string | null {
  const scope = normalizeUnsecureSiteScope(url);
  if (!scope) return null;
  return `${UNSECURE_SITE_ALLOWED_PREFIX}${scope}`;
}

function getBypassOnceKey(url: string): string | null {
  const normalizedUrl = normalizeAbsoluteSiteUrl(url);
  if (!normalizedUrl) return null;
  return `${UNSECURE_SITE_BYPASS_ONCE_PREFIX}${normalizedUrl}`;
}

function getPendingHttpsUpgradeKey(httpsUrl: string): string | null {
  const normalizedUrl = normalizeAbsoluteSiteUrl(httpsUrl);
  if (!normalizedUrl) return null;
  return `${UNSECURE_SITE_PENDING_HTTPS_UPGRADE_PREFIX}${normalizedUrl}`;
}

export function isUnsecureSiteAllowed(url: string): boolean {
  const key = getAllowedSiteKey(url);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function allowUnsecureSite(url: string): void {
  const key = getAllowedSiteKey(url);
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Ignore storage failures.
  }
}

export function markUnsecureSiteBypassOnce(url: string): void {
  const key = getBypassOnceKey(url);
  if (!key) return;
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Ignore storage failures.
  }
}

export function consumeUnsecureSiteBypassOnce(url: string): boolean {
  const key = getBypassOnceKey(url);
  if (!key) return false;
  try {
    if (sessionStorage.getItem(key) !== '1') return false;
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function markPendingHttpsUpgrade(httpUrl: string, httpsUrl: string): void {
  const pendingKey = getPendingHttpsUpgradeKey(httpsUrl);
  const normalizedHttpUrl = normalizeAbsoluteSiteUrl(httpUrl);
  if (!pendingKey || !normalizedHttpUrl) return;
  try {
    sessionStorage.setItem(pendingKey, normalizedHttpUrl);
  } catch {
    // Ignore storage failures.
  }
}

export function consumePendingHttpsUpgradeHttpUrl(httpsUrl: string): string | null {
  const pendingKey = getPendingHttpsUpgradeKey(httpsUrl);
  if (!pendingKey) return null;
  try {
    const value = sessionStorage.getItem(pendingKey);
    if (!value) return null;
    sessionStorage.removeItem(pendingKey);
    const normalizedHttpUrl = normalizeAbsoluteSiteUrl(value);
    return normalizedHttpUrl && normalizedHttpUrl.toLowerCase().startsWith('http://')
      ? normalizedHttpUrl
      : null;
  } catch {
    return null;
  }
}

export function toHttpsUrlFromHttp(url: string): string | null {
  const parsed = normalizeSchemeUrl(url);
  if (!parsed || parsed.protocol.toLowerCase() !== 'http:') return null;
  parsed.protocol = 'https:';
  return parsed.toString();
}
