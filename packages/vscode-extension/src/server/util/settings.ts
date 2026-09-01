/**
 * Typed settings snapshot under the `tomation` configuration key.
 *
 * All Tomation settings live under the `tomation` namespace (Req 12.8) and map
 * one-to-one to the manifest `contributes.configuration` properties. This
 * module owns three things:
 *
 *  - the typed {@link TomationSettings} shape and its {@link DEFAULT_SETTINGS},
 *    matching the manifest defaults (Req 12.1–12.6);
 *  - {@link readSettings}, which normalizes an arbitrary settings blob (as
 *    pushed by the client on init or `didChangeConfiguration`) into a typed
 *    snapshot, defaulting any missing/invalid value;
 *  - {@link settingsChanged}, a change-detection helper the server uses to act
 *    only when a value actually changed and to avoid spurious reload prompts
 *    when a configuration event fires but nothing relevant moved (Req 12.7).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8.
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
      debounceInterval: debounceInterval(validation.debounceInterval),
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

/**
 * Report whether two settings snapshots differ. The server uses this after a
 * `didChangeConfiguration` event so it acts (and, where relevant, prompts to
 * reload) only when a value actually changed; when the event fires but nothing
 * moved, the server does nothing and never prompts (Req 12.7).
 *
 * The comparison is a structural, field-by-field equality of the normalized
 * snapshots — the same normalization {@link readSettings} produces — so noise
 * such as key ordering or absent-vs-default values does not read as a change.
 */
export function settingsChanged(
  previous: TomationSettings,
  next: TomationSettings
): boolean {
  return (
    previous.validation.enabled !== next.validation.enabled ||
    previous.validation.projectScope !== next.validation.projectScope ||
    previous.validation.debounceInterval !== next.validation.debounceInterval ||
    previous.validation.runOn !== next.validation.runOn ||
    previous.completion.enabled !== next.completion.enabled ||
    previous.hover.enabled !== next.hover.enabled
  );
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Coerce the debounce interval to a sane, finite, non-negative millisecond
 * value, falling back to the default for anything invalid (Req 12.3, 11.2).
 */
function debounceInterval(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return DEFAULT_SETTINGS.validation.debounceInterval;
}

function runOn(value: unknown): RunOn {
  return value === 'save' ? 'save' : DEFAULT_SETTINGS.validation.runOn;
}
