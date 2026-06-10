<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { extractErrorMessage } from '@/services/api';
import RoleTag from '@/components/RoleTag.vue';

const { t } = useI18n();
const toast = useToast();
const auth = useAuthStore();
const ui = useUiStore();

const fullName = ref(auth.user?.fullName ?? '');
const savingName = ref(false);

async function saveName() {
  if (fullName.value.trim().length < 2) return;
  savingName.value = true;
  try {
    await auth.updateProfile(fullName.value.trim());
    toast.add({ severity: 'success', summary: t('profile.nameSaved'), life: 3000 });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('errors.generic'), detail: extractErrorMessage(err), life: 4000 });
  } finally {
    savingName.value = false;
  }
}

const pwd = reactive({ current: '', next: '', confirm: '' });
const pwdErrors = reactive<Record<string, string>>({});
const savingPwd = ref(false);

async function savePassword() {
  Object.keys(pwdErrors).forEach((k) => delete pwdErrors[k]);
  if (!pwd.current) pwdErrors.current = t('auth.errors.passwordRequired');
  if (pwd.next.length < 6) pwdErrors.next = t('auth.errors.passwordMin');
  if (pwd.confirm !== pwd.next) pwdErrors.confirm = t('auth.errors.passwordMatch');
  if (Object.keys(pwdErrors).length) return;
  savingPwd.value = true;
  try {
    await auth.changePassword(pwd.current, pwd.next);
    toast.add({ severity: 'success', summary: t('auth.changeSuccess'), life: 3000 });
    pwd.current = pwd.next = pwd.confirm = '';
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('auth.errors.changeFailed'),
      detail: extractErrorMessage(err),
      life: 4000,
    });
  } finally {
    savingPwd.value = false;
  }
}

const themeOptions = [
  { label: t('theme.light'), value: 'light' },
  { label: t('theme.dark'), value: 'dark' },
];
const langOptions = [
  { label: 'Türkçe', value: 'tr' },
  { label: 'English', value: 'en' },
];
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ t('profile.title') }}</h1>
      <p class="page-subtitle">{{ t('profile.subtitle') }}</p>
    </div>
  </div>

  <div class="profile-grid">
    <!-- Account -->
    <Card>
      <template #title>{{ t('profile.account') }}</template>
      <template #content>
        <div class="meta-row">
          <span class="meta-key">{{ t('profile.email') }}</span
          ><span>{{ auth.user?.email }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">{{ t('profile.role') }}</span
          ><RoleTag v-if="auth.user" :role="auth.user.role" />
        </div>

        <div class="field" style="margin-top: 1rem">
          <label>{{ t('profile.name') }}</label>
          <div style="display: flex; gap: 0.5rem">
            <InputText v-model="fullName" class="full-width" maxlength="120" />
            <Button :label="t('profile.saveName')" icon="pi pi-check" :loading="savingName" @click="saveName" />
          </div>
        </div>
      </template>
    </Card>

    <!-- Password -->
    <Card>
      <template #title>{{ t('profile.passwordSection') }}</template>
      <template #content>
        <div class="field">
          <label>{{ t('auth.currentPassword') }}</label>
          <Password
            v-model="pwd.current"
            :feedback="false"
            toggleMask
            inputClass="full-width"
            class="full-width"
            :invalid="!!pwdErrors.current"
          />
          <small v-if="pwdErrors.current" class="field-error">{{ pwdErrors.current }}</small>
        </div>
        <div class="field">
          <label>{{ t('auth.newPassword') }}</label>
          <Password
            v-model="pwd.next"
            toggleMask
            inputClass="full-width"
            class="full-width"
            :invalid="!!pwdErrors.next"
          />
          <small v-if="pwdErrors.next" class="field-error">{{ pwdErrors.next }}</small>
        </div>
        <div class="field">
          <label>{{ t('auth.passwordConfirm') }}</label>
          <Password
            v-model="pwd.confirm"
            :feedback="false"
            toggleMask
            inputClass="full-width"
            class="full-width"
            :invalid="!!pwdErrors.confirm"
          />
          <small v-if="pwdErrors.confirm" class="field-error">{{ pwdErrors.confirm }}</small>
        </div>
        <Button :label="t('auth.changeSubmit')" icon="pi pi-lock" :loading="savingPwd" @click="savePassword" />
      </template>
    </Card>

    <!-- Preferences -->
    <Card>
      <template #title>{{ t('profile.preferences') }}</template>
      <template #content>
        <div class="field">
          <label>{{ t('profile.theme') }}</label>
          <SelectButton
            :modelValue="ui.theme"
            :options="themeOptions"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            @update:modelValue="ui.setTheme"
          />
        </div>
        <div class="field">
          <label>{{ t('profile.language') }}</label>
          <SelectButton
            :modelValue="ui.locale"
            :options="langOptions"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            @update:modelValue="ui.setLocale"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
</style>
