<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from '@/store';
import ControllerBar from './ControllerBar.vue';
import LogContainer from './LogContainer.vue';
import ContextPopup from './ContextPopup.vue';
import RunSummary from './RunSummary.vue';

const store = useStore();

// --- State ---

const showContext = ref(false);

// --- Computed ---

const runnable = computed(() => store.state.currentRunnable);
const isRunning = computed(() => store.state.isRunning);
const runComplete = computed(() => store.state.runSummary !== null);

const displayName = computed(() => {
  if (!runnable.value) return '';
  const name = runnable.value.data.name;
  return name.indexOf('__') !== -1 ? name.split('__').slice(1).join('__') : name;
});

const sourceFile = computed(() => runnable.value?.data.sourceFile || '');

// --- Actions ---

function toggleContext() {
  showContext.value = !showContext.value;
}

function closeRun() {
  store.clearRunnable();
  store.setView('home');
}
</script>

<template>
  <div class="view active" v-if="runnable">
    <!-- Navigation row -->
    <div class="nav-row">
      <h2>
        <span v-if="sourceFile" class="runnable-path">{{ sourceFile }}</span>
        <span class="runnable-name">{{ displayName }}</span>
      </h2>
      <button
        v-if="runComplete"
        class="btn btn-ghost btn-sm"
        @click="closeRun"
      >✕</button>
    </div>

    <!-- Controller bar (during execution) -->
    <ControllerBar
      v-if="isRunning || runComplete"
      @toggle-context="toggleContext"
    />

    <!-- Log container -->
    <LogContainer />

    <!-- Context popup overlay -->
    <ContextPopup
      v-if="showContext"
      @close="showContext = false"
    />

    <!-- Run summary (after completion) -->
    <RunSummary />
  </div>
</template>
