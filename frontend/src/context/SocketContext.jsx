/**
 * Socket.IO client.
 *
 * This is what makes the two portals stay in sync without a refresh: server
 * events invalidate the matching TanStack Query caches, so any list, counter or
 * detail screen currently on screen refetches itself immediately.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_URL, getToken } from '../lib/api.js';
import { EVENTS } from '../lib/constants.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const SocketContext = createContext(null);

/** Data scope -> the query keys it should invalidate. */
const SCOPE_KEYS = {
  applications: [['applications'], ['application'], ['underwriting-queue'], ['pending-documents']],
  loans: [['loans'], ['loan']],
  payments: [['payments'], ['loan']],
  collections: [['collections'], ['collection-notes']],
  users: [['users']],
  banks: [['banks']],
  config: [['config'], ['product']],
  dashboard: [['dashboard']],
};

export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    const invalidate = (scopes) => {
      (scopes || []).forEach((scope) => {
        (SCOPE_KEYS[scope] || []).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      });
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    // Generic cache-busting signal.
    socket.on(EVENTS.DATA_CHANGED, (payload) => invalidate(payload?.scopes));

    // A newly submitted application must appear in the admin worklist at once.
    socket.on(EVENTS.APPLICATION_CREATED, () => invalidate(['applications', 'dashboard']));
    socket.on(EVENTS.APPLICATION_UPDATED, () => invalidate(['applications', 'dashboard']));
    socket.on(EVENTS.LOAN_UPDATED, () => invalidate(['loans', 'collections', 'dashboard']));
    socket.on(EVENTS.PAYMENT_RECORDED, () =>
      invalidate(['payments', 'loans', 'collections', 'dashboard'])
    );

    // Personal notifications surface as a live toast plus a bell refresh.
    socket.on(EVENTS.NOTIFICATION_NEW, (notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.push({
        title: notification?.title || 'Update',
        message: notification?.message || '',
        type: notification?.type || 'info',
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // `toast` is stable (memoised in its provider); user id keys the reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?._id, queryClient]);

  const value = useMemo(() => ({ connected, socket: socketRef.current }), [connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext) ?? { connected: false, socket: null };

export default SocketContext;
