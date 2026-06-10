<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Chart from 'primevue/chart';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Rating from 'primevue/rating';
import { analyticsService, type Analytics, type RecurringTheme } from '@/services/analytics.service';
import { extractErrorMessage } from '@/services/api';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { initials } from '@/constants';
import { downloadCsv } from '@/utils/csv';
import RoleTag from '@/components/RoleTag.vue';

const { t } = useI18n();
const ui = useUiStore();
const auth = useAuthStore();

const data = ref<Analytics | null>(null);
const loading = ref(true);
const loadError = ref('');

const textColor = computed(() => (ui.isDark ? '#9aa3b2' : '#6b7280'));
const gridColor = computed(() => (ui.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'));

function fmtDuration(min: number | null): string {
  if (min == null) return '—';
  const m = Math.round(min);
  if (m < 60) return t('analytics.minutes', { n: m });
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem
      ? `${t('analytics.hours', { n: h })} ${t('analytics.minutes', { n: rem })}`
      : t('analytics.hours', { n: h });
  }
  return t('analytics.days', { n: (m / 1440).toFixed(1) });
}

// ── Chart data ──────────────────────────────────────────────────────
const overTimeData = computed(() => {
  const d = data.value!;
  return {
    labels: d.ticketsOverTime.map((p) =>
      new Date(p.date).toLocaleDateString(ui.locale === 'en' ? 'en-GB' : 'tr-TR', { day: '2-digit', month: 'short' }),
    ),
    datasets: [
      {
        label: t('nav.tickets'),
        data: d.ticketsOverTime.map((p) => p.count),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };
});

const statusData = computed(() => {
  const d = data.value!;
  return {
    labels: [t('status.open'), t('status.in_progress'), t('status.closed')],
    datasets: [
      {
        data: [d.byStatus.open ?? 0, d.byStatus.in_progress ?? 0, d.byStatus.closed ?? 0],
        backgroundColor: ['#f59e0b', '#3b82f6', '#9ca3af'],
        borderWidth: 0,
      },
    ],
  };
});

const priorityData = computed(() => {
  const d = data.value!;
  return {
    labels: [t('priority.low'), t('priority.medium'), t('priority.high')],
    datasets: [
      {
        label: t('nav.tickets'),
        data: [d.byPriority.low ?? 0, d.byPriority.medium ?? 0, d.byPriority.high ?? 0],
        backgroundColor: ['#22c55e', '#3b82f6', '#ef4444'],
        borderRadius: 6,
      },
    ],
  };
});

const departmentData = computed(() => {
  const d = data.value!;
  const items = d.byDepartment.filter((x) => x.name).sort((a, b) => b.count - a.count);
  return {
    labels: items.map((x) => x.name as string),
    datasets: [
      {
        label: t('nav.tickets'),
        data: items.map((x) => x.count),
        backgroundColor: '#6366f1',
        borderRadius: 6,
      },
    ],
  };
});

const lineOptions = computed(() => ({
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: textColor.value, maxTicksLimit: 8 }, grid: { color: gridColor.value } },
    y: { ticks: { color: textColor.value, precision: 0 }, grid: { color: gridColor.value }, beginAtZero: true },
  },
}));
const barOptions = computed(() => ({
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: textColor.value }, grid: { display: false } },
    y: { ticks: { color: textColor.value, precision: 0 }, grid: { color: gridColor.value }, beginAtZero: true },
  },
}));
const doughnutOptions = computed(() => ({
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: { legend: { position: 'bottom', labels: { color: textColor.value, usePointStyle: true, padding: 16 } } },
}));

