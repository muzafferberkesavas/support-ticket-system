<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import { PRIORITY_META } from '@/constants';
import type { Priority } from '@/types';

const props = defineProps<{ priority: Priority }>();
const { t } = useI18n();
const meta = computed(() => PRIORITY_META[props.priority]);
</script>

<template>
  <Tag :value="t(`priority.${priority}`)" :severity="meta.severity" :icon="meta.icon" rounded />
</template>
