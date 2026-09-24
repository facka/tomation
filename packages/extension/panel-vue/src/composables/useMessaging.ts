import type { PanelMessage, BackgroundMessage } from '@/types/messages';
import { api } from '@/logic/browserApi';

/**
 * Deep-clone a message into a plain, structured-clone-safe object.
 *
 * Panel messages often carry values read from Vue `reactive(...)` state, which
 * are Proxy objects. Firefox's runtime.sendMessage uses the structured clone
 * algorithm, which throws "Proxy object could not be cloned" on a reactive
 * proxy (Chrome tolerates it). A JSON round-trip strips the Proxy wrappers and
 * any non-serializable values, leaving a plain object. All PanelMessage payloads
 * are JSON-serializable data, so this is lossless for our messages.
 */
function toPlainMessage(message: PanelMessage): PanelMessage {
  try {
    return JSON.parse(JSON.stringify(message)) as PanelMessage;
  } catch {
    // Fall back to the original message if it cannot be serialized; the browser
    // will surface any remaining clone error as before.
    return message;
  }
}

/**
 * Composable wrapping browser extension messaging API with typed interfaces.
 * Provides send, onMessage listener, and active tab URL query.
 */
export function useMessaging() {
  /**
   * Send a typed message from the panel to the background script. The message is
   * unwrapped to a plain object first so Firefox can structured-clone it even
   * when the payload came from Vue reactive state.
   */
  function send(message: PanelMessage): void {
    api.runtime.sendMessage(toPlainMessage(message));
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
