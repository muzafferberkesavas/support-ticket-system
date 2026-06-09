<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import type { Ticket } from '@/types';

const props = defineProps<{ ticket: Ticket }>();
const { t } = useI18n();

const state = computed(() => {
  const tk = props.ticket;
  const sla = tk.sla;
  if (tk.escalated) return { label: t('tickets.detail.escalated'), severity: 'danger', icon: 'pi pi-arrow-up' };
  if (!sla || tk.status === 'closed') return null;
  if (sla.breached) return { label: t('sla.overdue'), severity: 'danger', icon: 'pi pi-exclamation-circle' };
  const rem = sla.resolutionRemainingMinutes;
  if (rem != null && rem > 0 && rem < 0.2 * sla.resolutionTargetMinutes) {
    return { label: t('sla.dueSoon'), severity: 'warn', icon: 'pi pi-clock' };
  }
  return null;
});
</script>

<template>
  <Tag v-if="state" :value="state.label" :severity="state.severity" :icon="state.icon" rounded />
</template>
