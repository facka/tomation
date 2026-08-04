import type { Step, Param } from '@/types/spec';

/**
 * Returns an array of all step indices [0, 1, 2, ..., steps.length - 1].
 */
export function buildAllStepsChecked(steps: Step[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Returns an object with default values for each parameter based on its type.
 * - string → empty string
 * - number → 0
 * - date → today's date in YYYY-MM-DD format
 * - enum → first option value
 */
export function buildDefaultParams(params: Param[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const type = param.type;

    if (type === 'string') {
      result[param.name] = '';
    } else if (type === 'number') {
      result[param.name] = 0;
    } else if (type === 'date') {
      const now = new Date();
      const yyyy = now.getFullYear();
      let mm = String(now.getMonth() + 1);
      if (mm.length < 2) mm = '0' + mm;
      let dd = String(now.getDate());
      if (dd.length < 2) dd = '0' + dd;
      result[param.name] = yyyy + '-' + mm + '-' + dd;
    } else if (type === 'enum') {
      result[param.name] = param.options && param.options.length > 0 ? param.options[0] : '';
    }
  }

  return result;
}

/**
 * Returns true if any non-optional parameter has no saved value.
 */
export function hasRequiredParamsWithoutValues(
  params: Param[],
  savedValues: Record<string, unknown> | null | undefined,
): boolean {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (param.optional === true) continue;
    if (
      !savedValues ||
      savedValues[param.name] === undefined ||
      savedValues[param.name] === null ||
      savedValues[param.name] === ''
    ) {
      return true;
    }
  }
  return false;
}
