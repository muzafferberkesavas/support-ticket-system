<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useNotificationStore } from '@/stores/notifications';
import { socketConnected } from '@/services/socket';
import { initials, formatDateTime } from '@/constants';
import { useNotificationText } from '@/composables/useNotificationText';
import BrandLogo from '@/components/BrandLogo.vue';
import RoleTag from '@/components/RoleTag.vue';
import type { AppNotification } from '@/types';

const auth = useAuthStore();
const ui = useUiStore();
const notifications = useNotificationStore();
const notifText = useNotificationText();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const sidebarOpen = ref(false);
const userMenu = ref();
const notifPanel = ref();

const recentNotifications = computed(() => notifications.items.slice(0, 6));

function openNotif(event: Event) {
  notifPanel.value.toggle(event);
}
function goNotification(n: AppNotification) {
  notifications.markRead(n.id);
  notifPanel.value?.hide();
  if (n.ticketId) router.push(`/tickets/${n.ticketId}`);
}

interface NavLink {
  key: string;
  label: string;
  icon: string;
  to: string;
  show: boolean;
}

const mainLinks = computed<NavLink[]>(() => [
  { key: 'tickets', label: t('nav.tickets'), icon: 'pi pi-ticket', to: '/tickets', show: true },
  {
    key: 'notifications',
    label: t('notifications.nav'),
    icon: 'pi pi-bell',
    to: '/notifications',
    show: true,
  },
]);

const adminLinks = computed<NavLink[]>(() => [
  {
    key: 'analytics',
    label: t('nav.analytics'),
    icon: 'pi pi-chart-bar',
    to: '/analytics',
    show: auth.isManager,
  },
  {
    key: 'departments',
    label: t('nav.departments'),
    icon: 'pi pi-sitemap',
    to: '/departments',
    show: auth.isAdmin,
  },
  { key: 'users', label: t('nav.users'), icon: 'pi pi-users', to: '/users', show: auth.isAdmin },
]);

const showAdminSection = computed(() => adminLinks.value.some((l) => l.show));

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/');
}

function go(to: string) {
  sidebarOpen.value = false;
  router.push(to);
}

const userMenuItems = computed(() => [
  {
    label: ui.isDark ? t('theme.light') : t('theme.dark'),
    icon: ui.isDark ? 'pi pi-sun' : 'pi pi-moon',
    command: () => ui.toggleTheme(),
  },
  {
    label: ui.locale === 'tr' ? 'English' : 'Türkçe',
    icon: 'pi pi-globe',
    command: () => ui.toggleLocale(),
  },
  { separator: true },
  { label: t('nav.logout'), icon: 'pi pi-sign-out', command: logout },
]);

async function logout() {
  auth.logout();
  sidebarOpen.value = false;
  try {
    await router.replace({ name: 'login' });
  } catch {
    window.location.assign('/login');
  }
}
</script>

