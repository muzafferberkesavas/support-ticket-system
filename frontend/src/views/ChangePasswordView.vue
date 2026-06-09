<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { extractErrorMessage } from '@/services/api';
import BrandLogo from '@/components/BrandLogo.vue';

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const toast = useToast();
const { t } = useI18n();

const form = reactive({ current: '', password: '', confirm: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const loading = ref(false);

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (!form.current) errors.current = t('auth.errors.passwordRequired');
  if (form.password.length < 6) errors.password = t('auth.errors.passwordMin');
  if (form.confirm !== form.password) errors.confirm = t('auth.errors.passwordMatch');
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate()) return;
  loading.value = true;
  serverError.value = '';
  try {
    await auth.changePassword(form.current, form.password);
    toast.add({ severity: 'success', summary: t('auth.changeSuccess'), life: 3000 });
    router.push('/tickets');
  } catch (err) {
    serverError.value = extractErrorMessage(err, t('auth.errors.changeFailed'));
  } finally {
    loading.value = false;
  }
}

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-top">
        <Button :icon="ui.isDark ? 'pi pi-sun' : 'pi pi-moon'" text rounded severity="secondary" @click="ui.toggleTheme()" />
        <Button text rounded severity="secondary" @click="ui.toggleLocale()">
          <span style="font-weight: 700; font-size: 0.82rem">{{ ui.locale === 'tr' ? 'TR' : 'EN' }}</span>
        </Button>
      </div>

      <div class="auth-brand"><BrandLogo :size="44" /><span>{{ t('app.name') }}</span></div>
      <p class="auth-subtitle">{{ t('auth.changeTitle') }}</p>
      <p class="muted" style="margin: -0.5rem 0 1.25rem; font-size: 0.9rem">{{ t('auth.changeSubtitle') }}</p>

      <Message v-if="serverError" severity="error" :closable="false" class="full-width" style="margin-bottom: 1rem">{{ serverError }}</Message>

      <form @submit.prevent="submit">
        <div class="field">
          <label>{{ t('auth.currentPassword') }}</label>
          <Password v-model="form.current" toggleMask :feedback="false" placeholder="••••••••" :invalid="!!errors.current" inputClass="full-width" class="full-width" />
          <small v-if="errors.current" class="field-error">{{ errors.current }}</small>
        </div>
        <div class="field">
          <label>{{ t('auth.newPassword') }}</label>
          <Password v-model="form.password" toggleMask placeholder="••••••••" :invalid="!!errors.password" inputClass="full-width" class="full-width" />
          <small v-if="errors.password" class="field-error">{{ errors.password }}</small>
        </div>
        <div class="field">
          <label>{{ t('auth.passwordConfirm') }}</label>
          <Password v-model="form.confirm" toggleMask :feedback="false" placeholder="••••••••" :invalid="!!errors.confirm" inputClass="full-width" class="full-width" />
          <small v-if="errors.confirm" class="field-error">{{ errors.confirm }}</small>
        </div>
        <Button type="submit" :label="t('auth.changeSubmit')" icon="pi pi-check" class="full-width" :loading="loading" style="margin-top: 0.5rem" />
      </form>

      <p class="auth-footer">
        <a href="#" @click.prevent="logout">{{ t('nav.logout') }}</a>
      </p>
    </div>
  </div>
</template>
