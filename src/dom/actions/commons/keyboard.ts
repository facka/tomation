enum KEY_MAP {
  ESCAPE = 'Escape',
  ENTER = 'Enter',
  TAB = 'Tab',
  SPACE = 'Space',
  ARROW_DOWN = 'ArrowDown',
  ARROW_UP = 'ArrowUp',
  ARROW_LEFT = 'ArrowLeft',
  ARROW_RIGHT = 'ArrowRight',
  HOME = 'Home',
  END = 'End',
  PAGE_UP = 'PageUp',
  PAGE_DOWN = 'PageDown',
  INSERT = 'Insert',
  BACKSPACE = 'Backspace',
  DELETE = 'Delete',
  CAPS_LOCK = 'CapsLock',
  NUM_LOCK = 'NumLock',
  SCROLL_LOCK = 'ScrollLock',
  PAUSE = 'Pause',
  PRINT_SCREEN = 'PrintScreen',
  CONTEXT_MENU = 'ContextMenu',
  SHIFT = 'Shift',
  CONTROL = 'Control',
  ALT = 'Alt',
  META = 'Meta',
  F1 = 'F1',
  F2 = 'F2',
  F3 = 'F3',
  F4 = 'F4',
  F5 = 'F5',
  F6 = 'F6',
  F7 = 'F7',
  F8 = 'F8',
  F9 = 'F9',
  F10 = 'F10',
  F11 = 'F11',
  F12 = 'F12',
}

enum KEY_OPTIONS {
  ALT = 'altKey',
  CTRL = 'ctrlKey',
  META = 'metaKey',
  SHIFT = 'shiftKey',
}

const KEY_OPTION_LABELS: Record<KEY_OPTIONS, string> = {
  [KEY_OPTIONS.ALT]: 'ALT',
  [KEY_OPTIONS.CTRL]: 'CTRL',
  [KEY_OPTIONS.META]: 'META',
  [KEY_OPTIONS.SHIFT]: 'SHIFT',
}

const KEY_CODES: Record<KEY_MAP, number> = {
  [KEY_MAP.ESCAPE]: 27,
  [KEY_MAP.ENTER]: 13,
  [KEY_MAP.TAB]: 9,
  [KEY_MAP.SPACE]: 32,
  [KEY_MAP.ARROW_DOWN]: 40,
  [KEY_MAP.ARROW_UP]: 38,
  [KEY_MAP.ARROW_LEFT]: 37,
  [KEY_MAP.ARROW_RIGHT]: 39,
  [KEY_MAP.HOME]: 36,
  [KEY_MAP.END]: 35,
  [KEY_MAP.PAGE_UP]: 33,
  [KEY_MAP.PAGE_DOWN]: 34,
  [KEY_MAP.INSERT]: 45,
  [KEY_MAP.BACKSPACE]: 8,
  [KEY_MAP.DELETE]: 46,
  [KEY_MAP.CAPS_LOCK]: 20,
  [KEY_MAP.NUM_LOCK]: 144,
  [KEY_MAP.SCROLL_LOCK]: 145,
  [KEY_MAP.PAUSE]: 19,
  [KEY_MAP.PRINT_SCREEN]: 44,
  [KEY_MAP.CONTEXT_MENU]: 93,
  [KEY_MAP.SHIFT]: 16,
  [KEY_MAP.CONTROL]: 17,
  [KEY_MAP.ALT]: 18,
  [KEY_MAP.META]: 91,
  [KEY_MAP.F1]: 112,
  [KEY_MAP.F2]: 113,
  [KEY_MAP.F3]: 114,
  [KEY_MAP.F4]: 115,
  [KEY_MAP.F5]: 116,
  [KEY_MAP.F6]: 117,
  [KEY_MAP.F7]: 118,
  [KEY_MAP.F8]: 119,
  [KEY_MAP.F9]: 120,
  [KEY_MAP.F10]: 121,
  [KEY_MAP.F11]: 122,
  [KEY_MAP.F12]: 123,
}

const getCharCodeFromKey = (key: KEY_MAP): number => {
  if (key.length === 1) {
    return key.toUpperCase().charCodeAt(0)
  }
  return KEY_CODES[key] || 0
}

export {
  KEY_MAP,
  KEY_OPTIONS,
  KEY_OPTION_LABELS,
  KEY_CODES,
  getCharCodeFromKey,
}
