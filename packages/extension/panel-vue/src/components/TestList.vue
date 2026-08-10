<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';
import { useSearch } from '@/composables/useSearch';
import RunnableItem from './RunnableItem.vue';
import type { TestEntry } from '@/types/spec';

const store = useStore();

const emit = defineEmits<{
  (e: 'selectTest', test: TestEntry, index: number): void;
  (e: 'quickRunTest', test: TestEntry, index: number): void;
}>();

const allTests = computed(() => {
  if (!store.state.currentProject) return [];
  return store.state.currentProject.specs.flatMap((s) => s.spec.tests);
});

const { query, filtered, isEmpty } = useSearch(allTests);

function getTestIndex(test: TestEntry): number {
  return allTests.value.indexOf(test);
}
</script>

<template>
  <div>
    <div class="search-wrapper">
      <input
        type="text"
        class="tab-search-input"
        maxlength="100"
        placeholder="Search tests..."
        v-model="query"
      />
    </div>
    <div v-if="isEmpty" class="search-empty-state">No tests found matching your search</div>
    <ul v-else class="test-list">
      <RunnableItem
        v-for="test in filtered"
        :key="test.name"
        :item="test"
        type="test"
        @select="emit('selectTest', test, getTestIndex(test))"
        @quick-run="emit('quickRunTest', test, getTestIndex(test))"
      />
    </ul>
  </div>
</template>
