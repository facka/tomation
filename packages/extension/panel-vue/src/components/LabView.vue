<script setup lang="ts">
import { onMounted } from 'vue';
import { useLabStore } from '@/store/lab';
import AIConfigSection from './AIConfigSection.vue';
import InspectSection from './InspectSection.vue';
import CodeViewer from './CodeViewer.vue';
import GenerateSection from './GenerateSection.vue';
import CodeOutput from './CodeOutput.vue';

const { loadAIConfig } = useLabStore();

onMounted(() => {
  loadAIConfig();
});
</script>

<template>
  <div class="lab-view">
    <AIConfigSection />
    <InspectSection />
    <CodeViewer />
    <GenerateSection />
    <CodeOutput />
  </div>
</template>

<style scoped>
.lab-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
