import type { Spec } from '@/types/spec';

export type ValidateSpecResult =
  | { ok: true; spec: Spec }
  | { ok: false; error: string };

/**
 * Validate a parsed JSON object against the tomation-spec format.
 * Checks format, version, required fields, and structural integrity.
 */
export function validateSpec(obj: unknown): ValidateSpecResult {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Spec must be a JSON object' };
  }

  const spec = obj as Record<string, unknown>;

  if (spec.format !== 'tomation-spec') {
    return { ok: false, error: 'Invalid or missing format field (expected "tomation-spec")' };
  }
  if (spec.version !== 1) {
    return { ok: false, error: 'Unsupported spec version (expected 1)' };
  }
  if (!spec.pageElements || typeof spec.pageElements !== 'object') {
    return { ok: false, error: 'Missing required field: pageElements' };
  }
  if (!spec.tasks || typeof spec.tasks !== 'object') {
    return { ok: false, error: 'Missing required field: tasks' };
  }
  if (!Array.isArray(spec.tests)) {
    return { ok: false, error: 'Missing required field: tests' };
  }

  // Validate pageElements entries
  const pageElements = spec.pageElements as Record<string, Record<string, unknown>>;
  const peKeys = Object.keys(pageElements);
  for (let i = 0; i < peKeys.length; i++) {
    const entry = pageElements[peKeys[i]];
    if (!entry || !entry.tag) {
      return { ok: false, error: 'pageElements entry "' + peKeys[i] + '" missing tag field' };
    }
    if (
      (!entry.where || typeof entry.where !== 'object' || Object.keys(entry.where as object).length === 0) &&
      !entry.xpath &&
      !entry.navigate
    ) {
      return { ok: false, error: 'pageElements entry "' + peKeys[i] + '" missing or empty where object' };
    }
  }

  // Validate tasks entries
  const tasks = spec.tasks as Record<string, Record<string, unknown>>;
  const taskKeys = Object.keys(tasks);
  for (let j = 0; j < taskKeys.length; j++) {
    const taskEntry = tasks[taskKeys[j]];
    if (!taskEntry || !Array.isArray(taskEntry.steps)) {
      return { ok: false, error: 'tasks entry "' + taskKeys[j] + '" missing steps array' };
    }
  }

  // Validate tests entries
  const tests = spec.tests as Array<Record<string, unknown>>;
  for (let k = 0; k < tests.length; k++) {
    const testEntry = tests[k];
    if (!testEntry || typeof testEntry.name !== 'string') {
      return { ok: false, error: 'tests entry at index ' + k + ' missing name field' };
    }
    if (!Array.isArray(testEntry.steps)) {
      return { ok: false, error: 'tests entry "' + testEntry.name + '" missing steps array' };
    }
  }

  // Validate automations entries (if present)
  if (spec.automations !== undefined) {
    if (!Array.isArray(spec.automations)) {
      return { ok: false, error: 'automations field must be an array' };
    }

    const validParamTypes = ['string', 'number', 'date', 'enum'];
    const automations = spec.automations as Array<Record<string, unknown>>;

    for (let a = 0; a < automations.length; a++) {
      const autoEntry = automations[a];
      if (!autoEntry || typeof autoEntry.name !== 'string') {
        return { ok: false, error: 'automations entry at index ' + a + ' missing name field' };
      }
      if (!Array.isArray(autoEntry.params)) {
        return { ok: false, error: 'automations entry "' + autoEntry.name + '" missing params array' };
      }
      if (!Array.isArray(autoEntry.steps)) {
        return { ok: false, error: 'automations entry "' + autoEntry.name + '" missing steps array' };
      }

      // Validate each param entry
      const params = autoEntry.params as Array<Record<string, unknown>>;
      for (let p = 0; p < params.length; p++) {
        const param = params[p];
        if (!param || typeof param.name !== 'string') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param at index ' + p + ' missing name field' };
        }
        if (validParamTypes.indexOf(param.type as string) === -1) {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" has invalid type "' + param.type + '" (expected one of: string, number, date, enum)' };
        }

        // Validate enum params have a non-empty options array of strings
        if (param.type === 'enum') {
          if (!Array.isArray(param.options) || param.options.length === 0) {
            return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" with type "enum" must have a non-empty options array' };
          }
          for (let o = 0; o < (param.options as unknown[]).length; o++) {
            if (typeof (param.options as unknown[])[o] !== 'string') {
              return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" options must all be strings' };
            }
          }
        }

        // Validate optional fields only when present
        if (param.optional !== undefined && typeof param.optional !== 'boolean') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" optional field must be a boolean' };
        }
        if (param.defaultValue !== undefined && typeof param.defaultValue !== 'string') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" defaultValue field must be a string' };
        }
        if (param.options !== undefined && param.type !== 'enum') {
          if (!Array.isArray(param.options)) {
            return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" options field must be an array' };
          }
        }
      }
    }
  }

  return { ok: true, spec: obj as unknown as Spec };
}
