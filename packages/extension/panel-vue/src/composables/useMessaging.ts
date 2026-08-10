import type { PanelMessage, BackgroundMessage } from '@/types/messages';
import { api } from '@/logic/browserApi';

/**
 * Composable wrapping browser extension messaging API with typed interfaces.
 * Provides send, onMessage listener, and active tab URL query.
 */
export function useMessaging() {
  /**
   * Send a typed message from the panel to the background script.
   */
  function send(message: PanelMessage): void {
    api.runtime.sendMessage(message);
  }

  /**
   * Register a listener for messages from the background script.
   * Returns an unsubscribe function to remove the listener.
   */
  function onMessage(handler: (msg: BackgroundMessage) => void): () => void {
    const wrappedHandler = (message: unknown) => {
      handler(message as BackgroundMessage);
    };
    api.runtime.onMessage.addListener(wrappedHandler);
    return () => {
      api.runtime.onMessage.removeListener(wrappedHandler);
    };
  }

  /**
   * Query the active tab URL via the tabs API.
   * Returns null if no active tab or URL is unavailable.
   */
  function getActiveTabUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].url) {
          resolve(tabs[0].url);
        } else {
          resolve(null);
        }
      });
    });
  }

  return { send, onMessage, getActiveTabUrl, api };
}
