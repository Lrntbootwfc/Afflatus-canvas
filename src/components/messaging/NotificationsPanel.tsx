import React, { useEffect, useState } from 'react';
import {
  Bell,
  X,
  MessageSquare,
  UserPlus,
  CheckCircle2,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import type { CreatorProfile } from '../../types';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  respondToConnection,
  getConnectionsForUser,
  sanitizeUserFacingError,
  type AppNotification,
} from '../../lib/firebase';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CreatorProfile;
  unreadCount: number;
  onUnreadChange?: (n: number) => void;
  onOpenMessenger?: (connectionId: string) => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  isOpen,
  onClose,
  currentUser,
  unreadCount,
  onUnreadChange,
  onOpenMessenger,
}) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Connection IDs whose Accept/Reject was already used this session (immediate UI) */
  const [handledConnIds, setHandledConnIds] = useState<Set<string>>(new Set());
  const [connStatusById, setConnStatusById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!currentUser?.id) return;
    setLoading(true);
    const unsub = subscribeToNotifications(
      currentUser.id,
      (list) => {
        setItems(list);
        setLoading(false);
        const unread = list.filter((n) => !n.read).length;
        onUnreadChange?.(unread);
      },
      () => setLoading(false)
    );
    // Sync connection statuses so Accept/Reject hide after handling (no refresh)
    getConnectionsForUser(currentUser.id)
      .then((list) => {
        const map: Record<string, string> = {};
        list.forEach((c) => {
          map[c.id] = c.status;
        });
        setConnStatusById(map);
      })
      .catch(() => {});
    return () => unsub();
  }, [currentUser?.id]);

  const iconFor = (type: AppNotification['type']) => {
    if (type === 'message') return <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-amber)]" />;
    if (type === 'connection_accepted')
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    return <UserPlus className="w-3.5 h-3.5 text-[var(--accent-amber)]" />;
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id, currentUser.id);
    }
    if (n.type === 'message' && n.relatedId && onOpenMessenger) {
      onOpenMessenger(n.relatedId);
      onClose();
    }
    if (n.type === 'connection_accepted' && n.relatedId && onOpenMessenger) {
      onOpenMessenger(n.relatedId);
      onClose();
    }
  };

  const handleRespond = async (n: AppNotification, status: 'accepted' | 'declined') => {
    if (!n.relatedId) return;
    // Already handled in UI or backend
    if (handledConnIds.has(n.relatedId)) return;
    const st = connStatusById[n.relatedId];
    if (st && st !== 'pending') return;

    setActingId(n.id);
    setActionError(null);
    // Optimistic: hide buttons immediately
    setHandledConnIds((prev) => new Set(prev).add(n.relatedId!));
    setConnStatusById((prev) => ({ ...prev, [n.relatedId!]: status }));
    try {
      await respondToConnection(n.relatedId, status, currentUser.id);
      await markNotificationRead(n.id, currentUser.id);
      if (status === 'accepted' && onOpenMessenger) {
        onOpenMessenger(n.relatedId);
        onClose();
      }
    } catch (err: any) {
      const safe = sanitizeUserFacingError(err, 'Could not update this request.');
      setActionError(safe);
      // Keep handled so user cannot double-submit the same request
    } finally {
      setActingId(null);
    }
  };

  const showAcceptReject = (n: AppNotification) => {
    if (n.type !== 'connection_request' || !n.relatedId) return false;
    if (handledConnIds.has(n.relatedId)) return false;
    const st = connStatusById[n.relatedId];
    if (st && st !== 'pending') return false;
    return true;
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] z-50">
      <div className="card-warm-white rounded-2xl border border-[var(--card-border)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--accent-amber)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)] text-[#181614]">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsRead(currentUser.id)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Mark all read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {actionError && (
          <p className="px-4 py-2 text-[11px] text-red-500 border-b border-[var(--card-border)]">
            {actionError}
          </p>
        )}

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-amber)]" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <p className="text-xs text-[var(--text-muted)]">No notifications yet.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <div
                    className={`w-full text-left px-4 py-3 flex gap-2.5 border-b border-[var(--card-border)] last:border-0 ${
                      !n.read ? 'bg-[var(--accent-amber)]/5' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{iconFor(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className="w-full text-left cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] mt-1 font-mono">
                          {n.createdAt
                            ? new Date(n.createdAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </button>
                      {showAcceptReject(n) && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            disabled={actingId === n.id}
                            onClick={() => handleRespond(n, 'accepted')}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--accent-amber)] text-[#181614] cursor-pointer disabled:opacity-50"
                          >
                            {actingId === n.id ? '…' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === n.id}
                            onClick={() => handleRespond(n, 'declined')}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[var(--card-border)] text-[var(--text-secondary)] cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] shrink-0 mt-1.5" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

/** Lightweight unread badge subscription for header */
export function useNotificationUnread(
  userId: string | undefined,
  onCount: (n: number) => void
) {
  useEffect(() => {
    if (!userId) {
      onCount(0);
      return;
    }
    const unsub = subscribeToNotifications(userId, (list) => {
      onCount(list.filter((x) => !x.read).length);
    });
    return () => unsub();
  }, [userId]);
}
