<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { socket } from '@/services/socket';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Tag from 'primevue/tag';
import Avatar from 'primevue/avatar';
import AvatarGroup from 'primevue/avatargroup';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { ticketService } from '@/services/ticket.service';
import { departmentService } from '@/services/department.service';
import { extractErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { PRIORITY_RANK, PRIORITY_VALUES, STATUS_RANK, STATUS_VALUES, formatDateTime, initials } from '@/constants';
import { downloadCsv } from '@/utils/csv';
import { jobsService } from '@/services/jobs.service';
import type { Department, Ticket } from '@/types';
import PriorityTag from '@/components/PriorityTag.vue';
import StatusTag from '@/components/StatusTag.vue';
import SlaBadge from '@/components/SlaBadge.vue';
import TicketFormDialog from '@/components/TicketFormDialog.vue';

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { t } = useI18n();

const tickets = ref<Ticket[]>([]);
const departments = ref<Department[]>([]);
const loading = ref(true);
const loadError = ref('');

const filters = reactive<{
  status: string | null;
  priority: string | null;
  departmentId: string | null;
  tag: string | null;
}>({
  status: null,
  priority: null,
  departmentId: null,
  tag: null,
});
const scope = ref<'all' | 'mine' | 'unassigned'>('all');
const searchText = ref('');
const availableTags = ref<string[]>([]);

// Bulk selection
const selectedTickets = ref<Ticket[]>([]);
const bulkBusy = ref(false);
const bulkStatusPick = ref<string | null>(null);

const dialogVisible = ref(false);
const editingTicket = ref<Ticket | null>(null);

const title = computed(() => {
  if (auth.isAdmin) return t('tickets.allTitle');
  if (auth.isStaff) return t('tickets.title');
  return t('tickets.myTitle');
});
const subtitle = computed(() => {
  if (auth.isAdmin) return t('tickets.subtitleAdmin');
  if (auth.isStaff) return t('tickets.subtitleStaff');
  return t('tickets.subtitleUser');
});

const scopeOptions = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('tickets.scopeMine'), value: 'mine' },
  { label: t('common.unassigned'), value: 'unassigned' },
]);
const priorityOptions = computed(() => PRIORITY_VALUES.map((v) => ({ label: t(`priority.${v}`), value: v })));
const statusOptions = computed(() => STATUS_VALUES.map((v) => ({ label: t(`status.${v}`), value: v })));
const departmentOptions = computed(() => departments.value.map((d) => ({ label: d.name, value: d.id })));

const stats = computed(() => ({
  total: tickets.value.length,
  open: tickets.value.filter((x) => x.status === 'open').length,
  inProgress: tickets.value.filter((x) => x.status === 'in_progress').length,
  high: tickets.value.filter((x) => x.priority === 'high').length,
}));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const list = await ticketService.list({
      status: (filters.status as never) || undefined,
      priority: (filters.priority as never) || undefined,
      departmentId: filters.departmentId || undefined,
      tag: filters.tag || undefined,
      scope: auth.isStaff && scope.value !== 'all' ? scope.value : undefined,
      search: searchText.value.trim() || undefined,
    });
    // Attach numeric ranks for severity/workflow-ordered sorting.
    tickets.value = list.map((tk) => ({
      ...tk,
      priorityRank: PRIORITY_RANK[tk.priority],
      statusRank: STATUS_RANK[tk.status],
    }));
  } catch (err) {
    loadError.value = extractErrorMessage(err, t('errors.loadTickets'));
  } finally {
    loading.value = false;
  }
}

async function loadDepartments() {
  try {
    departments.value = await departmentService.list();
  } catch {
    departments.value = [];
  }
}

async function loadTags() {
  availableTags.value = await ticketService.tags().catch(() => []);
}

