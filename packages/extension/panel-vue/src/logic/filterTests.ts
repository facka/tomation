/**
 * Filter test/automation names by case-insensitive substring match.
 * Returns the full list if query is empty or falsy.
 */
export function filterTests(names: string[], query: string): string[] {
  if (!query) return names;
  const lowerQuery = query.toLowerCase();
  return names.filter((name) => name.toLowerCase().indexOf(lowerQuery) !== -1);
}