<template>
  <div class="app-shell">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-brand" @click="go('/tickets')">
        <BrandLogo :size="34" />
        <span>{{ t('app.name') }}</span>
      </div>

      <nav class="sidebar-nav">
        <template v-for="link in mainLinks" :key="link.key">
          <div v-if="link.show" class="nav-item" :class="{ active: isActive(link.to) }" @click="go(link.to)">
            <i :class="link.icon" />
            <span>{{ link.label }}</span>
          </div>
        </template>

        <template v-if="showAdminSection">
          <div class="sidebar-section">{{ t('nav.dashboard') }}</div>
          <template v-for="link in adminLinks" :key="link.key">
            <div
              v-if="link.show"
              class="nav-item"
              :class="{ active: isActive(link.to) }"
              @click="go(link.to)"
            >
              <i :class="link.icon" />
              <span>{{ link.label }}</span>
            </div>
          </template>
        </template>
      </nav>

      <div class="sidebar-footer">
        <Avatar :label="initials(auth.user?.fullName, auth.user?.email)" shape="circle" class="avatar-brand" />
        <div style="min-width: 0; flex: 1">
          <div style="font-weight: 600; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            {{ auth.displayName }}
          </div>
          <RoleTag v-if="auth.user" :role="auth.user.role" />
        </div>
      </div>
    </aside>

    <div class="sidebar-backdrop" :class="{ show: sidebarOpen }" @click="sidebarOpen = false" />

    <!-- Content -->
    <div class="app-content">
      <header class="topbar">
        <div class="topbar-left">
          <Button
            class="menu-toggle"
            icon="pi pi-bars"
            text
            rounded
            severity="secondary"
            @click="sidebarOpen = !sidebarOpen"
          />
          <BrandLogo class="topbar-logo" :size="28" :animated="false" />
        </div>
        <div class="topbar-actions">
          <span
            class="conn-dot"
            :class="{ online: socketConnected }"
            v-tooltip.bottom="socketConnected ? t('realtime.online') : t('realtime.offline')"
          />

          <button class="bell-btn" @click="openNotif" v-tooltip.bottom="t('notifications.nav')">
            <i class="pi pi-bell" />
            <span v-if="notifications.unreadCount" class="bell-badge">
              {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
            </span>
          </button>

          <Popover ref="notifPanel" class="notif-popover">
            <div class="notif-pop">
              <div class="notif-pop-head">
                <strong>{{ t('notifications.title') }}</strong>
                <Button
                  v-if="notifications.unreadCount"
                  :label="t('notifications.markAllRead')"
                  text
                  size="small"
                  @click="notifications.markAllRead()"
                />
              </div>
              <div v-if="!recentNotifications.length" class="notif-pop-empty">
                <i class="pi pi-bell" />
                <p>{{ t('notifications.empty') }}</p>
              </div>
              <button
                v-for="n in recentNotifications"
                :key="n.id"
                class="notif-pop-item"
                :class="{ unread: !n.read }"
                @click="goNotification(n)"
              >
                <i :class="notifText.icon(n)" class="notif-pop-icon" />
                <div class="notif-pop-main">
                  <div class="notif-pop-title">{{ notifText.title(n) }}</div>
                  <div class="notif-pop-body">{{ notifText.body(n) }}</div>
                  <div class="notif-pop-time">{{ formatDateTime(n.createdAt, ui.locale) }}</div>
                </div>
              </button>
              <div class="notif-pop-foot">
                <Button :label="t('notifications.viewAll')" text size="small" @click="notifPanel.hide(); go('/notifications')" />
              </div>
            </div>
          </Popover>

          <Button
            :icon="ui.isDark ? 'pi pi-sun' : 'pi pi-moon'"
            text
            rounded
            severity="secondary"
            v-tooltip.bottom="ui.isDark ? t('theme.light') : t('theme.dark')"
            @click="ui.toggleTheme()"
          />
          <Button
            text
            rounded
            severity="secondary"
            class="lang-btn"
            v-tooltip.bottom="ui.locale === 'tr' ? 'English' : 'Türkçe'"
            @click="ui.toggleLocale()"
          >
            <span class="lang-label">{{ ui.locale === 'tr' ? 'TR' : 'EN' }}</span>
          </Button>
          <Button
            text
            rounded
            severity="secondary"
            aria-haspopup="true"
            @click="userMenu.toggle($event)"
          >
            <Avatar
              :label="initials(auth.user?.fullName, auth.user?.email)"
              shape="circle"
              size="normal"
              class="avatar-brand"
            />
          </Button>
          <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
        </div>
      </header>

      <main class="app-main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.topbar-logo {
  display: none;
}
.lang-label {
  font-weight: 700;
  font-size: 0.82rem;
}
.conn-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #9ca3af;
  box-shadow: 0 0 0 3px color-mix(in srgb, #9ca3af 25%, transparent);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}
.conn-dot.online {
  background: #22c55e;
  box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 30%, transparent);
  animation: pulse-dot 2s infinite;
}
.bell-btn {
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  transition: background 0.15s ease, color 0.15s ease;
}
.bell-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.bell-btn i {
  font-size: 1.1rem;
}
.bell-badge {
  position: absolute;
  top: 3px;
  right: 2px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 0.66rem;
  font-weight: 700;
  display: grid;
  place-items: center;
  border: 2px solid var(--surface);
}
.notif-pop {
  width: 340px;
  max-width: 86vw;
}
.notif-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.2rem 0.2rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.notif-pop-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 1.5rem 0;
}
.notif-pop-empty i {
  font-size: 1.8rem;
  opacity: 0.4;
  display: block;
  margin-bottom: 0.4rem;
}
.notif-pop-item {
  display: flex;
  gap: 0.6rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 0.7rem 0.3rem;
  cursor: pointer;
  font: inherit;
  color: var(--text);
}
.notif-pop-item:hover {
  background: var(--surface-hover);
}
.notif-pop-item.unread {
  background: color-mix(in srgb, var(--brand) 6%, transparent);
}
.notif-pop-icon {
  color: var(--brand);
  margin-top: 0.2rem;
}
.notif-pop-main {
  min-width: 0;
  flex: 1;
}
.notif-pop-title {
  font-weight: 600;
  font-size: 0.88rem;
}
.notif-pop-body {
  color: var(--text-muted);
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notif-pop-time {
  color: var(--text-muted);
  font-size: 0.74rem;
  margin-top: 0.1rem;
}
.notif-pop-foot {
  text-align: center;
  padding-top: 0.4rem;
}
@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 30%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px color-mix(in srgb, #22c55e 12%, transparent);
  }
}
@media (max-width: 860px) {
  .topbar-logo {
    display: inline-flex;
  }
}
</style>
