<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';

const store = useStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const contextEntries = computed(() => {
  const ctx = store.state.contextStore;
  return Object.keys(ctx).map((key) => ({
    key,
    value: formatValue(ctx[key]),
  }));
});

const isEmpty = computed(() => contextEntries.value.length === 0);

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}
</script>

<template>
  <div class="context-popup-backdrop" @click="emit('close')"></div>
  <div class="context-popup">
    <div class="context-popup-header">
      <span>Context Store</span>
      <button class="btn btn-ghost btn-sm" @click="emit('close')">✕</button>
    </div>

    <div v-if="isEmpty" class="ctx-empty">No context values stored yet.</div>

    <table v-else class="ctx-table">
      <tbody>
        <tr v-for="entry in contextEntries" :key="entry.key">
          <td class="ctx-popup-key">{{ entry.key }}</td>
          <td>{{ entry.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
