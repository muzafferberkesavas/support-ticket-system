<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { userService } from '@/services/user.service';
import { departmentService } from '@/services/department.service';
import { extractErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { ROLE_VALUES, formatDateTime, initials } from '@/constants';
import { useUiStore } from '@/stores/ui';
import type { Department, Role, User } from '@/types';
import RoleTag from '@/components/RoleTag.vue';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const auth = useAuthStore();
const ui = useUiStore();

const users = ref<User[]>([]);
const departments = ref<Department[]>([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');

const dialogVisible = ref(false);
const editing = ref<User | null>(null);
const submitting = ref(false);
const form = reactive({ fullName: '', role: 'user' as Role, departmentIds: [] as string[] });

// Kullanıcı oluştur
const createVisible = ref(false);
const creating = ref(false);
const createForm = reactive({ email: '', fullName: '', role: 'agent' as Role, departmentIds: [] as string[] });
const createErrors = reactive<Record<string, string>>({});
const tempPasswordVisible = ref(false);
const tempPassword = ref('');

function openCreate() {
  createForm.email = '';
  createForm.fullName = '';
  createForm.role = 'agent';
  createForm.departmentIds = [];
  Object.keys(createErrors).forEach((k) => delete createErrors[k]);
  createVisible.value = true;
}

async function submitCreate() {
  Object.keys(createErrors).forEach((k) => delete createErrors[k]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) {
    createErrors.email = t('auth.errors.email');
    return;
  }
  creating.value = true;
  try {
    const { tempPassword: tp } = await userService.create({
      email: createForm.email.trim(),
      fullName: createForm.fullName.trim() || undefined,
      role: createForm.role,
      departmentIds: createForm.departmentIds,
    });
    createVisible.value = false;
    tempPassword.value = tp;
    tempPasswordVisible.value = true;
    toast.add({ severity: 'success', summary: t('users.created'), life: 3500 });
    await load();
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    creating.value = false;
  }
}

function confirmDelete(user: User) {
  confirm.require({
    message: t('users.deleteConfirm', { name: user.fullName || user.email }),
    header: t('common.delete'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await userService.remove(user.id);
        users.value = users.value.filter((u) => u.id !== user.id);
        toast.add({ severity: 'success', summary: t('users.deleted'), life: 3000 });
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      }
    },
  });
}

const roleOptions = computed(() => ROLE_VALUES.map((r) => ({ label: t(`roles.${r}`), value: r })));
const departmentOptions = computed(() => departments.value.map((d) => ({ label: d.name, value: d.id })));

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter((u) => u.email.toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [u, d] = await Promise.all([userService.list(), departmentService.list()]);
    users.value = u;
    departments.value = d;
  } catch (err) {
    loadError.value = extractErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function openEdit(user: User) {
  editing.value = user;
  form.fullName = user.fullName ?? '';
  form.role = user.role;
  form.departmentIds = user.memberships?.map((m) => m.department.id) ?? [];
  dialogVisible.value = true;
}

async function submit() {
  if (!editing.value) return;
  submitting.value = true;
  try {
    await userService.update(editing.value.id, {
      fullName: form.fullName.trim() || null,
      role: form.role,
      departmentIds: form.departmentIds,
    });
    toast.add({ severity: 'success', summary: t('users.updated'), life: 3000 });
    dialogVisible.value = false;
    await load();
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('users.title') }}</h1>
      <p class="page-subtitle">{{ t('users.subtitle') }}</p>
    </div>
    <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" :placeholder="t('users.searchPlaceholder')" style="min-width: 220px" />
      </IconField>
      <Button :label="t('users.new')" icon="pi pi-user-plus" @click="openCreate" />
    </div>
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <div v-if="loading" class="skeleton-table">
    <div v-for="i in 6" :key="i" class="skeleton-row">
      <Skeleton shape="circle" size="2.2rem" /><Skeleton width="30%" height="1rem" /><Skeleton
        width="80px"
        height="1.5rem"
        borderRadius="16px"
      />
    </div>
  </div>

  <DataTable v-else :value="filteredUsers" dataKey="id" stripedRows paginator :rows="15">
    <template #empty
      ><div class="empty-state">
        <i class="pi pi-users" />
        <p>{{ t('users.empty') }}</p>
      </div></template
    >

    <Column :header="t('users.fields.name')" style="min-width: 220px">
      <template #body="{ data }">
        <div style="display: flex; align-items: center; gap: 0.6rem">
          <Avatar :label="initials(data.fullName, data.email)" shape="circle" class="avatar-brand" />
          <div>
            <div style="font-weight: 600">{{ data.fullName || '—' }}</div>
            <div class="muted" style="font-size: 0.8rem">{{ data.email }}</div>
          </div>
        </div>
      </template>
    </Column>
    <Column :header="t('users.fields.role')" style="width: 130px">
      <template #body="{ data }"><RoleTag :role="data.role" /></template>
    </Column>
    <Column :header="t('users.fields.departments')" style="min-width: 180px">
      <template #body="{ data }">
        <div v-if="data.memberships?.length" style="display: flex; flex-wrap: wrap; gap: 0.25rem">
          <Tag
            v-for="m in data.memberships"
            :key="m.department.id"
            :value="m.department.name"
            severity="secondary"
            icon="pi pi-sitemap"
          />
        </div>
        <span v-else class="muted">—</span>
      </template>
    </Column>
    <Column :header="t('users.fields.tickets')" style="width: 90px">
      <template #body="{ data }"
        ><Tag :value="String(data._count?.tickets ?? 0)" icon="pi pi-ticket" severity="info" rounded
      /></template>
    </Column>
    <Column :header="t('users.fields.createdAt')" style="min-width: 140px">
      <template #body="{ data }"
        ><span class="muted">{{ formatDateTime(data.createdAt, ui.locale) }}</span></template
      >
    </Column>
    <Column :header="t('common.actions')" style="width: 110px">
      <template #body="{ data }">
        <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
        <Button
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          :disabled="data.id === auth.user?.id"
          @click="confirmDelete(data)"
        />
      </template>
    </Column>
  </DataTable>

  <Dialog
    v-model:visible="dialogVisible"
    :header="t('users.editTitle')"
    modal
    :style="{ width: '460px' }"
    :draggable="false"
  >
    <div v-if="editing" class="field">
      <label>{{ t('users.fields.email') }}</label>
      <InputText :modelValue="editing.email" disabled class="full-width" />
    </div>
    <div class="field">
      <label>{{ t('users.fields.name') }}</label>
      <InputText v-model="form.fullName" class="full-width" maxlength="120" />
    </div>
    <div class="field">
      <label>{{ t('users.fields.role') }}</label>
      <Select
        v-model="form.role"
        :options="roleOptions"
        optionLabel="label"
        optionValue="value"
        class="full-width"
        :disabled="editing?.id === auth.user?.id"
      />
      <small v-if="editing?.id === auth.user?.id" class="muted">{{ t('users.selfRoleError') }}</small>
    </div>
    <div class="field">
      <label>{{ t('users.fields.departments') }}</label>
      <MultiSelect
        v-model="form.departmentIds"
        :options="departmentOptions"
        optionLabel="label"
        optionValue="value"
        :placeholder="t('tickets.placeholders.department')"
        display="chip"
        filter
        class="full-width"
      />
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        text
        severity="secondary"
        @click="dialogVisible = false"
        :disabled="submitting"
      />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="submitting" @click="submit" />
    </template>
  </Dialog>

  <!-- Kullanıcı oluştur -->
  <Dialog
    v-model:visible="createVisible"
    :header="t('users.createTitle')"
    modal
    :style="{ width: '460px' }"
    :draggable="false"
  >
    <div class="field">
      <label>{{ t('users.fields.email') }} *</label>
      <InputText
        v-model="createForm.email"
        type="email"
        :placeholder="t('auth.emailPlaceholder')"
        :invalid="!!createErrors.email"
        class="full-width"
      />
      <small v-if="createErrors.email" class="field-error">{{ createErrors.email }}</small>
    </div>
    <div class="field">
      <label>{{ t('users.fields.name') }}</label>
      <InputText v-model="createForm.fullName" class="full-width" maxlength="120" />
    </div>
    <div class="field">
      <label>{{ t('users.fields.role') }}</label>
      <Select
        v-model="createForm.role"
        :options="roleOptions"
        optionLabel="label"
        optionValue="value"
        class="full-width"
      />
    </div>
    <div class="field">
      <label>{{ t('users.fields.departments') }}</label>
      <MultiSelect
        v-model="createForm.departmentIds"
        :options="departmentOptions"
        optionLabel="label"
        optionValue="value"
        :placeholder="t('tickets.placeholders.department')"
        display="chip"
        filter
        class="full-width"
      />
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        text
        severity="secondary"
        @click="createVisible = false"
        :disabled="creating"
      />
      <Button :label="t('common.create')" icon="pi pi-check" :loading="creating" @click="submitCreate" />
    </template>
  </Dialog>

  <!-- Geçici şifre sonucu -->
  <Dialog
    v-model:visible="tempPasswordVisible"
    :header="t('users.tempPasswordTitle')"
    modal
    :style="{ width: '420px' }"
    :draggable="false"
  >
    <p class="muted" style="margin-top: 0">{{ t('users.tempPasswordInfo') }}</p>
    <div class="temp-pass">
      <span class="temp-pass-label">{{ t('users.tempPasswordLabel') }}</span>
      <code class="temp-pass-value">{{ tempPassword }}</code>
    </div>
    <template #footer>
      <Button :label="t('common.close')" icon="pi pi-check" @click="tempPasswordVisible = false" />
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
.temp-pass {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  margin-top: 0.5rem;
}
.temp-pass-label {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.temp-pass-value {
  font-family: monospace;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--brand);
  letter-spacing: 0.5px;
}
</style>
