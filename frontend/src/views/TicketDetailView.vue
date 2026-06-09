<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { socket } from '@/services/socket';
import { useRealtimeStore } from '@/stores/realtime';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import Rating from 'primevue/rating';
import Skeleton from 'primevue/skeleton';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { ticketService } from '@/services/ticket.service';
import { departmentService } from '@/services/department.service';
import { extractErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { STATUS_VALUES, formatDateTime, initials } from '@/constants';
import { useDuration } from '@/composables/useDuration';
import type { AuditEntry, Department, Status, Ticket, TicketEstimate, TicketReply } from '@/types';
import PriorityTag from '@/components/PriorityTag.vue';
import StatusTag from '@/components/StatusTag.vue';
import SlaBadge from '@/components/SlaBadge.vue';
import AttachmentList from '@/components/AttachmentList.vue';
import CannedMenu from '@/components/CannedMenu.vue';
import TicketFormDialog from '@/components/TicketFormDialog.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const toast = useToast();
const confirm = useConfirm();
const realtime = useRealtimeStore();
const { t } = useI18n();
const fmt = useDuration();

const ticket = ref<Ticket | null>(null);
const departments = ref<Department[]>([]);
const activity = ref<AuditEntry[]>([]);
const estimate = ref<TicketEstimate | null>(null);
const escalating = ref(false);
const loading = ref(true);
const loadError = ref('');

const dialogVisible = ref(false);
const replyText = ref('');
const replyInternal = ref(false);
const sendingReply = ref(false);
const statusUpdating = ref(false);
const assigning = ref(false);
const assigneeDraft = ref<string[]>([]);

const ticketId = computed(() => route.params.id as string);
const statusOptions = computed(() => STATUS_VALUES.map((v) => ({ label: t(`status.${v}`), value: v })));

const assigneeOptions = computed(() => {
  const dept = departments.value.find((d) => d.id === ticket.value?.departmentId);
  if (!dept?.members) return [];
  return dept.members.map((m) => ({ label: m.user.fullName || m.user.email, value: m.user.id }));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    ticket.value = await ticketService.get(ticketId.value);
    assigneeDraft.value = ticket.value.assignees?.map((a) => a.userId) ?? [];
    if (auth.isStaff) {
      departments.value = await departmentService.list().catch(() => []);
    }
    activity.value = await ticketService.activity(ticketId.value).catch(() => []);
    const tk = ticket.value;
    if (tk.userId === auth.user?.id && tk.status !== 'closed') {
      estimate.value = await ticketService
        .estimate(tk.priority, tk.departmentId ?? undefined)
        .catch(() => null);
    } else {
      estimate.value = null;
    }
  } catch (err) {
    loadError.value = extractErrorMessage(err, t('errors.loadTicket'));
  } finally {
    loading.value = false;
  }
}

async function sendReply() {
  if (replyText.value.trim().length < 1 || !ticket.value) return;
  sendingReply.value = true;
  try {
    await ticketService.addReply(ticket.value.id, replyText.value.trim(), auth.isStaff && replyInternal.value);
    replyText.value = '';
    replyInternal.value = false;
    stopTyping();
    await load();
    toast.add({ severity: 'success', summary: t('tickets.detail.replySent'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    sendingReply.value = false;
  }
}

async function changeStatus(status: Status) {
  if (!ticket.value || ticket.value.status === status) return;
  statusUpdating.value = true;
  try {
    ticket.value = await ticketService.update(ticket.value.id, { status });
    toast.add({ severity: 'success', summary: t('tickets.detail.statusUpdated'), life: 2500 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    statusUpdating.value = false;
  }
}

async function saveAssignees() {
  if (!ticket.value) return;
  assigning.value = true;
  try {
    ticket.value = await ticketService.assign(ticket.value.id, assigneeDraft.value);
    toast.add({ severity: 'success', summary: t('tickets.detail.assignUpdated'), life: 2500 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    assigning.value = false;
  }
}

function confirmDelete() {
  if (!ticket.value) return;
  confirm.require({
    message: t('tickets.deleteConfirm', { subject: ticket.value.subject }),
    header: t('tickets.deleteHeader'),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await ticketService.remove(ticket.value!.id);
        toast.add({ severity: 'success', summary: t('tickets.detail.deleted'), life: 3000 });
        router.push('/tickets');
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      }
    },
  });
}

const canDelete = computed(() => auth.isAdmin || ticket.value?.userId === auth.user?.id);
const isRequester = computed(() => ticket.value?.userId === auth.user?.id);
const canReopen = computed(
  () => !!ticket.value && ticket.value.status === 'closed' && (isRequester.value || auth.isStaff),
);
const reopening = ref(false);
async function reopen() {
  if (!ticket.value) return;
  reopening.value = true;
  try {
    ticket.value = await ticketService.reopen(ticket.value.id);
    await load();
    toast.add({ severity: 'success', summary: t('tickets.detail.reopened'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    reopening.value = false;
  }
}
const canEscalate = computed(
  () => auth.isStaff && !!ticket.value && !ticket.value.escalated && ticket.value.status !== 'closed',
);

function escalate() {
  if (!ticket.value) return;
  confirm.require({
    message: t('tickets.detail.escalateConfirm'),
    header: t('tickets.detail.escalate'),
    icon: 'pi pi-arrow-up',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('tickets.detail.escalate'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      escalating.value = true;
      try {
        ticket.value = await ticketService.escalate(ticket.value!.id);
        activity.value = await ticketService.activity(ticketId.value).catch(() => activity.value);
        toast.add({ severity: 'success', summary: t('tickets.detail.escalateDone'), life: 3000 });
      } catch (err) {
        toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
      } finally {
        escalating.value = false;
      }
    },
  });
}

// Canned responses → insert into reply box
function insertCanned(body: string) {
  replyText.value = replyText.value.trim() ? `${replyText.value}\n\n${body}` : body;
}

// CSAT
const csatRating = ref(0);
const csatComment = ref('');
const submittingCsat = ref(false);
async function submitCsat() {
  if (!ticket.value || !csatRating.value) return;
  submittingCsat.value = true;
  try {
    ticket.value = await ticketService.submitCsat(
      ticket.value.id,
      csatRating.value,
      csatComment.value.trim() || undefined,
    );
    toast.add({ severity: 'success', summary: t('csat.saved'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    submittingCsat.value = false;
  }
}

// Attachments
const detailFileInput = ref<HTMLInputElement | null>(null);
const uploadingFiles = ref(false);
function pickDetailFiles() {
  detailFileInput.value?.click();
}
async function onDetailFiles(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? []);
  if (detailFileInput.value) detailFileInput.value.value = '';
  if (!picked.length || !ticket.value) return;
  uploadingFiles.value = true;
  try {
    const created = await ticketService.uploadAttachments(ticket.value.id, picked);
    ticket.value.attachments = [...(ticket.value.attachments ?? []), ...created];
  } catch (err) {
    toast.add({ severity: 'error', summary: t('tickets.detail.uploadFailed'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    uploadingFiles.value = false;
  }
}
function onAttachmentDeleted(id: string) {
  if (ticket.value?.attachments) {
    ticket.value.attachments = ticket.value.attachments.filter((a) => a.id !== id);
  }
}

const ACTIVITY_ICON: Record<string, string> = {
  'ticket.created': 'pi pi-plus-circle',
  'ticket.status': 'pi pi-sync',
  'ticket.priority': 'pi pi-flag',
  'ticket.department': 'pi pi-sitemap',
  'ticket.assigned': 'pi pi-user-plus',
  'ticket.reply': 'pi pi-comment',
  'ticket.note': 'pi pi-lock',
  'ticket.escalated': 'pi pi-arrow-up',
  'ticket.deleted': 'pi pi-trash',
};
const activityLabel = (a: AuditEntry) => t(`activityActions.${a.action}`);
const activityIcon = (a: AuditEntry) => ACTIVITY_ICON[a.action] ?? 'pi pi-circle';

// ── Real-time ───────────────────────────────────────────────────────
const typists = computed(() =>
  realtime.typistsFor(ticketId.value).filter((u) => u.id !== auth.user?.id),
);
const viewers = computed(() =>
  realtime.viewersFor(ticketId.value).filter((u) => u.id !== auth.user?.id),
);
const typingText = computed(() => {
  const list = typists.value;
  if (!list.length) return '';
  if (list.length === 1) return t('realtime.typingOne', { name: list[0].fullName || list[0].email });
  return t('realtime.typingMany', { count: list.length });
});

function onLiveReply(p: { ticketId: string; reply: TicketReply }) {
  if (p.ticketId !== ticketId.value || !ticket.value) return;
  if (ticket.value.replies?.some((r) => r.id === p.reply.id)) return;
  ticket.value.replies = [...(ticket.value.replies ?? []), p.reply];
}
function onLiveUpdate(p: { ticket: { id: string } }) {
  if (p.ticket?.id === ticketId.value) load();
}
function subscribe() {
  realtime.subscribeTicket(ticketId.value);
}

let typingTimer: number | undefined;
function onReplyInput() {
  realtime.emitTyping(ticketId.value, true);
  clearTimeout(typingTimer);
  typingTimer = window.setTimeout(() => realtime.emitTyping(ticketId.value, false), 2000);
}
function stopTyping() {
  clearTimeout(typingTimer);
  realtime.emitTyping(ticketId.value, false);
}

onMounted(async () => {
  await load();
  subscribe();
  socket.on('connect', subscribe);
  socket.on('ticket:reply', onLiveReply);
  socket.on('ticket:updated', onLiveUpdate);
});

onUnmounted(() => {
  stopTyping();
  realtime.unsubscribeTicket(ticketId.value);
  socket.off('connect', subscribe);
  socket.off('ticket:reply', onLiveReply);
  socket.off('ticket:updated', onLiveUpdate);
});
</script>

<template>
  <Button :label="t('tickets.backToList')" icon="pi pi-arrow-left" text severity="secondary" @click="router.push('/tickets')" style="margin-bottom: 1rem" />

  <!-- Skeleton -->
  <div v-if="loading" class="detail-grid">
    <div>
      <Card><template #content>
        <Skeleton width="60%" height="1.6rem" style="margin-bottom: 1rem" />
        <Skeleton width="100%" height="1rem" style="margin-bottom: 0.5rem" />
        <Skeleton width="90%" height="1rem" style="margin-bottom: 0.5rem" />
        <Skeleton width="70%" height="1rem" />
      </template></Card>
    </div>
    <div><Card><template #content>
      <Skeleton width="100%" height="1rem" style="margin-bottom: 0.8rem" />
      <Skeleton width="100%" height="1rem" style="margin-bottom: 0.8rem" />
      <Skeleton width="80%" height="1rem" />
    </template></Card></div>
  </div>

  <Message v-else-if="loadError" severity="error" :closable="false">{{ loadError }}</Message>

  <div v-else-if="ticket" class="detail-grid">
    <!-- Left: ticket + conversation -->
    <div>
      <!-- Estimate banner for the requester while open -->
      <div v-if="estimate && isRequester" class="estimate-banner">
        <i class="pi pi-clock" />
        <div>
          <strong>{{ t('tickets.detail.estimate') }}</strong>
          <span>· {{ t('tickets.detail.estResponse') }}: ~{{ fmt(estimate.estFirstResponseMinutes) }}</span>
          <span>· {{ t('tickets.detail.estResolution') }}: ~{{ fmt(estimate.estResolutionMinutes) }}</span>
          <span class="muted">({{ estimate.basedOnHistory ? t('tickets.detail.basedOnHistory') : t('tickets.detail.basedOnSla') }}<template v-if="estimate.queueAhead > 0">, {{ t('tickets.detail.queueAhead', { n: estimate.queueAhead }) }}</template>)</span>
        </div>
      </div>

      <Card class="ticket-main" :class="{ 'high-banner': ticket.priority === 'high' || ticket.escalated }">
        <template #title>
          <div class="ticket-title-row">
            <span>{{ ticket.subject }}</span>
            <div class="title-tags">
              <PriorityTag :priority="ticket.priority" />
              <StatusTag :status="ticket.status" />
              <SlaBadge :ticket="ticket" />
            </div>
          </div>
        </template>
        <template #content>
          <p class="ticket-message">{{ ticket.message }}</p>
        </template>
      </Card>

      <!-- CSAT (requester rates a closed ticket) -->
      <Card v-if="ticket.status === 'closed' && isRequester" class="csat-card">
        <template #content>
          <div v-if="ticket.csatRating" class="csat-done">
            <i class="pi pi-check-circle" />
            <span>{{ t('csat.thanks') }}</span>
            <Rating :modelValue="ticket.csatRating" readonly :stars="5" />
          </div>
          <div v-else>
            <div class="csat-title">{{ t('csat.title') }}</div>
            <p class="muted" style="margin: 0.2rem 0 0.7rem; font-size: 0.86rem">{{ t('csat.subtitle') }}</p>
            <Rating v-model="csatRating" :stars="5" />
            <template v-if="csatRating">
              <Textarea v-model="csatComment" rows="2" class="full-width" :placeholder="t('csat.comment')" style="margin-top: 0.7rem" />
              <div style="margin-top: 0.7rem">
                <Button :label="t('csat.submit')" icon="pi pi-send" size="small" :loading="submittingCsat" @click="submitCsat" />
              </div>
            </template>
          </div>
        </template>
      </Card>

      <!-- Attachments -->
      <div class="att-section">
        <div class="att-section-head">
          <h3 class="section-title" style="margin: 0">
            <i class="pi pi-paperclip" /> {{ t('tickets.detail.attachments') }}
            <span v-if="ticket.attachments?.length" class="muted">({{ ticket.attachments.length }})</span>
          </h3>
          <Button
            :label="t('tickets.detail.addFiles')"
            icon="pi pi-plus"
            text
            size="small"
            :loading="uploadingFiles"
            @click="pickDetailFiles"
          />
          <input
            ref="detailFileInput"
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
            style="display: none"
            @change="onDetailFiles"
          />
        </div>
        <AttachmentList
          v-if="ticket.attachments?.length"
          :attachments="ticket.attachments"
          @deleted="onAttachmentDeleted"
        />
        <p v-else class="muted" style="font-size: 0.84rem; margin: 0">
          {{ t('tickets.detail.attachHint', { mb: 10 }) }}
        </p>
      </div>

      <h3 class="section-title">
        <i class="pi pi-comments" /> {{ t('tickets.detail.conversation') }}
        <Tag :value="String(ticket.replies?.length ?? 0)" rounded severity="secondary" />
        <span v-if="viewers.length" class="presence" v-tooltip.bottom="viewers.map(v => v.fullName || v.email).join(', ')">
          <Avatar
            v-for="v in viewers.slice(0, 3)"
            :key="v.id"
            :label="initials(v.fullName, v.email)"
            shape="circle"
            size="normal"
            class="avatar-brand presence-avatar"
          />
          <span class="presence-label">
            {{ viewers.length === 1 ? t('realtime.viewing') : t('realtime.viewingMany', { count: viewers.length }) }}
          </span>
        </span>
      </h3>

      <div v-if="ticket.replies && ticket.replies.length" class="reply-list">
        <div
          v-for="reply in ticket.replies"
          :key="reply.id"
          class="reply-item"
          :class="{ 'is-admin': reply.author.role !== 'user' && !reply.isInternal, 'is-internal': reply.isInternal }"
        >
          <div class="reply-head">
            <span class="reply-author">
              <Avatar :label="initials(reply.author.fullName, reply.author.email)" shape="circle" class="avatar-brand" />
              {{ reply.author.fullName || reply.author.email }}
              <Tag v-if="reply.isInternal" :value="t('tickets.detail.internalBadge')" severity="warn" icon="pi pi-lock" rounded />
              <Tag v-else-if="reply.author.role !== 'user'" :value="t('tickets.detail.supportTeam')" severity="info" rounded />
            </span>
            <span class="muted">{{ formatDateTime(reply.createdAt, ui.locale) }}</span>
          </div>
          <div class="reply-body">{{ reply.message }}</div>
        </div>
      </div>
      <p v-else class="muted" style="padding: 0.5rem 0 1rem">{{ t('tickets.detail.noReplies') }}</p>

      <transition name="fade-slide">
        <div v-if="typingText" class="typing-indicator">
          <span class="typing-dots"><span /><span /><span /></span>
          {{ typingText }}
        </div>
      </transition>

      <Card class="reply-form-card">
        <template #content>
          <label class="reply-label">{{ auth.isStaff ? t('tickets.detail.addReplyStaff') : t('tickets.detail.addReply') }}</label>
          <Textarea v-model="replyText" rows="3" autoResize class="full-width" :placeholder="t('tickets.detail.replyPlaceholder')" maxlength="5000" @input="onReplyInput" @blur="stopTyping" />
          <div class="reply-form-actions">
            <div class="reply-left">
              <CannedMenu v-if="auth.isStaff" @insert="insertCanned" />
              <label v-if="auth.isStaff" class="internal-toggle">
                <ToggleSwitch v-model="replyInternal" />
                <span>{{ t('tickets.detail.internalNote') }}</span>
              </label>
            </div>
            <Button :label="t('tickets.detail.sendReply')" icon="pi pi-send" :loading="sendingReply" :disabled="replyText.trim().length === 0" @click="sendReply" />
          </div>
        </template>
      </Card>
    </div>

    <!-- Right: meta + actions -->
    <div class="detail-side">
      <Card>
        <template #title>{{ t('tickets.detail.information') }}</template>
        <template #content>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.status') }}</span><StatusTag :status="ticket.status" /></div>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.priority') }}</span><PriorityTag :priority="ticket.priority" /></div>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.department') }}</span>
            <Tag v-if="ticket.department" :value="ticket.department.name" severity="secondary" icon="pi pi-sitemap" />
            <span v-else class="muted">—</span>
          </div>
          <div v-if="ticket.category" class="meta-row"><span class="meta-key">{{ t('tickets.fields.category') }}</span><span>{{ ticket.category }}</span></div>
          <div v-if="ticket.tags?.length" class="meta-row" style="align-items: flex-start">
            <span class="meta-key">{{ t('tickets.fields.tags') }}</span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem; justify-content: flex-end">
              <Tag v-for="tg in ticket.tags" :key="tg" :value="tg" severity="secondary" rounded />
            </div>
          </div>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.requester') }}</span><span>{{ ticket.user?.fullName || ticket.user?.email || '—' }}</span></div>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.createdAt') }}</span><span>{{ formatDateTime(ticket.createdAt, ui.locale) }}</span></div>
          <div class="meta-row"><span class="meta-key">{{ t('tickets.fields.updatedAt') }}</span><span>{{ formatDateTime(ticket.updatedAt, ui.locale) }}</span></div>

          <div class="meta-row" style="align-items: flex-start">
            <span class="meta-key">{{ t('tickets.fields.assignees') }}</span>
            <div v-if="ticket.assignees?.length" style="display: flex; flex-wrap: wrap; gap: 0.3rem; justify-content: flex-end">
              <Tag v-for="a in ticket.assignees" :key="a.id" :value="a.user.fullName || a.user.email" icon="pi pi-user" />
            </div>
            <span v-else class="muted">{{ t('common.unassigned') }}</span>
          </div>

          <div v-if="ticket.sla" class="meta-row">
            <span class="meta-key">{{ t('sla.age') }}</span>
            <span>{{ fmt(ticket.sla.ageMinutes) }}</span>
          </div>
          <div v-if="ticket.sla && ticket.status !== 'closed'" class="meta-row">
            <span class="meta-key">{{ t('sla.resolutionDue') }}</span>
            <span :class="{ 'sla-over': (ticket.sla.resolutionRemainingMinutes ?? 0) < 0 }">
              {{ (ticket.sla.resolutionRemainingMinutes ?? 0) >= 0
                ? t('sla.remaining', { n: fmt(ticket.sla.resolutionRemainingMinutes) })
                : t('sla.overBy', { n: fmt(ticket.sla.resolutionRemainingMinutes) }) }}
            </span>
          </div>

          <Button
            v-if="canEscalate"
            :label="t('tickets.detail.escalate')"
            icon="pi pi-arrow-up"
            severity="danger"
            outlined
            size="small"
            class="full-width"
            style="margin-top: 0.9rem"
            :loading="escalating"
            @click="escalate"
          />
        </template>
      </Card>

      <!-- Activity timeline -->
      <Card v-if="activity.length" style="margin-top: 1rem">
        <template #title>{{ t('tickets.detail.activity') }}</template>
        <template #content>
          <ul class="timeline">
            <li v-for="a in activity" :key="a.id" class="timeline-item">
              <span class="timeline-icon"><i :class="activityIcon(a)" /></span>
              <div class="timeline-body">
                <div class="timeline-label">{{ activityLabel(a) }}</div>
                <div class="timeline-meta">
                  <span v-if="a.actorName">{{ a.actorName }} · </span>{{ formatDateTime(a.createdAt, ui.locale) }}
                </div>
              </div>
            </li>
          </ul>
        </template>
      </Card>

      <!-- Staff controls -->
      <Card v-if="auth.isStaff" style="margin-top: 1rem">
        <template #title>{{ t('tickets.detail.assignManage') }}</template>
        <template #content>
          <label class="reply-label">{{ t('tickets.detail.changeStatus') }}</label>
          <Select :modelValue="ticket.status" :options="statusOptions" optionLabel="label" optionValue="value" class="full-width" :loading="statusUpdating" @update:modelValue="changeStatus" />

          <template v-if="ticket.departmentId">
            <label class="reply-label" style="margin-top: 1rem">{{ t('tickets.fields.assignees') }}</label>
            <MultiSelect v-model="assigneeDraft" :options="assigneeOptions" optionLabel="label" optionValue="value" :placeholder="t('tickets.placeholders.assignees')" display="chip" class="full-width" :disabled="!assigneeOptions.length" />
            <Button :label="t('common.save')" icon="pi pi-check" size="small" :loading="assigning" style="margin-top: 0.75rem" @click="saveAssignees" />
          </template>
        </template>
      </Card>

      <Button
        v-if="canReopen"
        :label="t('tickets.detail.reopen')"
        icon="pi pi-replay"
        severity="warn"
        class="full-width"
        :loading="reopening"
        style="margin-top: 1rem"
        @click="reopen"
      />

      <div class="detail-actions">
        <Button :label="t('common.edit')" icon="pi pi-pencil" outlined @click="dialogVisible = true" />
        <Button v-if="canDelete" :label="t('common.delete')" icon="pi pi-trash" severity="danger" outlined @click="confirmDelete" />
      </div>
    </div>
  </div>

  <TicketFormDialog v-if="ticket" v-model:visible="dialogVisible" :ticket="ticket" :canEditStatus="true" @saved="load" />
</template>

<style scoped>
.ticket-main {
  margin-bottom: 1.5rem;
}
.ticket-main.high-banner {
  border-left: 4px solid #ef4444;
}
.ticket-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.title-tags {
  display: flex;
  gap: 0.5rem;
}
.ticket-message {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--text);
  margin: 0;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  margin: 1.5rem 0 1rem;
  color: var(--text);
}
.att-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
}
.att-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.presence {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.presence-avatar {
  width: 26px !important;
  height: 26px !important;
  font-size: 0.7rem !important;
  border: 2px solid var(--surface);
  margin-left: -8px;
}
.presence-avatar:first-child {
  margin-left: 0;
}
.presence-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 0.3rem;
}
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: 0.4rem 0.2rem 0;
  font-style: italic;
}
.typing-dots {
  display: inline-flex;
  gap: 3px;
}
.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing-dots span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing-dots span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
.reply-form-card {
  margin-top: 1.25rem;
}
.reply-label {
  display: block;
  font-weight: 600;
  font-size: 0.88rem;
  margin-bottom: 0.5rem;
  color: var(--text);
}
.reply-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.75rem;
}
.internal-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  cursor: pointer;
}
.reply-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.csat-card {
  margin-bottom: 1.5rem;
  border-left: 4px solid #f59e0b;
}
.csat-title {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text);
}
.csat-done {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  color: var(--text);
}
.csat-done i {
  color: #16a34a;
  font-size: 1.3rem;
}
.detail-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1.25rem;
}
.detail-actions .p-button {
  flex: 1;
}
.estimate-banner {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: color-mix(in srgb, var(--brand) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--brand) 25%, transparent);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
  font-size: 0.88rem;
}
.estimate-banner i {
  font-size: 1.2rem;
  color: var(--brand);
}
.estimate-banner span {
  margin-left: 0.35rem;
}
.sla-over {
  color: #dc2626;
  font-weight: 600;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.timeline-item {
  display: flex;
  gap: 0.7rem;
  padding-bottom: 1rem;
  position: relative;
}
.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 26px;
  bottom: 0;
  width: 2px;
  background: var(--border);
}
.timeline-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--brand) 12%, var(--surface));
  color: var(--brand);
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  flex-shrink: 0;
  z-index: 1;
}
.timeline-label {
  font-weight: 600;
  font-size: 0.88rem;
}
.timeline-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}
</style>
