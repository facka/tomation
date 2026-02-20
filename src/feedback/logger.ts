let enabled = false;

export const logger = {
  setEnabled(value: boolean) {
    enabled = value;
  },

  log(...args: any[]) {
    if (enabled) {
      console.log('[tomation]', ...args);
    }
  },

  groupCollapsed(...args: any[]) {
    if (enabled) {
      console.groupCollapsed('[tomation]', ...args);
    }
  },

  groupEnd() {
    if (enabled) {
      console.groupEnd();
    }
  },

  error(...args: any[]) {
    if (enabled) {
      console.error('[tomation]', ...args);
    }
  }
};