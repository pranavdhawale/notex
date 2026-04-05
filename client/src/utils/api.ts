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
 * Helper to get WebSocket base URL
 */
export function getWebSocketBaseUrl(): string {
  return API_URL.replace('http', 'ws') + '/ws';
}