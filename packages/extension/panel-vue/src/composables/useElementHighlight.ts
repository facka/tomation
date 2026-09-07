import { api } from '@/logic/browserApi';
import type { HoverHighlightMessage, HoverClearMessage, HoverResult } from '@/types/messages';

const DEBOUNCE_MS = 100;

// Module-level singleton state shared across every LogEntry row that uses this
// composable. Only one element key may be hover-active (or pending) at a time.
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let activeKey: string | null = null; // key currently highlighted (or pending)

/**
 * Query the id of the active tab in the current window.
 * Uses the callback form of `api.tabs.query` (matching `getActiveTabUrl` in
 * useMessaging.ts) and resolves to `null` when there is no active tab or the
 * query throws.
 * _Requirements: 3.10, 5.2, 5.3_
 */
function queryActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] && tabs[0].id != null ? tabs[0].id : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Send a hover message directly to the content script of the active tab.
 * Every failure mode (no active tab, rejected send, thrown call) is swallowed
 * to `null` so callers never have to handle errors.
 * _Requirements: 3.10, 5.2, 5.3_
 */
async function sendToRuntime<T>(msg: HoverHighlightMessage | HoverClearMessage): Promise<T | null> {
  const tabId = await queryActiveTabId();
  if (tabId == null) return null;
  try {
    return await api.tabs.sendMessage(tabId, msg);
  } catch {
    return null;
  }
}

/**
 * Clear the current hover highlight immediately and reset the active key.
 * _Requirements: 4.2, 4.3_
 */
async function clearNow(): Promise<void> {
  activeKey = null;
  await sendToRuntime<{ ok: true }>({ type: 'HOVER_CLEAR' });
}

/**
 * Coordinator composable for run-log element hover highlighting.
 * Debounces hover requests, guarantees at most one key is active at a time, and
 * routes messages directly to the active tab's content script.
 */
export function useElementHighlight() {
  /**
   * Highlight the element(s) tagged with `key` after a 100ms debounce. Any
   * pending debounce is cancelled first; when a different key was already active
   * it is cleared before the next highlight starts. Resolves to the runtime's
   * `found` count, or `null` when the request could not be delivered.
   * _Requirements: 3.1, 4.3, 5.1, 3.10_
   */
  function highlight(key: string): Promise<number | null> {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    const hadPrior = activeKey !== null && activeKey !== key;
    return new Promise((resolve) => {
      const start = () => {
        pendingTimer = setTimeout(async () => {
          pendingTimer = null;
          activeKey = key;
          const res = await sendToRuntime<HoverResult>({ type: 'HOVER_HIGHLIGHT', key });
          resolve(res ? res.found : null);
        }, DEBOUNCE_MS);
      };
      if (hadPrior) { void clearNow().then(start); } else { start(); }
    });
  }

  /**
   * Cancel any pending debounce and clear the current hover highlight, resetting
   * the active key.
   * _Requirements: 4.1, 4.2, 4.3_
   */
  function clear(): Promise<void> {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    return clearNow();
  }

  return { highlight, clear };
}
