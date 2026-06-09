<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import { ROLE_META } from '@/constants';
import type { Role } from '@/types';

const props = defineProps<{ role: Role }>();
const { t } = useI18n();
const meta = computed(() => ROLE_META[props.role]);
</script>

<template>
  <Tag :value="t(`roles.${role}`)" :severity="meta.severity" :icon="meta.icon" rounded />
</template>
