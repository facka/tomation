/**
 * Cross-browser extension API. Uses `browser` (Firefox) if available,
 * otherwise falls back to `chrome` (Chrome, Edge).
 */
export const api: ChromeAPI =
  typeof browser !== 'undefined' ? browser! : chrome;

/**
 * Returns true if the given URL is on the Tomation Playground domain.
 */
export function isPlaygroundUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url === 'https://facka.github.io/tomation') return true;
  return url.indexOf('https://facka.github.io/tomation/') === 0;
}
