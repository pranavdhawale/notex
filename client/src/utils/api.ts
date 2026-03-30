import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getAuthHeader, getOrCreateSession } from './session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minutes for large file uploads
});

// Request interceptor to add auth header
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Get auth header
    const authHeader = getAuthHeader();
    if (authHeader) {
      config.headers.Authorization = authHeader;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Session might be expired, try to refresh
      try {
        await getOrCreateSession();
        // Retry the request with new token
        const authHeader = getAuthHeader();
        if (authHeader && error.config) {
          error.config.headers.Authorization = authHeader;
          return api.request(error.config);
        }
      } catch (refreshError) {
        // Refresh failed, clear session and reject
        localStorage.removeItem('notex_session');
        localStorage.removeItem('notex_user_id');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

/**
 * Helper to get WebSocket URL with auth
 */
export function getWebSocketUrl(roomSlug: string): string {
  const wsBase = API_URL.replace('http', 'ws');
  const session = localStorage.getItem('notex_session');
  let token = '';

  if (session) {
    try {
      const parsed = JSON.parse(session);
      token = parsed.token || '';
    } catch {
      // ignore
    }
  }

  // Include token as query param for WebSocket authentication
  // Note: WebSocket doesn't support custom headers, so we use query params
  return `${wsBase}/ws/${roomSlug}?token=${encodeURIComponent(token)}`;
}