/**
 * Notifications: persists a bell item, pushes it live over Socket.IO, and
 * fans out to the mocked email/SMS channels. One call per business event.
 */
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { emitToUser, emitToStaff } from '../realtime/socket.js';
import { EVENTS } from '../constants/index.js';
import messenger from '../mocks/messenger.js';
import logger from '../utils/logger.js';

/**
 * @param {object} params
 * @param {string} params.userId    recipient
 * @param {string} params.title
 * @param {string} [params.message]
 * @param {'info'|'success'|'warning'|'error'} [params.type]
 * @param {string} [params.link]    in-app deep link
 * @param {boolean} [params.alsoEmail] also send the mocked email/SMS
 */
export async function notifyUser({
  userId,
  title,
  message = '',
  type = 'info',
  category = 'general',
  link = '',
  alsoEmail = false,
}) {
  if (!userId) return null;

  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type,
    category,
    link,
  });

  // Live push so the bell and any open dashboard update without a refresh.
  emitToUser(userId, EVENTS.NOTIFICATION_NEW, notification.toJSON());

  if (alsoEmail) {
    try {
      const user = await User.findById(userId).select('email mobile').lean();
      if (user) {
        await messenger.notify({
          email: user.email,
          mobile: user.mobile,
          subject: title,
          message,
        });
      }
    } catch (error) {
      logger.error(`Notification fan-out failed: ${error.message}`);
    }
  }

  return notification;
}

/** Broadcasts an informational item to every internal user (no DB rows). */
export function notifyStaff({ title, message = '', type = 'info', link = '' }) {
  emitToStaff(EVENTS.NOTIFICATION_NEW, {
    _id: `transient-${Date.now()}`,
    title,
    message,
    type,
    link,
    read: false,
    transient: true,
    createdAt: new Date().toISOString(),
  });
}

export async function listForUser(userId, { limit = 30, unreadOnly = false } = {}) {
  const filter = { user: userId };
  if (unreadOnly) filter.read = false;
  return Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

export const countUnread = (userId) => Notification.countDocuments({ user: userId, read: false });

export const markRead = (userId, id) =>
  Notification.findOneAndUpdate({ _id: id, user: userId }, { read: true }, { new: true });

export const markAllRead = (userId) =>
  Notification.updateMany({ user: userId, read: false }, { read: true });

export default { notifyUser, notifyStaff, listForUser, countUnread, markRead, markAllRead };
