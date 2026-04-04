import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getUserID } from './session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minutes for large file uploads
});

// Request interceptor to add user ID header
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const userID = getUserID();
    if (userID) {
      config.headers['X-User-ID'] = userID;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;

/**
 * Helper to get WebSocket URL with user ID and optional auth token
 */
export function getWebSocketUrl(roomSlug: string, authToken?: string): string {
  const wsBase = API_URL.replace('http', 'ws');
  const userID = getUserID();
  let url = `${wsBase}/ws/${roomSlug}?userID=${encodeURIComponent(userID)}`;
  if (authToken) {
    url += `&authToken=${encodeURIComponent(authToken)}`;
  }
  return url;
}