<script setup lang="ts">
import { reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { extractErrorMessage } from '@/services/api';
import BrandLogo from '@/components/BrandLogo.vue';

const auth = useAuthStore();
const ui = useUiStore();
const { t } = useI18n();

const form = reactive({ email: '' });
const error = ref('');
const sent = ref(false);
const loading = ref(false);

async function submit() {
  error.value = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    error.value = t('auth.errors.email');
    return;
  }
  loading.value = true;
  try {
    await auth.forgotPassword(form.email.trim());
    sent.value = true;
  } catch (err) {
    error.value = extractErrorMessage(err, t('errors.generic'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-top">
        <Button
          :icon="ui.isDark ? 'pi pi-sun' : 'pi pi-moon'"
          text
          rounded
          severity="secondary"
          @click="ui.toggleTheme()"
        />
        <Button text rounded severity="secondary" @click="ui.toggleLocale()">
          <span style="font-weight: 700; font-size: 0.82rem">{{ ui.locale === 'tr' ? 'TR' : 'EN' }}</span>
        </Button>
      </div>

      <div class="auth-brand">
        <BrandLogo :size="44" /><span>{{ t('app.name') }}</span>
      </div>
      <p class="auth-subtitle">{{ t('auth.forgotTitle') }}</p>

      <Message v-if="sent" severity="success" :closable="false" class="full-width" style="margin-bottom: 1rem">
        {{ t('auth.forgotSent') }}
      </Message>

      <template v-else>
        <p class="muted" style="margin: -0.5rem 0 1.25rem; font-size: 0.9rem">{{ t('auth.forgotSubtitle') }}</p>
        <Message v-if="error" severity="error" :closable="false" class="full-width" style="margin-bottom: 1rem">{{
          error
        }}</Message>
        <form @submit.prevent="submit">
          <div class="field">
            <label for="email">{{ t('auth.email') }}</label>
            <InputText
              id="email"
              v-model="form.email"
              type="email"
              :placeholder="t('auth.emailPlaceholder')"
              class="full-width"
            />
          </div>
          <Button
            type="submit"
            :label="t('auth.forgotSubmit')"
            icon="pi pi-send"
            class="full-width"
            :loading="loading"
            style="margin-top: 0.5rem"
          />
        </form>
      </template>

      <p class="auth-footer">
        <RouterLink to="/login"
          ><i class="pi pi-arrow-left" style="font-size: 0.75rem" /> {{ t('auth.backToLogin') }}</RouterLink
        >
      </p>
    </div>
  </div>
</template>
