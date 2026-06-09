<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import { STATUS_META } from '@/constants';
import type { Status } from '@/types';

const props = defineProps<{ status: Status }>();
const { t } = useI18n();
const meta = computed(() => STATUS_META[props.status]);
</script>

<template>
  <Tag :value="t(`status.${status}`)" :severity="meta.severity" :icon="meta.icon" rounded />
</template>
