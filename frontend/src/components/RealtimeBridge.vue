<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Toast from 'primevue/toast';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';
import { useNotificationStore } from '@/stores/notifications';
import { socket, connectSocket, disconnectSocket } from '@/services/socket';
import type { AppNotification } from '@/types';

type NotificationPayload = AppNotification;

const auth = useAuthStore();
const realtime = useRealtimeStore();
const notifications = useNotificationStore();
const toast = useToast();
const router = useRouter();
const { t } = useI18n();

const TEXT: Record<NotificationPayload['type'], [string, string]> = {
  reply: ['notif.replyTitle', 'notif.replyBody'],
  created: ['notif.createdTitle', 'notif.createdBody'],
  assigned: ['notif.assignedTitle', 'notif.assignedBody'],
  status: ['notif.statusTitle', 'notif.statusBody'],
};

function onNotification(n: NotificationPayload) {
  notifications.prepend(n);
  const [titleKey, bodyKey] = TEXT[n.type] ?? TEXT.reply;
  toast.add({
    severity: 'info',
    group: 'realtime',
    summary: t(titleKey),
    detail: t(bodyKey, { actor: n.actor ?? '', subject: n.ticketSubject ?? '' }),
    life: 6000,
    // carry the ticket id so the toast can deep-link
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ticketId: n.ticketId } as any,
  });
}

function start() {
  connectSocket();
  realtime.bind();
  notifications.load().catch(() => {});
  socket.off('notification', onNotification);
  socket.on('notification', onNotification);
}

onMounted(() => {
  if (auth.isAuthenticated) start();
});

watch(
  () => auth.token,
  (tok) => {
    if (tok) start();
    else {
      socket.off('notification', onNotification);
      notifications.reset();
      disconnectSocket();
    }
  },
);

onUnmounted(() => socket.off('notification', onNotification));

function view(data: { ticketId?: string } | undefined) {
  if (data?.ticketId) router.push(`/tickets/${data.ticketId}`);
  toast.removeGroup('realtime');
}
</script>

<template>
  <Toast group="realtime" position="bottom-right">
    <template #message="{ message }">
      <div class="rt-toast">
        <i class="pi pi-bell rt-icon" />
        <div class="rt-content">
          <div class="rt-title">{{ message.summary }}</div>
          <div class="rt-detail">{{ message.detail }}</div>
          <Button :label="t('common.details')" icon="pi pi-arrow-right" size="small" text @click="view(message.data)" />
        </div>
      </div>
    </template>
  </Toast>
</template>

<style scoped>
.rt-toast {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
}
.rt-icon {
  font-size: 1.2rem;
  color: var(--brand);
  margin-top: 0.15rem;
}
.rt-title {
  font-weight: 700;
  margin-bottom: 0.15rem;
}
.rt-detail {
  font-size: 0.88rem;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}
</style>
