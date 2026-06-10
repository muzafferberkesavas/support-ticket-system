<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { ticketService } from '@/services/ticket.service';
import { departmentService } from '@/services/department.service';
import { extractErrorMessage } from '@/services/api';
import { PRIORITY_VALUES, STATUS_VALUES } from '@/constants';
import { useDuration } from '@/composables/useDuration';
import TagsInput from '@/components/TagsInput.vue';
import type { Department, Priority, Status, Ticket, TicketEstimate } from '@/types';

const props = defineProps<{
  visible: boolean;
  ticket?: Ticket | null;
  canEditStatus?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved', ticket: Ticket): void;
}>();

const { t } = useI18n();
const toast = useToast();
const fmt = useDuration();
const isEdit = computed(() => !!props.ticket);
const estimate = ref<TicketEstimate | null>(null);
let estTimer: number | undefined;

const departments = ref<Department[]>([]);
const form = reactive({
  subject: '',
  message: '',
  priority: 'medium' as Priority,
  status: 'open' as Status,
  category: '',
  tags: [] as string[],
  departmentId: null as string | null,
  assigneeIds: [] as string[],
});

const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const submitting = ref(false);

const maxMb = 10;
const files = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
function pickFiles() {
  fileInput.value?.click();
}
function onFiles(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? []);
  files.value = [...files.value, ...picked].slice(0, 5);
  if (fileInput.value) fileInput.value.value = '';
}
function removeFile(i: number) {
  files.value.splice(i, 1);
}

const priorityOptions = computed(() => PRIORITY_VALUES.map((v) => ({ label: t(`priority.${v}`), value: v })));
const statusOptions = computed(() => STATUS_VALUES.map((v) => ({ label: t(`status.${v}`), value: v })));
const departmentOptions = computed(() => departments.value.map((d) => ({ label: d.name, value: d.id })));

// Assignable people = members of the selected department.
const assigneeOptions = computed(() => {
  const dept = departments.value.find((d) => d.id === form.departmentId);
  if (!dept?.members) return [];
  return dept.members.map((m) => ({
    label: m.user.fullName || m.user.email,
    value: m.user.id,
  }));
});

async function loadDepartments() {
  try {
    departments.value = await departmentService.list();
  } catch {
    departments.value = [];
  }
}

watch(
  () => props.visible,
  (open) => {
    if (!open) return;
    serverError.value = '';
    files.value = [];
    Object.keys(errors).forEach((k) => delete errors[k]);
    loadDepartments();
    form.subject = props.ticket?.subject ?? '';
    form.message = props.ticket?.message ?? '';
    form.priority = props.ticket?.priority ?? 'medium';
    form.status = props.ticket?.status ?? 'open';
    form.category = props.ticket?.category ?? '';
    form.tags = [...(props.ticket?.tags ?? [])];
    form.departmentId = props.ticket?.departmentId ?? null;
    form.assigneeIds = props.ticket?.assignees?.map((a) => a.userId) ?? [];
  },
);

// Drop assignees that no longer belong to the chosen department.
watch(
  () => form.departmentId,
  () => {
    const valid = new Set(assigneeOptions.value.map((o) => o.value));
    form.assigneeIds = form.assigneeIds.filter((id) => valid.has(id));
  },
);

