<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import MultiSelect from 'primevue/multiselect';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { departmentService } from '@/services/department.service';
import { userService } from '@/services/user.service';
import { extractErrorMessage } from '@/services/api';
import type { Department, User } from '@/types';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const departments = ref<Department[]>([]);
const staff = ref<User[]>([]);
const loading = ref(true);
const loadError = ref('');

const dialogVisible = ref(false);
const editing = ref<Department | null>(null);
const submitting = ref(false);
const form = reactive({ name: '', description: '', memberIds: [] as string[] });
const errors = reactive<Record<string, string>>({});

const staffOptions = computed(() =>
  staff.value.map((u) => ({ label: `${u.fullName || u.email} (${t(`roles.${u.role}`)})`, value: u.id })),
);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [depts, users] = await Promise.all([departmentService.list(), userService.list()]);
    departments.value = depts;
    staff.value = users.filter((u) => u.role !== 'user');
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.name = '';
  form.description = '';
  form.memberIds = [];
  Object.keys(errors).forEach((k) => delete errors[k]);
  dialogVisible.value = true;
}

function openEdit(dept: Department) {
  editing.value = dept;
  form.name = dept.name;
  form.description = dept.description ?? '';
  form.memberIds = dept.members?.map((m) => m.userId) ?? [];
  Object.keys(errors).forEach((k) => delete errors[k]);
  dialogVisible.value = true;
}

async function submit() {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (form.name.trim().length < 2) {
    errors.name = t('tickets.validation.subjectMin');
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      memberIds: form.memberIds,
    };
    if (editing.value) {
      await departmentService.update(editing.value.id, payload);
      toast.add({ severity: 'success', summary: t('departments.updated'), life: 3000 });
    } else {
      await departmentService.create(payload);
      toast.add({ severity: 'success', summary: t('departments.created'), life: 3000 });
    }
    dialogVisible.value = false;
    await load();
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    submitting.value = false;
  }
}

function confirmDelete(dept: Department) {
  confirm.require({
    message: t('departments.deleteConfirm', { name: dept.name }),
    header: t('common.delete'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await departmentService.remove(dept.id);
        departments.value = departments.value.filter((d) => d.id !== dept.id);
        toast.add({ severity: 'success', summary: t('departments.deleted'), life: 3000 });
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      }
    },
  });
}

onMounted(load);
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('departments.title') }}</h1>
      <p class="page-subtitle">{{ t('departments.subtitle') }}</p>
    </div>
    <Button :label="t('departments.new')" icon="pi pi-plus" @click="openCreate" />
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <div v-if="loading" class="skeleton-table">
    <div v-for="i in 4" :key="i" class="skeleton-row">
      <Skeleton width="30%" height="1.1rem" /><Skeleton width="40%" height="1rem" /><Skeleton width="60px" height="1.5rem" borderRadius="16px" />
    </div>
  </div>

  <DataTable v-else :value="departments" dataKey="id" stripedRows>
    <template #empty><div class="empty-state"><i class="pi pi-sitemap" /><p>{{ t('departments.empty') }}</p></div></template>

    <Column :header="t('departments.fields.name')" style="min-width: 180px">
      <template #body="{ data }"><span style="font-weight: 600">{{ data.name }}</span></template>
    </Column>
    <Column :header="t('departments.fields.description')" style="min-width: 220px">
      <template #body="{ data }"><span class="muted">{{ data.description || '—' }}</span></template>
    </Column>
    <Column :header="t('departments.fields.members')" style="min-width: 180px">
      <template #body="{ data }">
        <div v-if="data.members?.length" style="display: flex; flex-wrap: wrap; gap: 0.25rem">
          <Tag v-for="m in data.members" :key="m.id" :value="m.user.fullName || m.user.email" severity="secondary" />
        </div>
        <span v-else class="muted">{{ t('common.none') }}</span>
      </template>
    </Column>
    <Column :header="t('departments.fields.ticketCount')" style="width: 90px">
      <template #body="{ data }"><Tag :value="String(data._count?.tickets ?? 0)" icon="pi pi-ticket" severity="info" rounded /></template>
    </Column>
    <Column :header="t('common.actions')" style="width: 110px">
      <template #body="{ data }">
        <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
        <Button icon="pi pi-trash" text rounded severity="danger" @click="confirmDelete(data)" />
      </template>
    </Column>
  </DataTable>

  <Dialog v-model:visible="dialogVisible" :header="editing ? t('departments.editTitle') : t('departments.newTitle')" modal :style="{ width: '500px' }" :draggable="false">
    <div class="field">
      <label>{{ t('departments.fields.name') }} *</label>
      <InputText v-model="form.name" :placeholder="t('departments.placeholders.name')" :invalid="!!errors.name" maxlength="80" />
      <small v-if="errors.name" class="field-error">{{ errors.name }}</small>
    </div>
    <div class="field">
      <label>{{ t('departments.fields.description') }}</label>
      <Textarea v-model="form.description" rows="2" autoResize :placeholder="t('departments.placeholders.description')" maxlength="300" />
    </div>
    <div class="field">
      <label>{{ t('departments.fields.members') }}</label>
      <MultiSelect v-model="form.memberIds" :options="staffOptions" optionLabel="label" optionValue="value" :placeholder="t('departments.placeholders.members')" display="chip" filter class="full-width" />
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text severity="secondary" @click="dialogVisible = false" :disabled="submitting" />
      <Button :label="editing ? t('common.save') : t('common.create')" icon="pi pi-check" :loading="submitting" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.skeleton-table {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
}
.skeleton-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.9rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.skeleton-row:last-child {
  border-bottom: none;
}
</style>
