/**
 * Typed settings snapshot under the `tomation` configuration key.
 *
 * PLACEHOLDER — task 2.2 owns the real implementation (change detection,
 * validation). This minimal version defines the settings shape, the defaults,
 * and a `readSettings` normalizer so the server bootstrap can capture the
 * `initializationOptions.settings` blob into a typed snapshot.
 */

/** When validation runs relative to editing. */
export type RunOn = 'type' | 'save';

/** Typed snapshot of the `tomation.*` settings. */
export interface TomationSettings {
  validation: {
    enabled: boolean;
    projectScope: boolean;
    debounceInterval: number;
    runOn: RunOn;
  };
  completion: {
    enabled: boolean;
  };
  hover: {
    enabled: boolean;
  };
}

/** The default settings snapshot, matching the manifest contributions. */
export const DEFAULT_SETTINGS: TomationSettings = {
  validation: {
    enabled: true,
    projectScope: true,
    debounceInterval: 300,
    runOn: 'type',
  },
  completion: {
    enabled: true,
  },
  hover: {
    enabled: true,
  },
};

/**
 * Normalize an arbitrary settings blob (as pushed by the client via
 * `initializationOptions.settings` or `didChangeConfiguration`) into a typed
 * snapshot, falling back to defaults for any missing/invalid values.
 */
export function readSettings(raw: unknown): TomationSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const validation = (source.validation ?? {}) as Record<string, unknown>;
  const completion = (source.completion ?? {}) as Record<string, unknown>;
  const hover = (source.hover ?? {}) as Record<string, unknown>;

  return {
    validation: {
      enabled: bool(validation.enabled, DEFAULT_SETTINGS.validation.enabled),
      projectScope: bool(
        validation.projectScope,
        DEFAULT_SETTINGS.validation.projectScope
      ),
      debounceInterval: num(
        validation.debounceInterval,
        DEFAULT_SETTINGS.validation.debounceInterval
      ),
      runOn: runOn(validation.runOn),
    },
    completion: {
      enabled: bool(completion.enabled, DEFAULT_SETTINGS.completion.enabled),
    },
    hover: {
      enabled: bool(hover.enabled, DEFAULT_SETTINGS.hover.enabled),
    },
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function runOn(value: unknown): RunOn {
  return value === 'save' ? 'save' : DEFAULT_SETTINGS.validation.runOn;
}