// Offload a (potentially large) export to the worker; it builds the CSV and emails it.
const emailExporting = ref(false);
async function emailExport() {
  emailExporting.value = true;
  try {
    await jobsService.exportTickets({
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      departmentId: filters.departmentId || undefined,
      tag: filters.tag || undefined,
      search: searchText.value.trim() || undefined,
    });
    toast.add({ severity: 'success', summary: t('tickets.exportQueued'), life: 4000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    emailExporting.value = false;
  }
}

function clearFilters() {
  filters.status = null;
  filters.priority = null;
  filters.departmentId = null;
  filters.tag = null;
  scope.value = 'all';
  searchText.value = '';
  load();
}

const hasActiveFilters = computed(
  () =>
    filters.status ||
    filters.priority ||
    filters.departmentId ||
    filters.tag ||
    scope.value !== 'all' ||
    searchText.value.trim(),
);

// ── Bulk actions ────────────────────────────────────────────────────
const tagOptions = computed(() => availableTags.value.map((t) => ({ label: t, value: t })));

async function bulkStatus(status: 'open' | 'in_progress' | 'closed') {
  const ids = selectedTickets.value.map((t) => t.id);
  if (!ids.length) return;
  bulkBusy.value = true;
  try {
    const res = await ticketService.bulk(ids, 'status', { status });
    toast.add({ severity: 'success', summary: t('bulk.done', res), life: 3000 });
    selectedTickets.value = [];
    await load();
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

function bulkDelete() {
  const ids = selectedTickets.value.map((t) => t.id);
  if (!ids.length) return;
  confirm.require({
    message: t('bulk.deleteConfirm', { n: ids.length }),
    header: t('common.delete'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      bulkBusy.value = true;
      try {
        const res = await ticketService.bulk(ids, 'delete');
        toast.add({ severity: 'success', summary: t('bulk.done', res), life: 3000 });
        selectedTickets.value = [];
        await load();
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

// Debounced search.
let searchTimer: number | undefined;
watch(searchText, () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(load, 350);
});

function openCreate() {
  editingTicket.value = null;
  dialogVisible.value = true;
}
function openEdit(ticket: Ticket) {
  editingTicket.value = ticket;
  dialogVisible.value = true;
}

function confirmDelete(ticket: Ticket) {
  confirm.require({
    message: t('tickets.deleteConfirm', { subject: ticket.subject }),
    header: t('tickets.deleteHeader'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await ticketService.remove(ticket.id);
        tickets.value = tickets.value.filter((x) => x.id !== ticket.id);
        toast.add({ severity: 'success', summary: t('tickets.detail.deleted'), life: 3000 });
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      }
    },
  });
}

function rowClass(data: Ticket) {
  if (data.escalated || data.sla?.breached) return 'row-overdue';
  return data.priority === 'high' ? 'row-high-priority' : '';
}

function exportTickets() {
  const rows: (string | number | null)[][] = [
    [
      t('tickets.fields.subject'),
      t('tickets.fields.requester'),
      t('tickets.fields.department'),
      t('tickets.fields.priority'),
      t('tickets.fields.status'),
      t('tickets.fields.assignees'),
      t('tickets.fields.createdAt'),
    ],
  ];
  tickets.value.forEach((tk) =>
    rows.push([
      tk.subject,
      tk.user?.fullName || tk.user?.email || '',
      tk.department?.name || '',
      t(`priority.${tk.priority}`),
      t(`status.${tk.status}`),
      (tk.assignees ?? []).map((a) => a.user.fullName || a.user.email).join('; '),
      formatDateTime(tk.createdAt, ui.locale),
    ]),
  );
  downloadCsv(`talepler-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

// Live refresh: reload (debounced) whenever a ticket changes anywhere.
let reloadTimer: number | undefined;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(load, 400);
}

onMounted(() => {
  loadDepartments();
  loadTags();
  load();
  socket.on('ticket:created', scheduleReload);
  socket.on('ticket:updated', scheduleReload);
  socket.on('ticket:deleted', scheduleReload);
});

onUnmounted(() => {
  clearTimeout(reloadTimer);
  socket.off('ticket:created', scheduleReload);
  socket.off('ticket:updated', scheduleReload);
  socket.off('ticket:deleted', scheduleReload);
});
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div style="display: flex; gap: 0.5rem">
      <Button
        v-if="tickets.length"
        :label="t('analytics.exportCsv')"
        icon="pi pi-file-export"
        outlined
        @click="exportTickets"
      />
      <Button
        v-if="auth.isStaff"
        :label="t('tickets.exportEmail')"
        icon="pi pi-envelope"
        outlined
        severity="secondary"
        :loading="emailExporting"
        @click="emailExport"
      />
      <Button :label="t('tickets.new')" icon="pi pi-plus" @click="openCreate" />
    </div>
  </div>

  <!-- Stats -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-top">
        <div>
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">{{ t('tickets.stats.total') }}</div>
        </div>
        <div class="stat-icon" style="background: rgba(99, 102, 241, 0.12); color: #6366f1">
          <i class="pi pi-ticket" />
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div>
          <div class="stat-value" style="color: #d97706">{{ stats.open }}</div>
          <div class="stat-label">{{ t('tickets.stats.open') }}</div>
        </div>
        <div class="stat-icon" style="background: rgba(217, 119, 6, 0.12); color: #d97706">
          <i class="pi pi-inbox" />
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div>
          <div class="stat-value" style="color: #2563eb">{{ stats.inProgress }}</div>
          <div class="stat-label">{{ t('tickets.stats.inProgress') }}</div>
        </div>
        <div class="stat-icon" style="background: rgba(37, 99, 235, 0.12); color: #2563eb">
          <i class="pi pi-spinner" />
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div>
          <div class="stat-value" style="color: #dc2626">{{ stats.high }}</div>
          <div class="stat-label">{{ t('tickets.stats.high') }}</div>
        </div>
        <div class="stat-icon" style="background: rgba(220, 38, 38, 0.12); color: #dc2626">
          <i class="pi pi-exclamation-triangle" />
        </div>
      </div>
    </div>
  </div>

  <!-- Filters -->
  <div class="toolbar-filters" style="margin-bottom: 1rem">
    <IconField>
      <InputIcon class="pi pi-search" />
      <InputText v-model="searchText" :placeholder="t('common.search')" style="min-width: 220px" />
    </IconField>
    <SelectButton
      v-if="auth.isStaff"
      v-model="scope"
      :options="scopeOptions"
      optionLabel="label"
      optionValue="value"
      :allowEmpty="false"
      @change="load"
    />
    <Select
      v-model="filters.status"
      :options="statusOptions"
      optionLabel="label"
      optionValue="value"
      :placeholder="t('tickets.placeholders.filterStatus')"
      showClear
      style="min-width: 190px"
      @change="load"
    />
    <Select
      v-model="filters.priority"
      :options="priorityOptions"
      optionLabel="label"
      optionValue="value"
      :placeholder="t('tickets.placeholders.filterPriority')"
      showClear
      style="min-width: 190px"
      @change="load"
    />
    <Select
      v-if="auth.isStaff && departmentOptions.length"
      v-model="filters.departmentId"
      :options="departmentOptions"
      optionLabel="label"
      optionValue="value"
      :placeholder="t('tickets.placeholders.filterDepartment')"
      showClear
      style="min-width: 190px"
      @change="load"
    />
    <Select
      v-if="availableTags.length"
      v-model="filters.tag"
      :options="tagOptions"
      optionLabel="label"
      optionValue="value"
      :placeholder="t('tickets.placeholders.filterTag')"
      showClear
      style="min-width: 170px"
      @change="load"
    />
    <Button
      v-if="hasActiveFilters"
      :label="t('common.clear')"
      icon="pi pi-filter-slash"
      text
      severity="secondary"
      @click="clearFilters"
    />
  </div>

  <Message v-if="loadError" severity="error" :closable="false" style="margin-bottom: 1rem">{{ loadError }}</Message>

  <!-- Bulk action bar (staff) -->
  <div v-if="auth.isStaff && selectedTickets.length" class="bulk-bar">
    <span class="bulk-count">{{ t('bulk.selected', { n: selectedTickets.length }) }}</span>
    <Select
      v-model="bulkStatusPick"
      :options="statusOptions"
      optionLabel="label"
      optionValue="value"
      :placeholder="t('bulk.changeStatus')"
      :disabled="bulkBusy"
      style="min-width: 170px"
      @update:modelValue="
        (v) => {
          if (v) {
            bulkStatus(v);
            bulkStatusPick = null;
          }
        }
      "
    />
    <Button
      :label="t('bulk.delete')"
      icon="pi pi-trash"
      severity="danger"
      outlined
      size="small"
      :loading="bulkBusy"
      @click="bulkDelete"
    />
    <Button :label="t('bulk.clear')" text size="small" severity="secondary" @click="selectedTickets = []" />
  </div>

  <!-- Skeleton while loading -->
  <div v-if="loading" class="skeleton-table">
    <div v-for="i in 6" :key="i" class="skeleton-row">
      <Skeleton width="40%" height="1.1rem" />
      <Skeleton width="80px" height="1.5rem" borderRadius="16px" />
      <Skeleton width="80px" height="1.5rem" borderRadius="16px" />
      <Skeleton width="90px" height="1rem" />
    </div>
  </div>

  <DataTable
    v-else
    v-model:selection="selectedTickets"
    :value="tickets"
    :rowClass="rowClass"
    dataKey="id"
    paginator
    :rows="10"
    :rowsPerPageOptions="[10, 25, 50]"
    stripedRows
    removableSort
    sortMode="multiple"
  >
    <template #header>
      <div class="table-hint"><i class="pi pi-info-circle" /> {{ t('tickets.sortHint') }}</div>
    </template>
    <Column v-if="auth.isStaff" selectionMode="multiple" headerStyle="width: 3rem" :exportable="false" />
    <template #empty>
      <div class="empty-state">
        <i class="pi pi-inbox" />
        <p>{{ t('tickets.empty') }}</p>
        <Button :label="t('tickets.createFirst')" icon="pi pi-plus" text @click="openCreate" />
      </div>
    </template>

    <Column field="subject" :header="t('tickets.fields.subject')" sortable style="min-width: 220px">
      <template #body="{ data }">
        <RouterLink :to="`/tickets/${data.id}`" class="subject-link">{{ data.subject }}</RouterLink>
        <div class="subject-sub">
          <span v-if="data.category" class="muted">{{ data.category }}</span>
          <span v-if="data._count?.attachments" class="muted"
            ><i class="pi pi-paperclip" /> {{ data._count.attachments }}</span
          >
          <Tag
            v-for="tg in (data.tags || []).slice(0, 3)"
            :key="tg"
            :value="tg"
            severity="secondary"
            rounded
            class="list-tag"
          />
          <SlaBadge :ticket="data" />
        </div>
      </template>
    </Column>

    <Column v-if="auth.isStaff" :header="t('tickets.fields.requester')" style="min-width: 160px">
      <template #body="{ data }">
        <span class="muted">{{ data.user?.fullName || data.user?.email || '—' }}</span>
      </template>
    </Column>

    <Column v-if="auth.isStaff" :header="t('tickets.fields.department')" style="min-width: 130px">
      <template #body="{ data }">
        <Tag v-if="data.department" :value="data.department.name" severity="secondary" icon="pi pi-sitemap" />
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <Column field="priority" sortField="priorityRank" :header="t('tickets.fields.priority')" sortable>
      <template #body="{ data }"><PriorityTag :priority="data.priority" /></template>
    </Column>

    <Column field="status" sortField="statusRank" :header="t('tickets.fields.status')" sortable>
      <template #body="{ data }"><StatusTag :status="data.status" /></template>
    </Column>

    <Column v-if="auth.isStaff" :header="t('tickets.fields.assignees')" style="min-width: 110px">
      <template #body="{ data }">
        <AvatarGroup v-if="data.assignees?.length">
          <Avatar
            v-for="a in data.assignees.slice(0, 3)"
            :key="a.id"
            :label="initials(a.user.fullName, a.user.email)"
            shape="circle"
            class="avatar-brand"
            v-tooltip.top="a.user.fullName || a.user.email"
          />
          <Avatar v-if="data.assignees.length > 3" :label="`+${data.assignees.length - 3}`" shape="circle" />
        </AvatarGroup>
        <span v-else class="muted">{{ t('common.unassigned') }}</span>
      </template>
    </Column>

    <Column :header="t('tickets.fields.replies')">
      <template #body="{ data }">
        <Tag :value="String(data._count?.replies ?? 0)" icon="pi pi-comments" severity="secondary" rounded />
      </template>
    </Column>

    <Column field="createdAt" :header="t('tickets.fields.createdAt')" sortable style="min-width: 150px">
      <template #body="{ data }"
        ><span class="muted">{{ formatDateTime(data.createdAt, ui.locale) }}</span></template
      >
    </Column>

    <Column :header="t('common.actions')" style="width: 140px">
      <template #body="{ data }">
        <div class="row-actions">
          <Button
            icon="pi pi-eye"
            text
            rounded
            severity="secondary"
            v-tooltip.bottom="t('common.details')"
            @click="router.push(`/tickets/${data.id}`)"
          />
          <Button
            icon="pi pi-pencil"
            text
            rounded
            severity="secondary"
            v-tooltip.bottom="t('common.edit')"
            @click="openEdit(data)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            v-tooltip.bottom="t('common.delete')"
            @click="confirmDelete(data)"
          />
        </div>
      </template>
    </Column>
  </DataTable>

  <TicketFormDialog
    v-model:visible="dialogVisible"
    :ticket="editingTicket"
    :canEditStatus="auth.isStaff || !!editingTicket"
    @saved="load"
  />
</template>

<style scoped>
.subject-link {
  font-weight: 600;
  color: var(--text);
}
.subject-link:hover {
  color: var(--brand);
}
.subject-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.2rem;
  font-size: 0.78rem;
}
.list-tag {
  font-size: 0.68rem !important;
}
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  background: color-mix(in srgb, var(--brand) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--brand) 25%, transparent);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  margin-bottom: 0.9rem;
}
.bulk-count {
  font-weight: 600;
  color: var(--text);
}
.table-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.table-hint i {
  color: var(--brand);
}
.row-actions {
  display: flex;
  gap: 0.1rem;
}
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
