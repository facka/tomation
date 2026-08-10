<script setup lang="ts">
import { useStore } from '@/store';

const store = useStore();
</script>

<template>
  <div class="tab-bar">
    <button
      class="tab-btn"
      :class="{ active: store.state.activeTab === 'tests' }"
      @click="store.setActiveTab('tests')"
    >
      <font-awesome-icon :icon="['fas', 'list-check']" aria-hidden="true" /> Tests
    </button>
    <button
      class="tab-btn"
      :class="{ active: store.state.activeTab === 'automations' }"
      @click="store.setActiveTab('automations')"
    >
      <font-awesome-icon :icon="['fas', 'bolt']" aria-hidden="true" /> Automations
    </button>
    <button
      class="tab-btn"
      :class="{ active: store.state.activeTab === 'lab' }"
      @click="store.setActiveTab('lab')"
    >
      <font-awesome-icon :icon="['fas', 'flask']" aria-hidden="true" /> Lab
    </button>
  </div>
</template>
