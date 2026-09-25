<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CapturedRequest } from '@/types/store';
import { statusDisplay } from '@/logic/statusDisplay';

const props = defineProps<{
  request: CapturedRequest;
  dataKey?: string;
}>();

// Local, initially-collapsed disclosure state (Req 5.6), mirroring the
// ref-based collapse pattern used by LogEntry.vue's find-trace disclosure.
const expanded = ref(false);

function toggle() {
  expanded.value = !expanded.value;
}

// Display string for the response status: a numeric code, or the pending/failed
// indicator when `status` is null (Req 5.8). Values are shown verbatim — no
// masking is applied here (Req 5.3, 11.3).
const statusText = computed(() => statusDisplay(props.request.status));

// True when the request has no response status yet (still pending) or failed
// (Req 5.8). Drives the distinct pending/failed styling.
const isPendingOrFailed = computed(() => props.request.status === null);

// Flattened query parameter rows for the expanded view. Repeat keys carry
// multiple values (queryParams is Record<string, string[]>); each value is
// rendered on its own row, unmasked and untruncated (Req 5.3, 5.4, 11.3).
const queryRows = computed(() => {
  const rows: Array<{ key: string; value: string }> = [];
  const params = props.request.queryParams;
  if (!params) return rows;
  for (const key of Object.keys(params)) {
    const values = params[key];
    if (!values || values.length === 0) {
      rows.push({ key, value: '' });
      continue;
    }
    for (const value of values) {
      rows.push({ key, value });
    }
  }
  return rows;
});

const hasQuery = computed(() => queryRows.value.length > 0);
const hasRequestBody = computed(() => props.request.requestBody.length > 0);
</script>

<template>
  <div
    class="network-entry"
    :class="{ 'is-pending': isPendingOrFailed }"
    :data-key="dataKey"
  >
    <!-- Collapsed summary row: distinct network glyph, method, URL, status.
         The disclosure toggle expands the detail (Req 5.4, 5.6). -->
    <button
      type="button"
      class="net-summary"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <font-awesome-icon
        class="net-disclosure"
        :icon="['fas', expanded ? 'chevron-down' : 'chevron-right']"
      />
      <font-awesome-icon
        class="net-glyph"
        :icon="['fas', 'arrow-right-arrow-left']"
      />
      <span class="net-method">{{ request.method }}</span>
      <!-- URL truncates via CSS ellipsis while collapsed; full URL held in the
           title attribute for hover discovery (Req 5.3, 5.10). -->
      <span class="net-url" :title="request.url">{{ request.url }}</span>
      <span class="net-status" :class="{ pending: isPendingOrFailed }">{{ statusText }}</span>
    </button>

    <!-- Expanded detail: full URL, query params, request/response bodies.
         Every value is printed character-for-character with no masking and no
         display-side truncation (Req 5.3, 5.4, 11.3). -->
    <div v-if="expanded" class="net-detail">
      <!-- Full, untruncated URL (Req 5.10). -->
      <div class="net-section">
        <div class="net-section-label">URL</div>
        <div class="net-url-full">{{ request.url }}</div>
      </div>

      <!-- Query parameters (Req 5.4). -->
      <div class="net-section">
        <div class="net-section-label">Query</div>
        <div v-if="hasQuery" class="net-kv">
          <div v-for="(row, i) in queryRows" :key="i" class="net-kv-row">
            <span class="net-kv-key">{{ row.key }}</span>
            <span class="net-kv-value">{{ row.value }}</span>
          </div>
        </div>
        <div v-else class="net-empty">none</div>
      </div>

      <!-- Request body (Req 5.4). Capture-time truncation is labeled as such. -->
      <div class="net-section">
        <div class="net-section-label">
          Request body
          <span v-if="request.requestBodyTruncated" class="net-note">(truncated at capture)</span>
        </div>
        <pre v-if="hasRequestBody" class="net-body"><code>{{ request.requestBody }}</code></pre>
        <div v-else class="net-empty">none</div>
      </div>

      <!-- Response body (Req 5.4). Shows a body-unavailable indicator when the
           response body could not be captured; otherwise the verbatim body with
           any capture-time truncation labeled. -->
      <div class="net-section">
        <div class="net-section-label">
          Response body
          <span
            v-if="request.responseBodyTruncated && !request.bodyUnavailable"
            class="net-note"
          >(truncated at capture)</span>
        </div>
        <div v-if="request.bodyUnavailable" class="net-empty net-unavailable">
          Response body unavailable
        </div>
        <pre v-else-if="request.responseBody.length > 0" class="net-body"><code>{{ request.responseBody }}</code></pre>
        <div v-else class="net-empty">none</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Distinct network styling so a captured request is never mistaken for a step
   (Req 5.2): a left accent bar, a muted background, and monospace method/URL. */
.network-entry {
  margin: 2px 0 2px 24px;
  border-left: 3px solid var(--net-accent, #5b8def);
  background: var(--bg-secondary, rgba(91, 141, 239, 0.06));
  border-radius: 0 4px 4px 0;
  overflow: hidden;
}

.network-entry.is-pending {
  border-left-color: var(--warning, #f5a623);
}

.net-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 8px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: var(--text-secondary, #aaa);
  min-width: 0;
}

.net-summary:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.04));
}

.net-disclosure {
  flex: 0 0 auto;
  color: var(--text-muted, #888);
  font-size: 9px;
}

.net-glyph {
  flex: 0 0 auto;
  color: var(--net-accent, #5b8def);
  font-size: 10px;
}

.net-method {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-primary, #ddd);
}

.net-url {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.net-status {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary, #ddd);
}

.net-status.pending {
  color: var(--warning, #f5a623);
}

.net-detail {
  padding: 4px 8px 6px 8px;
  border-top: 1px solid var(--border, #333);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.net-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.net-section-label {
  font-size: 10px;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.net-note {
  text-transform: none;
  letter-spacing: normal;
  font-style: italic;
  color: var(--warning, #f5a623);
  margin-left: 4px;
}

.net-url-full {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-secondary, #aaa);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.net-kv {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.net-kv-row {
  display: flex;
  gap: 8px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.net-kv-key {
  flex: 0 0 auto;
  color: var(--text-muted, #888);
}

.net-kv-value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-secondary, #aaa);
  overflow-wrap: anywhere;
}

.net-body {
  margin: 0;
  padding: 6px 8px;
  background: var(--bg-code, rgba(0, 0, 0, 0.25));
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary, #aaa);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow-y: auto;
}

.net-empty {
  font-size: 10px;
  color: var(--text-muted, #888);
  font-style: italic;
}

.net-unavailable {
  color: var(--warning, #f5a623);
}
</style>