// Estimated response/resolution time (debounced) for the chosen priority/department.
watch([() => form.priority, () => form.departmentId, () => props.visible], () => {
  if (!props.visible) {
    estimate.value = null;
    return;
  }
  clearTimeout(estTimer);
  estTimer = window.setTimeout(async () => {
    try {
      estimate.value = await ticketService.estimate(form.priority, form.departmentId);
    } catch {
      estimate.value = null;
    }
  }, 300);
});

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (form.subject.trim().length < 3) errors.subject = t('tickets.validation.subjectMin');
  if (form.message.trim().length < 5) errors.message = t('tickets.validation.messageMin');
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate()) return;
  submitting.value = true;
  serverError.value = '';
  try {
    const base = {
      subject: form.subject.trim(),
      message: form.message.trim(),
      priority: form.priority,
      category: form.category.trim() || null,
      tags: form.tags,
      departmentId: form.departmentId,
      assigneeIds: form.assigneeIds,
    };
    let saved: Ticket;
    if (isEdit.value && props.ticket) {
      saved = await ticketService.update(props.ticket.id, {
        ...base,
        ...(props.canEditStatus ? { status: form.status } : {}),
      });
      toast.add({
        severity: 'success',
        summary: t('tickets.detail.saved'),
        detail: t('tickets.detail.updated'),
        life: 3000,
      });
    } else {
      saved = await ticketService.create(base);
      toast.add({
        severity: 'success',
        summary: t('tickets.detail.saved'),
        detail: t('tickets.detail.created'),
        life: 3000,
      });
    }
    if (files.value.length) {
      try {
        await ticketService.uploadAttachments(saved.id, files.value);
      } catch (e) {
        toast.add({
          severity: 'warn',
          summary: t('tickets.detail.uploadFailed'),
          detail: extractErrorMessage(e),
          life: 4000,
        });
      }
    }
    emit('saved', saved);
    emit('update:visible', false);
  } catch (err) {
    serverError.value = extractErrorMessage(err, t('errors.saveTicket'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :header="isEdit ? t('tickets.editTitle') : t('tickets.newTitle')"
    modal
    :style="{ width: '560px' }"
    :draggable="false"
    :dismissableMask="true"
  >
    <form @submit.prevent="submit" class="ticket-form">
      <Message v-if="serverError" severity="error" :closable="false" class="full-width">{{ serverError }}</Message>

      <div class="field">
        <label for="subject">{{ t('tickets.fields.subject') }} *</label>
        <InputText
          id="subject"
          v-model="form.subject"
          :placeholder="t('tickets.placeholders.subject')"
          :invalid="!!errors.subject"
          maxlength="150"
          autofocus
        />
        <small v-if="errors.subject" class="field-error">{{ errors.subject }}</small>
      </div>

      <div class="field">
        <label for="message">{{ t('tickets.fields.message') }} *</label>
        <Textarea
          id="message"
          v-model="form.message"
          rows="5"
          autoResize
          :placeholder="t('tickets.placeholders.message')"
          :invalid="!!errors.message"
          maxlength="5000"
        />
        <small v-if="errors.message" class="field-error">{{ errors.message }}</small>
      </div>

      <div class="form-row">
        <div class="field" style="flex: 1">
          <label>{{ t('tickets.fields.priority') }}</label>
          <Select
            v-model="form.priority"
            :options="priorityOptions"
            optionLabel="label"
            optionValue="value"
            class="full-width"
          />
        </div>
        <div class="field" style="flex: 1">
          <label
            >{{ t('tickets.fields.category') }} <span class="muted">({{ t('common.optional') }})</span></label
          >
          <InputText v-model="form.category" :placeholder="t('tickets.placeholders.category')" maxlength="80" />
        </div>
      </div>

      <div class="field">
        <label
          >{{ t('tickets.fields.tags') }} <span class="muted">({{ t('common.optional') }})</span></label
        >
        <TagsInput v-model="form.tags" :placeholder="t('tickets.placeholders.tags')" />
      </div>

      <div class="form-row">
        <div class="field" style="flex: 1">
          <label>{{ t('tickets.fields.department') }}</label>
          <Select
            v-model="form.departmentId"
            :options="departmentOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="t('tickets.placeholders.department')"
            showClear
            class="full-width"
          />
        </div>
        <div class="field" style="flex: 1">
          <label>{{ t('tickets.fields.assignees') }}</label>
          <MultiSelect
            v-model="form.assigneeIds"
            :options="assigneeOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="
              form.departmentId ? t('tickets.placeholders.assignees') : t('tickets.placeholders.department')
            "
            :disabled="!form.departmentId || assigneeOptions.length === 0"
            display="chip"
            class="full-width"
          />
        </div>
      </div>

      <div v-if="isEdit && canEditStatus" class="field">
        <label>{{ t('tickets.fields.status') }}</label>
        <Select
          v-model="form.status"
          :options="statusOptions"
          optionLabel="label"
          optionValue="value"
          class="full-width"
        />
      </div>

      <div class="field">
        <label
          >{{ t('tickets.detail.attachments') }} <span class="muted">({{ t('common.optional') }})</span></label
        >
        <div class="att-picker">
          <Button
            type="button"
            :label="t('tickets.detail.addFiles')"
            icon="pi pi-paperclip"
            outlined
            size="small"
            @click="pickFiles"
          />
          <span class="muted att-hint">{{ t('tickets.detail.attachHint', { mb: maxMb }) }}</span>
        </div>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
          style="display: none"
          @change="onFiles"
        />
        <div v-if="files.length" class="att-chips">
          <span v-for="(f, i) in files" :key="i" class="att-chip">
            <i class="pi pi-file" /> {{ f.name }}
            <i class="pi pi-times att-chip-x" @click="removeFile(i)" />
          </span>
        </div>
      </div>

      <div v-if="estimate" class="estimate-line">
        <i class="pi pi-clock" />
        <span>{{ t('tickets.detail.estResponse') }} ~{{ fmt(estimate.estFirstResponseMinutes) }}</span>
        <span>· {{ t('tickets.detail.estResolution') }} ~{{ fmt(estimate.estResolutionMinutes) }}</span>
      </div>
    </form>

    <template #footer>
      <Button
        :label="t('common.cancel')"
        text
        severity="secondary"
        @click="emit('update:visible', false)"
        :disabled="submitting"
      />
      <Button
        :label="isEdit ? t('common.save') : t('common.create')"
        icon="pi pi-check"
        :loading="submitting"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.5rem;
}
.form-row {
  display: flex;
  gap: 1rem;
}
@media (max-width: 520px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
.estimate-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  font-size: 0.83rem;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  margin-top: 0.5rem;
}
.estimate-line i {
  color: var(--brand);
}
.att-picker {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.att-hint {
  font-size: 0.76rem;
}
.att-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.att-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att-chip-x {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.7rem;
}
.att-chip-x:hover {
  color: #ef4444;
}
</style>
