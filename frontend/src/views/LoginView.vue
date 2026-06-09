<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { extractErrorMessage } from '@/services/api';
import BrandLogo from '@/components/BrandLogo.vue';

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const form = reactive({ email: '', password: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const loading = ref(false);

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = t('auth.errors.email');
  if (!form.password) errors.password = t('auth.errors.passwordRequired');
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate()) return;
  loading.value = true;
  serverError.value = '';
  try {
    await auth.login(form.email.trim(), form.password);
    router.push((route.query.redirect as string) || '/');
  } catch (err) {
    serverError.value = extractErrorMessage(err, t('auth.errors.loginFailed'));
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
        <BrandLogo :size="44" />
        <span>{{ t('app.name') }}</span>
      </div>
      <p class="auth-subtitle">{{ t('auth.loginTitle') }}</p>

      <Message v-if="serverError" severity="error" :closable="false" class="full-width" style="margin-bottom: 1rem">
        {{ serverError }}
      </Message>

      <form @submit.prevent="submit">
        <div class="field">
          <label for="email">{{ t('auth.email') }}</label>
          <InputText
            id="email"
            v-model="form.email"
            type="email"
            :placeholder="t('auth.emailPlaceholder')"
            :invalid="!!errors.email"
            class="full-width"
          />
          <small v-if="errors.email" class="field-error">{{ errors.email }}</small>
        </div>

        <div class="field">
          <label for="password">{{ t('auth.password') }}</label>
          <Password
            id="password"
            v-model="form.password"
            :feedback="false"
            toggleMask
            placeholder="••••••••"
            :invalid="!!errors.password"
            inputClass="full-width"
            class="full-width"
          />
          <small v-if="errors.password" class="field-error">{{ errors.password }}</small>
        </div>

        <div style="text-align: right; margin: -0.4rem 0 0.6rem">
          <RouterLink to="/forgot-password" style="font-size: 0.84rem">{{ t('auth.forgotLink') }}</RouterLink>
        </div>

        <Button
          type="submit"
          :label="t('auth.login')"
          icon="pi pi-sign-in"
          class="full-width"
          :loading="loading"
          style="margin-top: 0.5rem"
        />
      </form>

      <p class="auth-footer">
        {{ t('auth.noAccount') }}
        <RouterLink to="/register">{{ t('auth.registerLink') }}</RouterLink>
      </p>
    </div>
  </div>
</template>