const kindSeverity: Record<string, string> = {
  hardware: 'warn',
  recurring: 'danger',
  failure: 'danger',
  general: 'secondary',
};
function recommendation(theme: RecurringTheme): string {
  return t(`analytics.recurring.rec.${theme.kind}`, {
    term: theme.term,
    count: theme.count,
    requesters: theme.distinctRequesters,
  });
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await analyticsService.get();
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  const d = data.value;
  if (!d) return;
  const rows: (string | number | null)[][] = [];
  rows.push([t('analytics.title')]);
  rows.push([]);
  rows.push([t('analytics.stats.total'), d.summary.total]);
  rows.push([t('status.open'), d.summary.open]);
  rows.push([t('status.in_progress'), d.summary.inProgress]);
  rows.push([t('status.closed'), d.summary.closed]);
  rows.push([t('analytics.stats.unassigned'), d.summary.unassigned]);
  rows.push([t('analytics.stats.escalated'), d.summary.escalated]);
  rows.push([t('analytics.stats.avgFirstResponse'), fmtDuration(d.summary.avgFirstResponseMinutes)]);
  rows.push([t('analytics.stats.avgResolution'), fmtDuration(d.summary.avgResolutionMinutes)]);
  rows.push([
    t('analytics.stats.slaResponse'),
    d.summary.slaResponseCompliance != null ? `%${d.summary.slaResponseCompliance}` : '—',
  ]);
  rows.push([
    t('analytics.stats.slaResolution'),
    d.summary.slaResolutionCompliance != null ? `%${d.summary.slaResolutionCompliance}` : '—',
  ]);
  rows.push([t('analytics.stats.csat'), d.summary.csatAverage != null ? d.summary.csatAverage.toFixed(2) : '—']);
  rows.push([]);
  rows.push([t('analytics.agents.title')]);
  rows.push([
    t('analytics.agents.name'),
    t('analytics.agents.assigned'),
    t('analytics.agents.resolved'),
    t('analytics.agents.avgResponse'),
  ]);
  d.agentPerformance.forEach((a) =>
    rows.push([a.name, a.assigned, a.resolved, fmtDuration(a.avgFirstResponseMinutes)]),
  );
  rows.push([]);
  rows.push([t('analytics.recurring.title')]);
  rows.push([
    'Term',
    t('analytics.recurring.occurrences', { count: '' }).replace('{count}', '').trim() || 'Count',
    'Requesters',
    'Kind',
  ]);
  d.recurringProblems.forEach((th) => rows.push([th.term, th.count, th.distinctRequesters, th.kind]));

  downloadCsv(`analiz-raporu-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function exportPdf() {
  window.print();
}

onMounted(load);
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('analytics.title') }}</h1>
      <p class="page-subtitle">
        {{ t('analytics.subtitle') }}
        <span v-if="data && data.scope === 'departments'"> · {{ t('analytics.scopeDept') }}</span>
      </p>
    </div>
    <div v-if="data" class="export-actions">
      <Button :label="t('analytics.exportCsv')" icon="pi pi-file-export" outlined size="small" @click="exportCsv" />
      <Button :label="t('analytics.exportPdf')" icon="pi pi-print" outlined size="small" @click="exportPdf" />
    </div>
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <!-- Skeleton -->
  <div v-if="loading">
    <div class="stat-grid">
      <Skeleton v-for="i in 4" :key="i" height="92px" borderRadius="14px" />
    </div>
    <div class="chart-grid">
      <Skeleton height="300px" borderRadius="14px" />
      <Skeleton height="300px" borderRadius="14px" />
    </div>
  </div>

  <template v-else-if="data">
    <!-- KPI cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">{{ data.summary.total }}</div>
            <div class="stat-label">{{ t('analytics.stats.total') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(99, 102, 241, 0.12); color: #6366f1">
            <i class="pi pi-ticket" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">{{ fmtDuration(data.summary.avgFirstResponseMinutes) }}</div>
            <div class="stat-label">{{ t('analytics.stats.avgFirstResponse') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(37, 99, 235, 0.12); color: #2563eb">
            <i class="pi pi-bolt" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">{{ fmtDuration(data.summary.avgResolutionMinutes) }}</div>
            <div class="stat-label">{{ t('analytics.stats.avgResolution') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(34, 197, 94, 0.12); color: #16a34a">
            <i class="pi pi-check-circle" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value" style="color: #dc2626">{{ data.summary.unassigned }}</div>
            <div class="stat-label">{{ t('analytics.stats.unassigned') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(220, 38, 38, 0.12); color: #dc2626">
            <i class="pi pi-user-minus" />
          </div>
        </div>
      </div>
    </div>

    <!-- Second KPI row: SLA compliance, CSAT, escalated -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">
              {{ data.summary.slaResponseCompliance != null ? '%' + data.summary.slaResponseCompliance : '—' }}
            </div>
            <div class="stat-label">{{ t('analytics.stats.slaResponse') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(37, 99, 235, 0.12); color: #2563eb">
            <i class="pi pi-bolt" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value">
              {{ data.summary.slaResolutionCompliance != null ? '%' + data.summary.slaResolutionCompliance : '—' }}
            </div>
            <div class="stat-label">{{ t('analytics.stats.slaResolution') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(22, 163, 74, 0.12); color: #16a34a">
            <i class="pi pi-verified" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value csat-value">
              {{ data.summary.csatAverage != null ? data.summary.csatAverage.toFixed(1) : '—' }}
              <Rating
                v-if="data.summary.csatAverage != null"
                :modelValue="Math.round(data.summary.csatAverage)"
                readonly
                :stars="5"
              />
            </div>
            <div class="stat-label">
              {{ t('analytics.stats.csat') }} · {{ t('analytics.stats.csatCount', { n: data.summary.csatCount }) }}
            </div>
          </div>
          <div class="stat-icon" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b">
            <i class="pi pi-star-fill" />
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-value" style="color: #dc2626">{{ data.summary.escalated }}</div>
            <div class="stat-label">{{ t('analytics.stats.escalated') }}</div>
          </div>
          <div class="stat-icon" style="background: rgba(220, 38, 38, 0.12); color: #dc2626">
            <i class="pi pi-arrow-up" />
          </div>
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="chart-grid">
      <div class="chart-card wide">
        <h3 class="chart-title">{{ t('analytics.charts.overTime') }}</h3>
        <div class="chart-box"><Chart type="line" :data="overTimeData" :options="lineOptions" /></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">{{ t('analytics.charts.byStatus') }}</h3>
        <div class="chart-box"><Chart type="doughnut" :data="statusData" :options="doughnutOptions" /></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">{{ t('analytics.charts.byPriority') }}</h3>
        <div class="chart-box"><Chart type="bar" :data="priorityData" :options="barOptions" /></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">{{ t('analytics.charts.byDepartment') }}</h3>
        <div class="chart-box"><Chart type="bar" :data="departmentData" :options="barOptions" /></div>
      </div>
    </div>

    <!-- Agent performance -->
    <div class="section-card">
      <h3 class="chart-title"><i class="pi pi-users" /> {{ t('analytics.agents.title') }}</h3>
      <DataTable :value="data.agentPerformance" dataKey="userId" stripedRows>
        <template #empty
          ><div class="empty-state" style="padding: 1.5rem">
            <p>{{ t('analytics.agents.empty') }}</p>
          </div></template
        >
        <Column :header="t('analytics.agents.name')" style="min-width: 200px">
          <template #body="{ data: a }">
            <div style="display: flex; align-items: center; gap: 0.6rem">
              <Avatar :label="initials(a.name)" shape="circle" class="avatar-brand" />
              <span style="font-weight: 600">{{ a.name }}</span>
            </div>
          </template>
        </Column>
        <Column :header="t('analytics.agents.role')"
          ><template #body="{ data: a }"><RoleTag :role="a.role" /></template
        ></Column>
        <Column :header="t('analytics.agents.assigned')" sortable field="assigned">
          <template #body="{ data: a }"><Tag :value="String(a.assigned)" severity="secondary" rounded /></template>
        </Column>
        <Column :header="t('analytics.agents.resolved')" sortable field="resolved">
          <template #body="{ data: a }"><Tag :value="String(a.resolved)" severity="success" rounded /></template>
        </Column>
        <Column :header="t('analytics.agents.avgResponse')">
          <template #body="{ data: a }"
            ><span class="muted">{{ fmtDuration(a.avgFirstResponseMinutes) }}</span></template
          >
        </Column>
      </DataTable>
    </div>

    <!-- Recurring problems -->
    <div class="section-card">
      <h3 class="chart-title"><i class="pi pi-lightbulb" /> {{ t('analytics.recurring.title') }}</h3>
      <p class="muted" style="margin-top: -0.4rem">{{ t('analytics.recurring.subtitle') }}</p>

      <div v-if="!data.recurringProblems.length" class="empty-state">
        <i class="pi pi-search" />
        <p>{{ t('analytics.recurring.empty') }}</p>
      </div>

      <div v-else class="theme-grid">
        <div v-for="th in data.recurringProblems" :key="th.term" class="theme-card" :class="th.kind">
          <div class="theme-head">
            <span class="theme-term">{{ th.term }}</span>
            <Tag :value="t(`analytics.recurring.kind.${th.kind}`)" :severity="kindSeverity[th.kind]" rounded />
          </div>
          <div class="theme-meta">
            <span><i class="pi pi-ticket" /> {{ t('analytics.recurring.occurrences', { count: th.count }) }}</span>
            <span
              ><i class="pi pi-users" />
              {{ t('analytics.recurring.requesters', { count: th.distinctRequesters }) }}</span
            >
          </div>
          <p class="theme-rec">{{ recommendation(th) }}</p>
          <div class="theme-samples">
            <span class="theme-samples-label">{{ t('analytics.recurring.samplesTitle') }}:</span>
            <span v-for="(s, i) in th.sampleSubjects" :key="i" class="theme-sample">{{ s }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.export-actions {
  display: flex;
  gap: 0.5rem;
}
.csat-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.csat-value :deep(.p-rating) {
  font-size: 0.85rem;
}
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.chart-card,
.section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1.25rem;
  box-shadow: var(--shadow-sm);
}
.section-card {
  margin-bottom: 1.5rem;
}
.chart-card.wide {
  grid-column: 1 / -1;
}
.chart-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text);
}
.chart-box {
  height: 260px;
  position: relative;
}
@media (max-width: 820px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}
.theme-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  background: var(--surface-2);
  border-left: 4px solid var(--brand);
}
.theme-card.hardware {
  border-left-color: #f59e0b;
}
.theme-card.recurring,
.theme-card.failure {
  border-left-color: #ef4444;
}
.theme-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.theme-term {
  font-weight: 700;
  font-size: 1.05rem;
  text-transform: capitalize;
  color: var(--text);
}
.theme-meta {
  display: flex;
  gap: 1rem;
  margin: 0.5rem 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.theme-meta i {
  margin-right: 0.25rem;
}
.theme-rec {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text);
  margin: 0.4rem 0 0.6rem;
}
.theme-samples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.theme-samples-label {
  font-size: 0.76rem;
  color: var(--text-muted);
}
.theme-sample {
  font-size: 0.76rem;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
  color: var(--text-muted);
}
</style>
