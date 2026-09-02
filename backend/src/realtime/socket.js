/**
 * Socket.IO transport.
 *
 * Every connection is authenticated with the same JWT the REST API uses, and is
 * joined to rooms that mirror the authorisation model:
 *   user:<id>   — that person only (status changes, notifications)
 *   staff       — every internal user (live worklist + dashboard counters)
 *   role:<role> — a single staff role (e.g. collections-only broadcasts)
 *
 * Emitting is centralised here so no controller ever has to know about rooms.
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { ROLES, EVENTS } from '../constants/index.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Long-poll fallback keeps the free-tier Render deployment reliable.
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) return next(new Error('Authentication token missing.'));

    try {
      const payload = jwt.verify(token, env.jwt.secret);
      socket.data.user = { id: payload.sub, role: payload.role, name: payload.name };
      return next();
    } catch {
      return next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;

    socket.join(`user:${id}`);
    if (role !== ROLES.CUSTOMER) {
      socket.join('staff');
      socket.join(`role:${role}`);
    }

    logger.debug(`Socket connected: user=${id} role=${role}`);
    socket.emit('connected', { userId: id, role });

    socket.on('disconnect', () => logger.debug(`Socket disconnected: user=${id}`));
  });

  logger.info('Socket.IO ready.');
  return io;
}

export const getIo = () => io;

/** Emits to every internal (admin-portal) user. */
export function emitToStaff(event, payload) {
  io?.to('staff').emit(event, payload);
}

/** Emits to one specific user across all their open tabs/devices. */
export function emitToUser(userId, event, payload) {
  if (!userId) return;
  io?.to(`user:${String(userId)}`).emit(event, payload);
}

export function emitToRole(role, event, payload) {
  io?.to(`role:${role}`).emit(event, payload);
}

/**
 * Tells listeners that a data scope changed so they can invalidate caches.
 * Scopes: applications | loans | payments | users | banks | config | collections | dashboard
 */
export function broadcastDataChange(scopes, { userId = null } = {}) {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  const payload = { scopes: list, at: new Date().toISOString() };
  emitToStaff(EVENTS.DATA_CHANGED, payload);
  if (userId) emitToUser(userId, EVENTS.DATA_CHANGED, payload);
}

export default { initSocket, getIo, emitToStaff, emitToUser, emitToRole, broadcastDataChange };
