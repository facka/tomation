<script setup lang="ts">
import type { TestEntry, AutomationEntry } from '@/types/spec';

defineProps<{
  item: TestEntry | AutomationEntry;
  type: 'test' | 'automation' | 'instance';
  isFavourite?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
  (e: 'quickRun'): void;
  (e: 'toggleFavourite'): void;
  (e: 'delete'): void;
}>();

function onQuickRun(event: Event) {
  event.stopPropagation();
  emit('quickRun');
}

function onToggleFavourite(event: Event) {
  event.stopPropagation();
  emit('toggleFavourite');
}

function onDelete(event: Event) {
  event.stopPropagation();
  emit('delete');
}
</script>

<template>
  <li @click="emit('select')">
    <span class="row-label">
      <span v-if="item.sourceFile" class="runnable-path">{{ item.sourceFile }}</span>
      <span class="runnable-name">{{ item.name }}</span>
    </span>
    <button
      v-if="type === 'automation'"
      class="favourite-btn"
      :data-favourite="isFavourite ? 'true' : 'false'"
      :title="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
      @click="onToggleFavourite"
    >
      <font-awesome-icon v-if="isFavourite" :icon="['fas', 'star']" />
      <font-awesome-icon v-else :icon="['far', 'star']" />
    </button>
    <button
      v-if="type === 'instance'"
      class="favourite-btn"
      title="Delete this copy"
      @click="onDelete"
    >
      <font-awesome-icon :icon="['fas', 'trash']" />
    </button>
    <button
      class="quick-run-btn"
      title="Quick run with all steps and default params"
      @click="onQuickRun"
    >
      <font-awesome-icon :icon="['fas', 'play']" />
    </button>
  </li>
</template>

