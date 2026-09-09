<script setup lang="ts">
import type { PageElement } from '@/types/spec';
import type { ElementChainNode } from '@/logic/elementChain';

defineProps<{ node: ElementChainNode }>();

/**
 * Build the where-matcher summary lines for a descriptor, e.g. `id = "submit"`.
 */
function whereLines(descriptor: PageElement | null): string[] {
  if (!descriptor || !descriptor.where) return [];
  return Object.keys(descriptor.where).map(
    (k) => k + ' = ' + JSON.stringify(descriptor.where![k]),
  );
}
</script>

<template>
  <dl v-if="node.descriptor" class="eic-meta">
    <div v-if="node.descriptor?.tag" class="eic-row">
      <dt>Tag</dt>
      <dd><code class="eic-value">{{ node.descriptor.tag }}</code></dd>
    </div>
    <div class="eic-row">
      <dt>Key</dt>
      <dd><code class="eic-value">{{ node.key }}</code></dd>
    </div>
    <div v-if="node.descriptor.xpath" class="eic-row">
      <dt>XPath</dt>
      <dd><code class="eic-value">{{ node.descriptor.xpath }}</code></dd>
    </div>
    <div v-else-if="whereLines(node.descriptor).length" class="eic-row">
      <dt>Where</dt>
      <dd class="eic-value-list">
        <code v-for="line in whereLines(node.descriptor)" :key="line" class="eic-value">{{ line }}</code>
      </dd>
    </div>
    <div v-if="node.descriptor.navigate" class="eic-row">
      <dt>Navigate</dt>
      <dd><code class="eic-value">{{ node.descriptor.navigate }}</code></dd>
    </div>
  </dl>
</template>

<style scoped>
.eic-meta {
  margin: 6px 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: baseline;
}

.eic-row {
  display: contents;
}

.eic-row dt {
  color: var(--text-muted, #888);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.eic-row dd {
  margin: 0;
  min-width: 0;
}

.eic-value-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Boxed monospace value that wraps rather than overflowing the card. */
.eic-value {
  display: inline-block;
  max-width: 100%;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-secondary, #bbb);
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 3px;
  padding: 1px 5px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
</style>
