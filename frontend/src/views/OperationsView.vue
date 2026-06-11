<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import Button from 'primevue/button';
import Select from 'primevue/select';
import ProgressBar from 'primevue/progressbar';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { useToast } from 'primevue/usetoast';
import { useOperationsStore } from '@/stores/operations';
import {
  operationsService,
  type ExportEntity,
  type ExportFormat,
  type ImportPreview,
  type ImportStrategy,
} from '@/services/operations.service';
import { socketConnected, connectSocket } from '@/services/socket';
import { extractErrorMessage } from '@/services/api';

const { t, te } = useI18n();
const toast = useToast();
const ops = useOperationsStore();
const loadError = ref('');

// ── Dışa aktarım (export) ────────────────────────────────────────────
const exportEntity = ref<ExportEntity>('tickets');
const entityOptions = [
  { value: 'tickets', label: t('operations.export.tickets') },
  { value: 'users', label: t('operations.export.users') },
];
const exportBusy = ref<ExportFormat | 'email' | null>(null);

async function downloadExport(format: ExportFormat) {
  exportBusy.value = format;
  try {
    await operationsService.download(exportEntity.value, format);
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('operations.export.error'),
      detail: extractErrorMessage(err),
      life: 4000,
    });
  } finally {
    exportBusy.value = null;
  }
}

async function emailExport() {
  exportBusy.value = 'email';
  try {
    await operationsService.exportByEmail(exportEntity.value, 'excel');
    toast.add({ severity: 'success', summary: t('operations.export.queued'), life: 4000 });
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('operations.export.error'),
      detail: extractErrorMessage(err),
      life: 4000,
    });
  } finally {
    exportBusy.value = null;
  }
}

// ── İçe aktarım (import) ─────────────────────────────────────────────
const importEntity = ref<ExportEntity>('users');
const importEntityOptions = [{ value: 'users', label: t('operations.export.users') }];
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const preview = ref<ImportPreview | null>(null);
const strategy = ref<ImportStrategy>('skip');
const previewing = ref(false);
const confirming = ref(false);

const strategyOptions = [
  { value: 'skip', label: t('operations.import.strategy.skip') },
  { value: 'update', label: t('operations.import.strategy.update') },
  { value: 'createOnly', label: t('operations.import.strategy.createOnly') },
];
const statusSeverity: Record<string, string> = {
  new: 'success',
  exists: 'info',
  duplicate: 'warn',
  error: 'danger',
};

function onFile(e: Event) {
  selectedFile.value = (e.target as HTMLInputElement).files?.[0] ?? null;
  preview.value = null;
  ops.resetImportProgress();
}

async function doPreview() {
  if (!selectedFile.value) return;
  previewing.value = true;
  try {
    preview.value = await operationsService.previewImport(importEntity.value, selectedFile.value);
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('operations.import.error'),
      detail: extractErrorMessage(err),
      life: 5000,
    });
  } finally {
    previewing.value = false;
  }
}

async function doConfirm() {
  if (!preview.value) return;
  confirming.value = true;
  try {
    await operationsService.confirmImport(preview.value.importId, strategy.value);
    toast.add({ severity: 'success', summary: t('operations.import.started'), life: 3000 });
    preview.value = null;
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('operations.import.error'),
      detail: extractErrorMessage(err),
      life: 5000,
    });
  } finally {
    confirming.value = false;
  }
}

// Canlı sayaç kartları (ham anahtar → görsel).
const cards = [
  { key: 'active', icon: 'pi pi-spin pi-spinner', color: '#2563eb' },
  { key: 'waiting', icon: 'pi pi-clock', color: '#d97706' },
  { key: 'completed', icon: 'pi pi-check-circle', color: '#16a34a' },
  { key: 'failed', icon: 'pi pi-times-circle', color: '#dc2626' },
] as const;

// Ham job adını okunur etikete çevirir (bilinmeyenlerde ham ad gösterilir).
function jobLabel(name: string): string {
  const key = `operations.jobNames.${name}`;
  return te(key) ? t(key) : name;
}

