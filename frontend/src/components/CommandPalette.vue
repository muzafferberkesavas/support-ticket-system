<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/stores/auth';
import type { Ticket } from '@/types';

const router = useRouter();
const { t } = useI18n();
const auth = useAuthStore();

const open = ref(false);
const query = ref('');
const results = ref<Ticket[]>([]);
const inputRef = ref();
let timer: number | undefined;

interface NavItem {
  label: string;
  icon: string;
  to: string;
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [];
  if (auth.isStaff) items.push({ label: t('dashboard.title'), icon: 'pi pi-th-large', to: '/dashboard' });
  items.push({ label: t('nav.tickets'), icon: 'pi pi-ticket', to: '/tickets' });
  items.push({ label: t('notifications.nav'), icon: 'pi pi-bell', to: '/notifications' });
  if (auth.isManager) items.push({ label: t('nav.analytics'), icon: 'pi pi-chart-bar', to: '/analytics' });
  if (auth.isAdmin) {
    items.push({ label: t('nav.departments'), icon: 'pi pi-sitemap', to: '/departments' });
    items.push({ label: t('nav.users'), icon: 'pi pi-users', to: '/users' });
    items.push({ label: t('nav.settings'), icon: 'pi pi-cog', to: '/settings' });
  }
  items.push({ label: t('profile.title'), icon: 'pi pi-user', to: '/profile' });

  const q = query.value.trim().toLowerCase();
  return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
});

function toggle() {
  open.value = !open.value;
  if (open.value) {
    query.value = '';
    results.value = [];
    setTimeout(() => inputRef.value?.$el?.focus?.(), 120);
  }
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggle();
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

watch(query, () => {
  clearTimeout(timer);
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }
  timer = window.setTimeout(async () => {
    results.value = await ticketService
      .list({ search: q })
      .then((r) => r.slice(0, 6))
      .catch(() => []);
  }, 250);
});

function go(to: string) {
  open.value = false;
  router.push(to);
}
function openTicket(id: string) {
  open.value = false;
  router.push(`/tickets/${id}`);
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

defineExpose({ toggle });
</script>

<template>
  <Dialog
    v-model:visible="open"
    modal
    :showHeader="false"
    :dismissableMask="true"
    :style="{ width: '560px' }"
    contentClass="cmd-content"
    position="top"
  >
    <IconField class="cmd-search">
      <InputIcon class="pi pi-search" />
      <InputText ref="inputRef" v-model="query" :placeholder="t('cmd.placeholder')" class="full-width" />
    </IconField>

    <div class="cmd-results">
      <template v-if="results.length">
        <div class="cmd-section">{{ t('cmd.tickets') }}</div>
        <button v-for="tk in results" :key="tk.id" class="cmd-item" @click="openTicket(tk.id)">
          <i class="pi pi-ticket" />
          <span class="cmd-label">{{ tk.subject }}</span>
        </button>
      </template>

      <div class="cmd-section">{{ t('cmd.navigation') }}</div>
      <button v-for="n in navItems" :key="n.to" class="cmd-item" @click="go(n.to)">
        <i :class="n.icon" />
        <span class="cmd-label">{{ n.label }}</span>
      </button>

      <div v-if="query && !results.length && !navItems.length" class="cmd-empty">
        {{ t('cmd.noResults') }}
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.cmd-search :deep(.p-inputtext) {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  font-size: 1.05rem;
  padding: 0.9rem 0.9rem 0.9rem 2.4rem;
}
.cmd-search :deep(.p-inputtext:focus) {
  box-shadow: none;
}
.cmd-results {
  max-height: 360px;
  overflow-y: auto;
  padding: 0.4rem;
}
.cmd-section {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 0.6rem 0.6rem 0.3rem;
  font-weight: 700;
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  cursor: pointer;
  font: inherit;
  color: var(--text);
}
.cmd-item:hover {
  background: var(--surface-hover);
}
.cmd-item i {
  color: var(--brand);
  width: 18px;
  text-align: center;
}
.cmd-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmd-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
}
</style>
