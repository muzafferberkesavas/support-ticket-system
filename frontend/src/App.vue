<script setup lang="ts">
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import AppLayout from '@/layouts/AppLayout.vue';
import RealtimeBridge from '@/components/RealtimeBridge.vue';

const route = useRoute();
// Auth pages + forced password change render full-screen without the app chrome.
const isBareLayout = computed(() => route.meta.guestOnly === true || route.meta.fullScreen === true);
</script>

<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <RealtimeBridge />

  <RouterView v-if="isBareLayout" v-slot="{ Component }">
    <transition name="fade-slide" mode="out-in">
      <div :key="route.path" class="route-wrap">
        <component :is="Component" />
      </div>
    </transition>
  </RouterView>

  <AppLayout v-else>
    <RouterView v-slot="{ Component }">
      <transition name="fade-slide" mode="out-in">
        <div :key="route.path" class="route-wrap">
          <component :is="Component" />
        </div>
      </transition>
    </RouterView>
  </AppLayout>
</template>