function relativeTime(ms: number | null): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('operations.justNow');
  if (min < 60) return t('operations.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('operations.hoursAgo', { n: hr });
  return new Date(ms).toLocaleString();
}

onMounted(async () => {
  connectSocket();
  ops.bind();
  try {
    await ops.fetch();
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  }
});
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('operations.title') }}</h1>
      <p class="page-subtitle">{{ t('operations.subtitle') }}</p>
    </div>
    <!-- Canlı bağlantı göstergesi -->
    <div class="conn" :class="{ live: socketConnected }">
      <span class="dot" />
      {{ socketConnected ? t('operations.live') : t('operations.disconnected') }}
    </div>
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <!-- Canlı job sayaçları -->
  <div class="stat-grid">
    <Card v-for="c in cards" :key="c.key" class="stat-card">
      <template #content>
        <div class="stat-row">
          <i :class="c.icon" :style="{ color: c.color }" />
          <div>
            <div class="stat-value">{{ ops.stats[c.key] }}</div>
            <div class="stat-label">{{ t(`operations.stats.${c.key}`) }}</div>
          </div>
        </div>
      </template>
    </Card>
  </div>

  <!-- Dışa aktarım -->
  <Card class="export-card">
    <template #title>{{ t('operations.export.title') }}</template>
    <template #content>
      <p class="muted" style="margin-top: -0.4rem">{{ t('operations.export.subtitle') }}</p>
      <div class="export-row">
        <Select
          v-model="exportEntity"
          :options="entityOptions"
          optionLabel="label"
          optionValue="value"
          class="export-entity"
        />
        <Button
          :label="t('operations.export.csv')"
          icon="pi pi-file"
          outlined
          :loading="exportBusy === 'csv'"
          :disabled="exportBusy !== null"
          @click="downloadExport('csv')"
        />
        <Button
          :label="t('operations.export.excel')"
          icon="pi pi-file-excel"
          outlined
          :loading="exportBusy === 'excel'"
          :disabled="exportBusy !== null"
          @click="downloadExport('excel')"
        />
        <Button
          :label="t('operations.export.pdf')"
          icon="pi pi-file-pdf"
          outlined
          :loading="exportBusy === 'pdf'"
          :disabled="exportBusy !== null"
          @click="downloadExport('pdf')"
        />
        <Button
          :label="t('operations.export.email')"
          icon="pi pi-envelope"
          text
          :loading="exportBusy === 'email'"
          :disabled="exportBusy !== null"
          @click="emailExport"
        />
      </div>
    </template>
  </Card>

  <!-- İçe aktarım -->
  <Card class="import-card">
    <template #title>{{ t('operations.import.title') }}</template>
    <template #content>
      <p class="muted" style="margin-top: -0.4rem">{{ t('operations.import.subtitle') }}</p>
      <div class="import-controls">
        <Select
          v-model="importEntity"
          :options="importEntityOptions"
          optionLabel="label"
          optionValue="value"
          class="export-entity"
        />
        <input ref="fileInput" type="file" accept=".csv,.xlsx,.xls" class="file-input" @change="onFile" />
        <Button
          :label="t('operations.import.preview')"
          icon="pi pi-search"
          :disabled="!selectedFile || previewing"
          :loading="previewing"
          @click="doPreview"
        />
      </div>

      <!-- Önizleme (yazma yok) -->
      <div v-if="preview" class="preview">
        <div class="summary-chips">
          <Tag :value="`${t('operations.import.summary.total')}: ${preview.summary.total}`" />
          <Tag severity="success" :value="`${t('operations.import.status.new')}: ${preview.summary.new}`" />
          <Tag severity="info" :value="`${t('operations.import.status.exists')}: ${preview.summary.exists}`" />
          <Tag severity="warn" :value="`${t('operations.import.status.duplicate')}: ${preview.summary.duplicate}`" />
          <Tag severity="danger" :value="`${t('operations.import.status.error')}: ${preview.summary.error}`" />
        </div>

        <DataTable :value="preview.rows" scrollable scrollHeight="320px" size="small" class="preview-table">
          <Column field="index" header="#" style="width: 52px" />
          <Column :header="t('operations.import.statusCol')" style="width: 120px">
            <template #body="{ data }">
              <Tag :severity="statusSeverity[data.status]" :value="t(`operations.import.status.${data.status}`)" />
            </template>
          </Column>
          <Column v-for="col in preview.columns" :key="col" :header="col">
            <template #body="{ data }">{{ data.display[col] }}</template>
          </Column>
          <Column :header="t('operations.import.errorsCol')">
            <template #body="{ data }">
              <span class="err">{{ data.errors.join('; ') }}</span>
            </template>
          </Column>
        </DataTable>

        <div class="confirm-row">
          <span class="muted">{{ t('operations.import.strategyLabel') }}</span>
          <Select v-model="strategy" :options="strategyOptions" optionLabel="label" optionValue="value" />
          <Button :label="t('operations.import.confirm')" icon="pi pi-check" :loading="confirming" @click="doConfirm" />
        </div>
      </div>

      <!-- Canlı ilerleme (worker'dan) -->
      <div v-if="ops.importProgress" class="import-progress">
        <ProgressBar :value="ops.importProgress.percent" />
        <div class="progress-stats">
          <span class="muted">{{ ops.importProgress.processed }}/{{ ops.importProgress.total }}</span>
          <Tag severity="success" :value="`${t('operations.import.created')}: ${ops.importProgress.created}`" />
          <Tag severity="info" :value="`${t('operations.import.updated')}: ${ops.importProgress.updated}`" />
          <Tag :value="`${t('operations.import.skipped')}: ${ops.importProgress.skipped}`" />
          <Tag severity="danger" :value="`${t('operations.import.failed')}: ${ops.importProgress.failed}`" />
          <Tag
            v-if="ops.importProgress.done"
            severity="success"
            icon="pi pi-check"
            :value="t('operations.import.doneLabel')"
          />
        </div>
      </div>
    </template>
  </Card>

  <!-- Son işlemler -->
  <Card class="recent">
    <template #title>{{ t('operations.recentTitle') }}</template>
    <template #content>
      <p v-if="!ops.recent.length" class="muted">{{ t('operations.recentEmpty') }}</p>
      <ul v-else class="recent-list">
        <li v-for="op in ops.recent" :key="op.id">
          <Tag
            :value="op.status === 'completed' ? t('operations.ok') : t('operations.fail')"
            :severity="op.status === 'completed' ? 'success' : 'danger'"
            rounded
          />
          <span class="op-name">{{ jobLabel(op.name) }}</span>
          <span class="op-summary muted">{{ op.summary }}</span>
          <span class="op-time muted">{{ relativeTime(op.finishedAt) }}</span>
        </li>
      </ul>
    </template>
  </Card>
</template>

<style scoped>
.conn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.conn .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #dc2626;
}
.conn.live .dot {
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.export-card {
  margin-bottom: 1.25rem;
}
.export-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 0.5rem;
}
.export-entity {
  min-width: 160px;
}
.import-card {
  margin-bottom: 1.25rem;
}
.import-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 0.5rem;
}
.file-input {
  flex: 1;
  min-width: 200px;
  font-size: 0.9rem;
}
.preview {
  margin-top: 1rem;
}
.summary-chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.preview-table {
  font-size: 0.85rem;
}
.err {
  color: #dc2626;
  font-size: 0.8rem;
}
.confirm-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.85rem;
  flex-wrap: wrap;
}
.import-progress {
  margin-top: 1rem;
}
.progress-stats {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 0.5rem;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.stat-row i {
  font-size: 1.8rem;
}
.stat-value {
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
}
.stat-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.recent-list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--surface-border, #e5e7eb);
}
.recent-list li:last-child {
  border-bottom: none;
}
.op-name {
  font-weight: 600;
}
.op-summary {
  flex: 1;
  font-size: 0.85rem;
}
.op-time {
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
