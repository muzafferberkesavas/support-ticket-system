<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { extractErrorMessage } from '@/services/api';
import BrandLogo from '@/components/BrandLogo.vue';

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const token = (route.query.token as string) || '';
const form = reactive({ password: '', confirm: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const done = ref(false);
const loading = ref(false);

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (form.password.length < 6) errors.password = t('auth.errors.passwordMin');
  if (form.confirm !== form.password) errors.confirm = t('auth.errors.passwordMatch');
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate()) return;
  loading.value = true;
  serverError.value = '';
  try {
    await auth.resetPassword(token, form.password);
    done.value = true;
    setTimeout(() => router.push('/login'), 1800);
  } catch (err) {
    serverError.value = extractErrorMessage(err, t('auth.resetInvalid'));
  } finally {
    loading.value = false;
  }
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
      <p class="auth-subtitle">{{ t('auth.resetTitle') }}</p>

      <Message v-if="done" severity="success" :closable="false" class="full-width">{{ t('auth.resetSuccess') }}</Message>
      <Message v-else-if="!token" severity="error" :closable="false" class="full-width">{{ t('auth.resetInvalid') }}</Message>

      <template v-if="!done && token">
        <Message v-if="serverError" severity="error" :closable="false" class="full-width" style="margin-bottom: 1rem">{{ serverError }}</Message>
        <form @submit.prevent="submit">
          <div class="field">
            <label>{{ t('auth.newPassword') }}</label>
            <Password v-model="form.password" toggleMask :feedback="false" placeholder="••••••••" :invalid="!!errors.password" inputClass="full-width" class="full-width" />
            <small v-if="errors.password" class="field-error">{{ errors.password }}</small>
          </div>
          <div class="field">
            <label>{{ t('auth.passwordConfirm') }}</label>
            <Password v-model="form.confirm" toggleMask :feedback="false" placeholder="••••••••" :invalid="!!errors.confirm" inputClass="full-width" class="full-width" />
            <small v-if="errors.confirm" class="field-error">{{ errors.confirm }}</small>
          </div>
          <Button type="submit" :label="t('auth.resetSubmit')" icon="pi pi-check" class="full-width" :loading="loading" style="margin-top: 0.5rem" />
        </form>
      </template>

      <p class="auth-footer"><RouterLink to="/login">{{ t('auth.backToLogin') }}</RouterLink></p>
    </div>
  </div>
</template>
