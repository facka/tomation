/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// Minimal chrome extension API types for panel usage
interface ChromeTab {
  url?: string;
}

interface ChromeRuntime {
  sendMessage(message: unknown): void;
  onMessage: {
    addListener(handler: (message: unknown, sender: unknown, sendResponse: unknown) => void): void;
    removeListener(handler: (message: unknown, sender: unknown, sendResponse: unknown) => void): void;
  };
}

interface ChromeTabs {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (tabs: ChromeTab[]) => void): void;
  create(createProperties: { url: string }): void;
}

interface ChromeStorageArea {
  get(keys: string | string[], callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
}

interface ChromeStorage {
  local: ChromeStorageArea;
}

interface ChromeAPI {
  runtime: ChromeRuntime;
  tabs: ChromeTabs;
  storage: ChromeStorage;
}

declare const chrome: ChromeAPI;
declare const browser: ChromeAPI | undefined;


