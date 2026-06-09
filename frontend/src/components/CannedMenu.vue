<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { cannedService } from '@/services/canned.service';
import { extractErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { CannedResponse } from '@/types';

const emit = defineEmits<{ (e: 'insert', body: string): void }>();
const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const auth = useAuthStore();

const panel = ref();
const list = ref<CannedResponse[]>([]);
const loaded = ref(false);

const manageVisible = ref(false);
const editing = ref<CannedResponse | null>(null);
const form = reactive({ title: '', body: '' });
const saving = ref(false);

async function load() {
  list.value = await cannedService.list().catch(() => []);
  loaded.value = true;
}
function toggle(e: Event) {
  if (!loaded.value) load();
  panel.value.toggle(e);
}
function insert(r: CannedResponse) {
  emit('insert', r.body);
  panel.value.hide();
}
function openManage() {
  panel.value.hide();
  editing.value = null;
  form.title = '';
  form.body = '';
  manageVisible.value = true;
}
function openEdit(r: CannedResponse) {
  editing.value = r;
  form.title = r.title;
  form.body = r.body;
}
function canManage(r: CannedResponse) {
  return auth.isAdmin || r.createdById === auth.user?.id;
}
async function save() {
  if (form.title.trim().length < 2 || form.body.trim().length < 2) return;
  saving.value = true;
  try {
    if (editing.value) {
      await cannedService.update(editing.value.id, { title: form.title.trim(), body: form.body.trim() });
    } else {
      await cannedService.create({ title: form.title.trim(), body: form.body.trim() });
    }
    toast.add({ severity: 'success', summary: t('tickets.detail.cannedSaved'), life: 2500 });
    editing.value = null;
    form.title = '';
    form.body = '';
    await load();
  } catch (e) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(e), life: 4000 });
  } finally {
    saving.value = false;
  }
}
function remove(r: CannedResponse) {
  confirm.require({
    message: `"${r.title}"`,
    header: t('common.delete'),
    icon: 'pi pi-trash',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await cannedService.remove(r.id);
        toast.add({ severity: 'success', summary: t('tickets.detail.cannedDeleted'), life: 2500 });
        await load();
      } catch (e) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(e), life: 4000 });
      }
    },
  });
}
</script>

<template>
  <span>
    <Button
      type="button"
      :label="t('tickets.detail.canned')"
      icon="pi pi-bolt"
      text
      size="small"
      severity="secondary"
      @click="toggle"
    />

    <Popover ref="panel">
      <div class="canned-pop">
        <div v-if="!list.length" class="canned-empty">{{ t('tickets.detail.cannedEmpty') }}</div>
        <button v-for="r in list" :key="r.id" class="canned-item" @click="insert(r)">
          <div class="canned-title">{{ r.title }}</div>
          <div class="canned-preview">{{ r.body }}</div>
        </button>
        <div class="canned-foot">
          <Button :label="t('tickets.detail.cannedManage')" icon="pi pi-cog" text size="small" @click="openManage" />
        </div>
      </div>
    </Popover>

    <Dialog v-model:visible="manageVisible" :header="t('tickets.detail.cannedManage')" modal :style="{ width: '560px' }" :draggable="false">
      <div class="canned-form">
        <div class="field">
          <label>{{ t('tickets.detail.cannedTitle') }}</label>
          <InputText v-model="form.title" maxlength="120" class="full-width" />
        </div>
        <div class="field">
          <label>{{ t('tickets.detail.cannedBody') }}</label>
          <Textarea v-model="form.body" rows="3" autoResize maxlength="5000" class="full-width" />
        </div>
        <Button
          :label="editing ? t('common.save') : t('tickets.detail.cannedNew')"
          :icon="editing ? 'pi pi-check' : 'pi pi-plus'"
          size="small"
          :loading="saving"
          @click="save"
        />
        <Button v-if="editing" :label="t('common.cancel')" text size="small" severity="secondary" @click="editing = null; form.title = ''; form.body = ''" />
      </div>

      <ul class="canned-list">
        <li v-for="r in list" :key="r.id" class="canned-row">
          <div style="min-width: 0">
            <div class="canned-title">{{ r.title }}</div>
            <div class="canned-preview">{{ r.body }}</div>
          </div>
          <div v-if="canManage(r)" class="canned-row-actions">
            <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" @click="openEdit(r)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(r)" />
          </div>
        </li>
      </ul>
    </Dialog>
  </span>
</template>

<style scoped>
.canned-pop {
  width: 320px;
  max-width: 84vw;
}
.canned-empty {
  color: var(--text-muted);
  padding: 0.8rem;
  text-align: center;
  font-size: 0.88rem;
}
.canned-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 0.6rem 0.4rem;
  cursor: pointer;
  font: inherit;
  color: var(--text);
}
.canned-item:hover {
  background: var(--surface-hover);
}
.canned-title {
  font-weight: 600;
  font-size: 0.88rem;
}
.canned-preview {
  font-size: 0.8rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.canned-foot {
  text-align: center;
  padding-top: 0.3rem;
}
.canned-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.8rem;
}
.canned-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
}
.canned-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.2rem;
  border-bottom: 1px solid var(--border);
}
.canned-row-actions {
  display: flex;
  flex-shrink: 0;
}
</style>
