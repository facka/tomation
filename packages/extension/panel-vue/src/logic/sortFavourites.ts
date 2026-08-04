/**
 * Sort items so that favourited items appear first, preserving relative order
 * within each group (stable partition).
 * Works with any object that has a `name` property.
 */
export function sortAutomationsWithFavourites<T extends { name: string }>(
  automations: T[],
  favourites: Record<string, boolean>,
): T[] {
  const favs: T[] = [];
  const nonFavs: T[] = [];

  for (let i = 0; i < automations.length; i++) {
    if (favourites[automations[i].name] === true) {
      favs.push(automations[i]);
    } else {
      nonFavs.push(automations[i]);
    }
  }

  return favs.concat(nonFavs);
}
