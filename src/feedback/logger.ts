let enabled = false;

const noop = () => {};

export const logger: {
  setEnabled: (value: boolean) => void,
  log: (...args: any[]) => void,
  group: (...args: any[]) => void,
  groupCollapsed: (...args: any[]) => void,
  groupEnd: () => void,
  error: (...args: any[]) => void,
  warn: (...args: any[]) => void,
} = {
  setEnabled(value: boolean) {
    enabled = value;
  },
  log: noop,
  group: noop,
  groupCollapsed: noop,
  groupEnd: noop,
  error: noop,
  warn: noop,
};

Object.defineProperty(logger, 'log', {
  get: () => enabled ? console.log.bind(console, '[tomation]') : noop,
});

Object.defineProperty(logger, 'groupCollapsed', {
  get: () => enabled ? console.groupCollapsed.bind(console, '[tomation]') : noop,
});

Object.defineProperty(logger, 'group', {
  get: () => enabled ? console.group.bind(console, '[tomation]') : noop,
});

Object.defineProperty(logger, 'groupEnd', {
  get: () => enabled ? console.groupEnd.bind(console) : noop,
});

Object.defineProperty(logger, 'error', {
  get: () => enabled ? console.error.bind(console, '[tomation]') : noop,
});

Object.defineProperty(logger, 'warn', {
  get: () => enabled ? console.warn.bind(console, '[tomation]') : noop,
});