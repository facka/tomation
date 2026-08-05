<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useStore } from '@/store';

const store = useStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const SENSITIVE_KEY_PATTERN = /password|secret|token|key|auth/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

const MAX_DISPLAY_LENGTH = 30;

const contextEntries = computed(() => {
  const ctx = store.state.contextStore;
  return Object.keys(ctx).map((key) => {
    const formatted = formatValue(ctx[key]);
    const masked = isSensitiveKey(key);
    const displayValue = masked ? '****' : formatted;
    const isTruncated = !masked && formatted.length > MAX_DISPLAY_LENGTH;
    const truncatedValue = isTruncated
      ? formatted.slice(0, MAX_DISPLAY_LENGTH) + '\u2026'
      : displayValue;

    return {
      key,
      value: truncatedValue,
      fullValue: isTruncated ? formatted : null,
    };
  });
});

const isEmpty = computed(() => contextEntries.value.length === 0);

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});
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
          <td :title="entry.fullValue ?? undefined">{{ entry.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
