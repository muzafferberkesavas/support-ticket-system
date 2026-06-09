import { defineStore } from 'pinia';
import { api, getStoredToken, setStoredToken } from '@/services/api';
import type { AuthResponse, User } from '@/types';

const USER_KEY = 'support_user';

function loadUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getStoredToken(),
    user: loadUser(),
  }),

  getters: {
    isAuthenticated: (state): boolean => !!state.token,
    mustChangePassword: (state): boolean => state.user?.mustChangePassword === true,
    isAdmin: (state): boolean => state.user?.role === 'admin',
    isManager: (state): boolean =>
      state.user?.role === 'admin' || state.user?.role === 'team_lead',
    isStaff: (state): boolean =>
      state.user?.role === 'admin' ||
      state.user?.role === 'team_lead' ||
      state.user?.role === 'agent',
    displayName: (state): string => state.user?.fullName || state.user?.email || '',
  },

  actions: {
    persist(payload: AuthResponse) {
      this.token = payload.token;
      this.user = payload.user;
      setStoredToken(payload.token);
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    },

    async register(email: string, password: string, fullName?: string) {
      const { data } = await api.post<AuthResponse>('/auth/register', { email, password, fullName });
      this.persist(data);
    },

    async login(email: string, password: string) {
      const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
      this.persist(data);
    },

    async changePassword(currentPassword: string, newPassword: string) {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      if (this.user) {
        this.user = { ...this.user, mustChangePassword: false };
        localStorage.setItem(USER_KEY, JSON.stringify(this.user));
      }
    },

    async forgotPassword(email: string) {
      await api.post('/auth/forgot-password', { email });
    },

    async resetPassword(token: string, newPassword: string) {
      await api.post('/auth/reset-password', { token, newPassword });
    },

    logout() {
      this.token = null;
      this.user = null;
      setStoredToken(null);
      localStorage.removeItem(USER_KEY);
    },
  },
});
