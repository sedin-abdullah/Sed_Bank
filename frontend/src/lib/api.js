/**
 * Axios client for the SedBank API.
 * Attaches the JWT, unwraps the `{ success, data }` envelope, and normalises
 * every error into a predictable shape the forms and toasts can rely on.
 */
import axios from 'axios';

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_BASE).replace(/\/$/, '');

const TOKEN_KEY = 'sedbank.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session simply won't persist */
  }
};

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Raised for every failed request so callers get one consistent error type. */
export class ApiError extends Error {
  constructor(message, { status, details, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || [];
    this.code = code;
  }

  /** Field-keyed messages, ready to drop into a form's error state. */
  get fieldErrors() {
    return Object.fromEntries(
      (this.details || [])
        .filter((detail) => detail?.field)
        .map((detail) => [detail.field, detail.message])
    );
  }
}

/** Session-expiry hook, wired up by AuthContext. */
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiError('The request timed out. Please try again.', { status: 0 }));
    }

    if (!error.response) {
      return Promise.reject(
        new ApiError(
          'Cannot reach the SedBank API. Check that the backend is running and VITE_API_URL is correct.',
          { status: 0, code: 'NETWORK' }
        )
      );
    }

    const { status, data } = error.response;

    // 401 anywhere but the login call means the session lapsed.
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      onUnauthorized?.();
    }

    return Promise.reject(
      new ApiError(data?.error?.message || 'Something went wrong.', {
        status,
        details: data?.error?.details,
      })
    );
  }
);

/** Unwraps `{ success, data }`, returning the payload plus any `meta`. */
const unwrap = (response) => {
  const body = response.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.meta ? { ...body.data, meta: body.meta } : body.data;
  }
  return body;
};

export const http = {
  get: (url, config) => api.get(url, config).then(unwrap),
  post: (url, body, config) => api.post(url, body, config).then(unwrap),
  put: (url, body, config) => api.put(url, body, config).then(unwrap),
  patch: (url, body, config) => api.patch(url, body, config).then(unwrap),
  delete: (url, config) => api.delete(url, config).then(unwrap),

  /**
   * Lists return `{ data: [...], meta }`; this keeps both halves together
   * without the caller having to know about the envelope.
   */
  list: (url, config) =>
    api.get(url, config).then((response) => ({
      items: response.data?.data ?? [],
      meta: response.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
    })),

  /** Downloads a PDF and hands back a blob URL plus a suggested filename. */
  download: async (url, filename) => {
    const response = await api.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    return true;
  },
};

/** Absolute URL for an uploaded document (the API returns a relative path). */
export const fileUrl = (relativePath) =>
  relativePath?.startsWith('http') ? relativePath : `${API_BASE}${relativePath || ''}`;

export default api;
