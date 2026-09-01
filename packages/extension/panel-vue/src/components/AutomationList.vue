<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';
import { useSearch } from '@/composables/useSearch';
import { sortAutomationsWithFavourites } from '@/logic/sortFavourites';
import RunnableItem from './RunnableItem.vue';
import type { AutomationEntry, AutomationInstance } from '@/types/spec';

const store = useStore();

const emit = defineEmits<{
  (e: 'selectAutomation', automation: AutomationEntry, index: number): void;
  (e: 'quickRunAutomation', automation: AutomationEntry, index: number): void;
  (e: 'selectInstance', instance: AutomationInstance, source: AutomationEntry, sourceIndex: number): void;
  (e: 'quickRunInstance', instance: AutomationInstance, source: AutomationEntry, sourceIndex: number): void;
}>();

const allAutomations = computed(() => {
  if (!store.state.currentProject) return [];
  return store.state.currentProject.specs.flatMap((s) => s.spec.automations ?? []);
});

const { query, filtered, isEmpty } = useSearch(allAutomations);

const sortedFiltered = computed(() => {
  return sortAutomationsWithFavourites(filtered.value, store.state.favourites);
});

// Instances (user-made copies) paired with their source automation
const instanceEntries = computed(() => {
  const instances = store.state.currentProject?.instances ?? [];
  return instances
    .map((instance) => {
      const sourceIndex = allAutomations.value.findIndex(
        (a) => a.name === instance.sourceAutomationName,
      );
      return { instance, source: allAutomations.value[sourceIndex], sourceIndex };
    })
    .filter((entry) => !!entry.source);
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

function instanceDisplayItem(instance: AutomationInstance, source: AutomationEntry): AutomationEntry {
  return {
    name: instance.label,
    sourceFile: source.sourceFile,
    steps: source.steps,
    params: source.params,
  };
}

function onDeleteInstance(instanceId: string) {
  if (!store.state.currentHostname) return;
  store.deleteInstance(store.state.currentHostname, instanceId);
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

    <template v-if="instanceEntries.length > 0">
      <h3 class="instances-heading">Your copies</h3>
      <ul class="test-list">
        <RunnableItem
          v-for="entry in instanceEntries"
          :key="entry.instance.id"
          :item="instanceDisplayItem(entry.instance, entry.source)"
          type="instance"
          @select="emit('selectInstance', entry.instance, entry.source, entry.sourceIndex)"
          @quick-run="emit('quickRunInstance', entry.instance, entry.source, entry.sourceIndex)"
          @delete="onDeleteInstance(entry.instance.id)"
        />
      </ul>
    </template>
  </div>
</template>

