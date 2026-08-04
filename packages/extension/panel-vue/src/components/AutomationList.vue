<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';
import { useSearch } from '@/composables/useSearch';
import { sortAutomationsWithFavourites } from '@/logic/sortFavourites';
import RunnableItem from './RunnableItem.vue';
import type { AutomationEntry } from '@/types/spec';

const store = useStore();

const emit = defineEmits<{
  (e: 'selectAutomation', automation: AutomationEntry, index: number): void;
  (e: 'quickRunAutomation', automation: AutomationEntry, index: number): void;
}>();

const allAutomations = computed(() => {
  if (!store.state.currentProject) return [];
  return store.state.currentProject.specs.flatMap((s) => s.spec.automations ?? []);
});

const { query, filtered, isEmpty } = useSearch(allAutomations);

const sortedFiltered = computed(() => {
  return sortAutomationsWithFavourites(filtered.value, store.state.favourites);
});

function getAutomationIndex(automation: AutomationEntry): number {
  return allAutomations.value.indexOf(automation);
}

function isFavourite(name: string): boolean {
  return !!store.state.favourites[name];
}

function onToggleFavourite(name: string) {
  store.toggleFavourite(name);
}
</script>

<template>
  <div>
    <div class="search-wrapper">
      <input
        type="text"
        class="tab-search-input"
        maxlength="100"
        placeholder="Search automations..."
        v-model="query"
      />
    </div>
    <div v-if="isEmpty" class="search-empty-state">
      No automations found matching your search
    </div>
    <ul v-else class="test-list">
      <RunnableItem
        v-for="automation in sortedFiltered"
        :key="automation.name"
        :item="automation"
        type="automation"
        :is-favourite="isFavourite(automation.name)"
        @select="emit('selectAutomation', automation, getAutomationIndex(automation))"
        @quick-run="emit('quickRunAutomation', automation, getAutomationIndex(automation))"
        @toggle-favourite="onToggleFavourite(automation.name)"
      />
    </ul>
  </div>
</template>
