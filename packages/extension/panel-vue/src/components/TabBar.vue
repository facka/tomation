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
      ☑ Tests
    </button>
    <button
      class="tab-btn"
      :class="{ active: store.state.activeTab === 'automations' }"
      @click="store.setActiveTab('automations')"
    >
      ⚡ Automations
    </button>
  </div>
</template>
