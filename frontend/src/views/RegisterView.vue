<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
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
const { t } = useI18n();

const form = reactive({ fullName: '', email: '', password: '', confirm: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const loading = ref(false);

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = t('auth.errors.email');
  if (form.password.length < 6) errors.password = t('auth.errors.passwordMin');
  if (form.confirm !== form.password) errors.confirm = t('auth.errors.passwordMatch');
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate()) return;
  loading.value = true;
  serverError.value = '';
  try {
    await auth.register(form.email.trim(), form.password, form.fullName.trim() || undefined);
    router.push('/tickets');
  } catch (err) {
    serverError.value = extractErrorMessage(err, t('auth.errors.registerFailed'));
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
      <p class="auth-subtitle">{{ t('auth.registerTitle') }}</p>

      <Message v-if="serverError" severity="error" :closable="false" class="full-width" style="margin-bottom: 1rem">
        {{ serverError }}
      </Message>

      <form @submit.prevent="submit">
        <div class="field">
          <label for="fullName">{{ t('auth.fullName') }} <span class="muted">({{ t('common.optional') }})</span></label>
          <InputText id="fullName" v-model="form.fullName" class="full-width" placeholder="Mehmet Çelik" />
        </div>

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
            toggleMask
            placeholder="••••••••"
            :invalid="!!errors.password"
            inputClass="full-width"
            class="full-width"
          />
          <small v-if="errors.password" class="field-error">{{ errors.password }}</small>
        </div>

        <div class="field">
          <label for="confirm">{{ t('auth.passwordConfirm') }}</label>
          <Password
            id="confirm"
            v-model="form.confirm"
            :feedback="false"
            toggleMask
            placeholder="••••••••"
            :invalid="!!errors.confirm"
            inputClass="full-width"
            class="full-width"
          />
          <small v-if="errors.confirm" class="field-error">{{ errors.confirm }}</small>
        </div>

        <Button
          type="submit"
          :label="t('auth.register')"
          icon="pi pi-user-plus"
          class="full-width"
          :loading="loading"
          style="margin-top: 0.5rem"
        />
      </form>

      <p class="auth-footer">
        {{ t('auth.haveAccount') }}
        <RouterLink to="/login">{{ t('auth.loginLink') }}</RouterLink>
      </p>
    </div>
  </div>
</template>
