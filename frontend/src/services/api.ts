import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'support_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// JWT mevcutsa her isteğe ekle.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 durumunda oturumu temizle ki guard'lar login'e yönlendirsin.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      setStoredToken(null);
      localStorage.removeItem('support_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

// API hatasından okunabilir bir mesaj çıkarır.
export function extractErrorMessage(error: unknown, fallback = 'Bir hata oluştu'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; details?: Record<string, string[]> } | undefined;
    if (data?.details) {
      const first = Object.values(data.details).flat().find(Boolean);
      if (first) return first;
    }
    if (data?.error) return data.error;
    if (error.message) return error.message;
  }
  return fallback;
}
