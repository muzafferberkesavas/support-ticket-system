<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { useNotificationStore } from '@/stores/notifications';
import { useUiStore } from '@/stores/ui';
import { formatDateTime } from '@/constants';
import type { AppNotification, NotificationType } from '@/types';

const notifications = useNotificationStore();
const ui = useUiStore();
const router = useRouter();
const { t } = useI18n();

const TEXT: Record<NotificationType, [string, string]> = {
  reply: ['notif.replyTitle', 'notif.replyBody'],
  created: ['notif.createdTitle', 'notif.createdBody'],
  assigned: ['notif.assignedTitle', 'notif.assignedBody'],
  status: ['notif.statusTitle', 'notif.statusBody'],
};
const ICON: Record<NotificationType, string> = {
  reply: 'pi pi-comment',
  created: 'pi pi-ticket',
  assigned: 'pi pi-user-plus',
  status: 'pi pi-sync',
};

function title(n: AppNotification) {
  return t(TEXT[n.type]?.[0] ?? 'notif.replyTitle');
}
function body(n: AppNotification) {
  return t(TEXT[n.type]?.[1] ?? 'notif.replyBody', { actor: n.actor ?? '', subject: n.ticketSubject });
}

async function open(n: AppNotification) {
  await notifications.markRead(n.id);
  if (n.ticketId) router.push(`/tickets/${n.ticketId}`);
}

const hasUnread = computed(() => notifications.unreadCount > 0);

onMounted(() => {
  if (!notifications.loaded) notifications.load().catch(() => {});
});
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('notifications.title') }}</h1>
      <p class="page-subtitle">{{ t('notifications.subtitle') }}</p>
    </div>
    <Button
      v-if="hasUnread"
      :label="t('notifications.markAllRead')"
      icon="pi pi-check-circle"
      outlined
      @click="notifications.markAllRead()"
    />
  </div>

  <div v-if="!notifications.items.length" class="empty-state">
    <i class="pi pi-bell" />
    <p>{{ t('notifications.empty') }}</p>
  </div>

  <div v-else class="notif-list">
    <button
      v-for="n in notifications.items"
      :key="n.id"
      class="notif-row"
      :class="{ unread: !n.read }"
      @click="open(n)"
    >
      <span class="notif-icon" :class="n.type"><i :class="ICON[n.type]" /></span>
      <div class="notif-main">
        <div class="notif-title">{{ title(n) }}<span v-if="!n.read" class="dot" /></div>
        <div class="notif-body">{{ body(n) }}</div>
        <div class="notif-time">{{ formatDateTime(n.createdAt, ui.locale) }}</div>
      </div>
      <i class="pi pi-chevron-right notif-arrow" />
    </button>
  </div>
</template>

<style scoped>
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.notif-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  text-align: left;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1.1rem;
  cursor: pointer;
  font: inherit;
  color: var(--text);
  transition:
    background 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.notif-row:hover {
  background: var(--surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.notif-row.unread {
  border-color: color-mix(in srgb, var(--brand) 40%, transparent);
  background: color-mix(in srgb, var(--brand) 6%, var(--surface));
}
.notif-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
}
.notif-icon.reply {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
}
.notif-icon.assigned {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
}
.notif-icon.status {
  background: rgba(124, 58, 237, 0.12);
  color: #7c3aed;
}
.notif-main {
  flex: 1;
  min-width: 0;
}
.notif-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.notif-title .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
}
.notif-body {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0.1rem 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notif-time {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.notif-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
