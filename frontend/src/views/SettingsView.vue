<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { slaService, type SlaTargets } from '@/services/sla.service';
import { jobsService } from '@/services/jobs.service';
import { extractErrorMessage } from '@/services/api';
import PriorityTag from '@/components/PriorityTag.vue';
import type { Priority } from '@/types';

const { t } = useI18n();
const toast = useToast();

const targets = ref<SlaTargets | null>(null);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const priorities: Priority[] = ['high', 'medium', 'low'];

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    targets.value = await slaService.get();
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!targets.value) return;
  saving.value = true;
  try {
    targets.value = await slaService.update(targets.value);
    toast.add({ severity: 'success', summary: t('settings.saved'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    saving.value = false;
  }
}

const digestBusy = ref(false);
async function runDigest() {
  digestBusy.value = true;
  try {
    await jobsService.runDigest();
    toast.add({ severity: 'success', summary: t('settings.digestQueued'), life: 4000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    digestBusy.value = false;
  }
}

// Dosya mikroservisinden senkron Excel/PDF indirme.
const exportBusy = ref<'excel' | 'pdf' | null>(null);
async function download(format: 'excel' | 'pdf') {
  exportBusy.value = format;
  try {
    await jobsService.downloadExport(format);
  } catch (err) {
    toast.add({ severity: 'error', summary: t('settings.exportError'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    exportBusy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('settings.title') }}</h1>
      <p class="page-subtitle">{{ t('settings.subtitle') }}</p>
    </div>
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <Skeleton v-if="loading" height="240px" borderRadius="14px" style="max-width: 560px" />

  <Card v-else-if="targets" style="max-width: 560px">
    <template #title>{{ t('settings.slaTitle') }}</template>
    <template #content>
      <p class="muted" style="margin-top: -0.4rem">{{ t('settings.slaSubtitle') }}</p>

      <div class="sla-grid sla-head">
        <span></span>
        <span class="muted">{{ t('settings.response') }}</span>
        <span class="muted">{{ t('settings.resolution') }}</span>
      </div>
      <div v-for="p in priorities" :key="p" class="sla-grid">
        <PriorityTag :priority="p" />
        <InputNumber v-model="targets[p].response" :min="1" :max="100000" :useGrouping="false" showButtons class="full-width" />
        <InputNumber v-model="targets[p].resolution" :min="1" :max="1000000" :useGrouping="false" showButtons class="full-width" />
      </div>

      <Button :label="t('settings.save')" icon="pi pi-check" :loading="saving" style="margin-top: 1.25rem" @click="save" />
    </template>
  </Card>

  <Card style="max-width: 560px; margin-top: 1.25rem">
    <template #title>{{ t('settings.jobsTitle') }}</template>
    <template #content>
      <p class="muted" style="margin-top: -0.4rem">{{ t('settings.jobsSubtitle') }}</p>
      <Button
        :label="t('settings.runDigest')"
        icon="pi pi-send"
        outlined
        :loading="digestBusy"
        style="margin-top: 0.5rem"
        @click="runDigest"
      />
    </template>
  </Card>

  <Card style="max-width: 560px; margin-top: 1.25rem">
    <template #title>{{ t('settings.exportTitle') }}</template>
    <template #content>
      <p class="muted" style="margin-top: -0.4rem">{{ t('settings.exportSubtitle') }}</p>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap">
        <Button
          :label="t('settings.downloadExcel')"
          icon="pi pi-file-excel"
          outlined
          :loading="exportBusy === 'excel'"
          :disabled="exportBusy !== null"
          @click="download('excel')"
        />
        <Button
          :label="t('settings.downloadPdf')"
          icon="pi pi-file-pdf"
          outlined
          :loading="exportBusy === 'pdf'"
          :disabled="exportBusy !== null"
          @click="download('pdf')"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.sla-grid {
  display: grid;
  grid-template-columns: 100px 1fr 1fr;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.75rem;
}
/* Grid çocuklarının min-width:auto değeri 1fr sütunların küçülmesini engelleyip
   input'ların kart dışına taşmasına (grid blowout) yol açıyordu; sıfırla. */
.sla-grid > * {
  min-width: 0;
}
/* InputNumber kök öğesi ve içindeki input sütunu tam doldursun. */
.sla-grid :deep(.p-inputnumber) {
  width: 100%;
}
.sla-grid :deep(.p-inputnumber-input) {
  width: 100%;
  min-width: 0;
}
.sla-head {
  margin-top: 1rem;
  font-size: 0.82rem;
}
</style>
