<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

const router = useRouter();
const { t } = useI18n();
</script>

<template>
  <div class="empty-state" style="padding-top: 5rem">
    <i class="pi pi-compass" style="font-size: 3.5rem" />
    <h2 style="margin: 0.5rem 0; color: var(--text)">404 — {{ t('errors.notFound') }}</h2>
    <p>{{ t('errors.notFoundDesc') }}</p>
    <Button :label="t('errors.goHome')" icon="pi pi-home" @click="router.push('/tickets')" />
  </div>
</template>
