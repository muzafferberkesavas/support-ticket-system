import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';

import 'primeicons/primeicons.css';
import './style.css';

import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { useUiStore } from './stores/ui';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(i18n);
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.app-dark',
      cssLayer: false,
    },
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', Tooltip);

// Apply persisted theme + locale before mount.
useUiStore(pinia).init();

app.mount('#app');
