/** Notification — in-app bell items, also pushed live over Socket.IO. */
import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../constants/index.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'info' },
    category: { type: String, default: 'general' },
    /** In-app route the bell item deep-links to. */
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Notification', notificationSchema);
