<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import { useOperationsStore } from '@/stores/operations';
import { socketConnected, connectSocket } from '@/services/socket';
import { extractErrorMessage } from '@/services/api';

const { t, te } = useI18n();
const ops = useOperationsStore();
const loadError = ref('');

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
