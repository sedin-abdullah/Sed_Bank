import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import './index.css';

/**
 * Query defaults.
 * Live Socket.IO events drive most invalidation, so polling stays off; a short
 * stale time still de-duplicates the bursts of refetches a navigation causes.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry a client error — the request is wrong, not unlucky.
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <App />
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
