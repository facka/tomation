import { ref, computed, type Ref } from 'vue';
import { filterTests } from '@/logic/filterTests';

/**
 * Generic composable for reactive search filtering.
 * Accepts a reactive list of items with a `name` property and exposes
 * a query ref, filtered computed list, and isEmpty indicator.
 */
export function useSearch<T extends { name: string }>(items: Ref<T[]>) {
  const query = ref('');

  const filtered = computed(() => {
    if (!query.value) return items.value;
    const matchingNames = filterTests(
      items.value.map((i) => i.name),
      query.value,
    );
    return items.value.filter((i) => matchingNames.includes(i.name));
  });

  const isEmpty = computed(() => query.value.length > 0 && filtered.value.length === 0);

  return { query, filtered, isEmpty };
}
