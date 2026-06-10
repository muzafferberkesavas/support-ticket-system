<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import { dashboardService } from '@/services/dashboard.service';
import { extractErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { DashboardData, Ticket } from '@/types';
import PriorityTag from '@/components/PriorityTag.vue';
import SlaBadge from '@/components/SlaBadge.vue';

const { t } = useI18n();
const auth = useAuthStore();

const data = ref<DashboardData | null>(null);
const loading = ref(true);
const loadError = ref('');

const columns = computed<{ key: string; label: string; icon: string; color: string; tickets: Ticket[] }[]>(() =>
  data.value
    ? [
        {
          key: 'slaRisk',
          label: t('dashboard.slaRisk'),
          icon: 'pi pi-exclamation-triangle',
          color: '#dc2626',
          tickets: data.value.slaRisk,
        },
        {
          key: 'myOpen',
          label: t('dashboard.myOpen'),
          icon: 'pi pi-user',
          color: '#6366f1',
          tickets: data.value.myOpen,
        },
        {
          key: 'unassigned',
          label: t('dashboard.unassigned'),
          icon: 'pi pi-inbox',
          color: '#d97706',
          tickets: data.value.unassigned,
        },
      ]
    : [],
);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await dashboardService.get();
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('dashboard.greeting', { name: auth.displayName }) }}</h1>
      <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>
    </div>
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <div v-if="loading" class="stat-grid">
    <Skeleton v-for="i in 4" :key="i" height="92px" borderRadius="14px" />
  </div>

  <template v-else-if="data">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">{{ data.counts.myOpen }}</div>
            <div class="stat-label">{{ t('dashboard.myOpen') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(99, 102, 241, 0.12); color: #6366f1">
            <i class="pi pi-user" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value" style="color: #dc2626">{{ data.counts.slaRisk }}</div>
            <div class="stat-label">{{ t('dashboard.slaRisk') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(220, 38, 38, 0.12); color: #dc2626">
            <i class="pi pi-exclamation-triangle" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value" style="color: #d97706">{{ data.counts.unassigned }}</div>
            <div class="stat-label">{{ t('dashboard.unassigned') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(217, 119, 6, 0.12); color: #d97706">
            <i class="pi pi-inbox" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value" style="color: #16a34a">{{ data.counts.resolvedToday }}</div>
            <div class="stat-label">{{ t('dashboard.resolvedToday') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(22, 163, 74, 0.12); color: #16a34a">
            <i class="pi pi-check-circle" />
          </div>
        </div>
      </div>
    </div>

    <div class="dash-lists">
      <div v-for="col in columns" :key="col.key" class="dash-col">
        <h3 class="dash-title"><i :class="col.icon" :style="{ color: col.color }" /> {{ col.label }}</h3>
        <div v-if="col.tickets.length" class="dash-card">
          <RouterLink v-for="tk in col.tickets" :key="tk.id" :to="`/tickets/${tk.id}`" class="dash-row">
            <span class="dash-subject">{{ tk.subject }}</span>
            <span class="dash-tags">
              <PriorityTag :priority="tk.priority" />
              <SlaBadge :ticket="tk" />
            </span>
          </RouterLink>
        </div>
        <div v-else class="dash-empty">{{ t('dashboard.empty') }}</div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.dash-lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.25rem;
}
.dash-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  margin: 0 0 0.75rem;
  color: var(--text);
}
.dash-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.dash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.dash-row:last-child {
  border-bottom: none;
}
.dash-row:hover {
  background: var(--surface-hover);
}
.dash-subject {
  font-weight: 500;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-tags {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}
.dash-empty {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}
</style>
