/**
 * Axios client for the SedBank API.
 * Attaches the JWT, unwraps the `{ success, data }` envelope, and normalises
 * every error into a predictable shape the forms and toasts can rely on.
 */
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

/** True inside the Capacitor Android/iOS WebView, false in a browser. */
export const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * Where the API lives.
 *
 * The distinction matters more than it looks. In a browser the app and the API
 * are both reachable from the same machine, so a `localhost` fallback is a
 * convenience. Inside a Capacitor WebView the bundle is served from
 * `http://localhost` ON THE DEVICE, so `localhost` means the phone itself —
 * a build with no VITE_API_URL does not fall back to anything useful, it
 * silently talks to nothing. Vite inlines these at build time, so there is no
 * runtime signal either.
 *
 * Hence: on native an absolute, non-loopback URL is required, and a build
 * without one is treated as a build error rather than a mystery at runtime.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/**
 * Resolved lazily into a value + error pair rather than thrown: throwing here
 * runs during module init, React never mounts, and the result is a blank
 * screen. The app renders `API_CONFIG_ERROR` as a readable message instead.
 */
function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

  if (!IS_NATIVE) {
    // Browser: same-machine loopback is a reasonable dev default.
    return { base: configured || 'http://localhost:5000', error: null };
  }

  if (!configured) {
    return {
      base: '',
      error:
        'VITE_API_URL was not set when this app was built. A native build cannot ' +
        'guess the API address — inside the WebView, localhost is the device ' +
        'itself. Rebuild with VITE_API_URL pointing at the deployed API.',
    };
  }

  if (LOOPBACK.test(configured)) {
    return {
      base: configured,
      error:
        `VITE_API_URL is ${configured}, which inside a native WebView resolves to ` +
        'the device rather than your machine or the server. Rebuild with the ' +
        "API's real address — use your machine's LAN IP for local development.",
    };
  }

  return { base: configured, error: null };
}

const resolved = resolveApiBase();

/** Non-null when the build is misconfigured for the platform it is running on. */
export const API_CONFIG_ERROR = resolved.error;
export const API_BASE = resolved.base;
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

  /**
   * Opens a document in a new tab.
   *
   * Documents are served from an authorised endpoint now, not from static
   * disk, so a plain <a href> would arrive without the bearer token. Fetch
   * the bytes, wrap them in a blob URL, and hand that to the browser.
   */
  openFile: async (url) => {
    const response = await api.get(url, { responseType: 'blob' });
    const type = response.headers?.['content-type'] || 'application/octet-stream';
    const blobUrl = URL.createObjectURL(new Blob([response.data], { type }));

    const opened = window.open(blobUrl, '_blank', 'noopener');
    if (!opened) {
      // Pop-up blocked — fall back to a download so the click is not lost.
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return true;
  },
};

/** Absolute URL for an uploaded document (the API returns a relative path). */
export const fileUrl = (relativePath) =>
  relativePath?.startsWith('http') ? relativePath : `${API_BASE}${relativePath || ''}`;

export default api;
