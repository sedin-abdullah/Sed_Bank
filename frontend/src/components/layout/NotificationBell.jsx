/**
 * Notification bell. Unread count and items come from the API; new items arrive
 * live over Socket.IO (SocketContext invalidates the `notifications` query).
 */
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { http } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';

const TONE_DOT = {
  success: 'bg-success-500',
  error: 'bg-danger-500',
  warning: 'bg-warning-500',
  info: 'bg-brand-400',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => http.get('/notifications', { params: { limit: 20 } }),
    // Live push is the primary channel; this is a safety net.
    refetchInterval: 60000,
    staleTime: 15000,
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const markAll = useMutation({
    mutationFn: () => http.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id) => http.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const openItem = (notification) => {
    if (!notification.read && !notification.transient) markOne.mutate(notification._id);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid={TESTIDS.shell.notificationBell}
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-slate-800"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span
              data-testid={TESTIDS.shell.notificationBadge}
              className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          data-testid={TESTIDS.shell.notificationPanel}
          className="z-50 w-[calc(100vw-2rem)] max-w-sm animate-slide-up overflow-hidden rounded-card border border-white/10 bg-canvas-raised/95 shadow-panel backdrop-blur-heavy"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                data-testid={TESTIDS.shell.notificationMarkAll}
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                <p className="text-sm text-slate-500">You have no notifications yet.</p>
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification._id}>
                    <button
                      type="button"
                      data-testid={TESTIDS.shell.notificationItem}
                      onClick={() => openItem(notification)}
                      className={cn(
                        'flex w-full gap-3 border-b border-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.06]',
                        !notification.read && 'bg-brand-500/[0.12]'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          TONE_DOT[notification.type] ?? TONE_DOT.info
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">
                          {notification.title}
                        </span>
                        {notification.message ? (
                          <span className="mt-0.5 block break-words text-xs text-slate-500">
                            {notification.message}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
