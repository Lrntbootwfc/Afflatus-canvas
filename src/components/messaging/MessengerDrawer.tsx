import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MessageSquare, Send, Loader2, Users } from 'lucide-react';
import type { CreatorProfile } from '../../types';
import {
  getProfileFromFirestore,
  toggleCollaborationStatus,
  sendMessage,
  subscribeToMessages,
  markMessagesRead,
  subscribeToUserConnections,
  sanitizeUserFacingError,
  auth,
  type ConnectionRequest,
  type ChatMessage,
} from '../../lib/firebase';
import { UserAvatar } from '../UserAvatar';

interface MessengerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CreatorProfile;
  /** Optional connection to open directly */
  initialConnectionId?: string | null;
  /** Optional callback to navigate to a user's profile */
  onNavigateToProfile?: (creatorId: string) => void;
}

type PeerMap = Record<string, CreatorProfile | null>;

export const MessengerDrawer: React.FC<MessengerDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialConnectionId,
  onNavigateToProfile,
}) => {
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConnectionId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peers, setPeers] = useState<PeerMap>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Prefer Firebase Auth uid for unreadCounts keys (must match sendMessage recipientId). */
  const myUid = auth.currentUser?.uid || currentUser.id;

  const accepted = useMemo(
    () => connections.filter((c) => c.status === 'accepted' || c.status === 'collaborating' || c.status === 'completed'),
    [connections]
  );

  const selected = accepted.find((c) => c.id === selectedId) || null;
  const peerId = selected
    ? selected.senderId === currentUser.id
      ? selected.recipientId
      : selected.senderId
    : null;
  const peer = peerId ? peers[peerId] : null;

  useEffect(() => {
    if (!isOpen) return;
    setLoadingList(true);
    setError(null);
    let cancelled = false;
    const unsub = subscribeToUserConnections(
      currentUser.id,
      async (list) => {
        if (cancelled) return;
        setConnections(list);
        const acceptedList = list.filter(
          (c) => c.status === 'accepted' || c.status === 'collaborating' || c.status === 'completed'
        );
        if (initialConnectionId && acceptedList.some((c) => c.id === initialConnectionId)) {
          setSelectedId(initialConnectionId);
        } else if (!selectedId && acceptedList[0]) {
          setSelectedId(acceptedList[0].id);
        }
        const ids = new Set<string>();
        acceptedList.forEach((c) => {
          ids.add(c.senderId === currentUser.id ? c.recipientId : c.senderId);
        });
        await Promise.all(
          Array.from(ids).map(async (id) => {
            try {
              const p = await getProfileFromFirestore(id);
              if (!cancelled) {
                setPeers((prev) => (prev[id] ? prev : { ...prev, [id]: p }));
              }
            } catch {
              if (!cancelled) {
                setPeers((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: null }));
              }
            }
          })
        );
        if (!cancelled) setLoadingList(false);
      },
      (err) => {
        if (!cancelled) {
          console.warn('[Messenger] connections listen:', err);
          // Do not surface Target ID / internal SDK errors to the user
          setLoadingList(false);
        }
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [isOpen, currentUser.id, initialConnectionId]);

  // Real-time Firestore messages for the selected accepted connection
  useEffect(() => {
    if (!isOpen || !selectedId) {
      setMessages([]);
      return;
    }

    setError(null);
    const unsub = subscribeToMessages(
      selectedId,
      (msgs) => {
        setMessages(msgs);
        // Mark inbound messages as read
        markMessagesRead(selectedId, myUid).catch(() => {});
      },
      (err) => {
        const safe = sanitizeUserFacingError(err, 'Could not load messages. Please try again.');
        if (safe) setError(safe);
      }
    );
    return () => unsub();
  }, [isOpen, selectedId, currentUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !peerId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage({
        connectionId: selected.id,
        senderId: currentUser.id,
        recipientId: peerId,
        text: draft,
        senderName: currentUser.name || currentUser.username,
      });
      // Real-time listener will append the message
      setDraft('');
    } catch (err: any) {
      const safe = sanitizeUserFacingError(err, 'Could not send message. Please try again.');
      if (safe) setError(safe);
    } finally {
      setSending(false);
    }
  };

  const handleToggleCollaboration = async () => {
    if (!selected || !currentUser) return;
    try {
      const updated = await toggleCollaborationStatus(selected.id, currentUser.id);
      setConnections(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--accent-amber)]" />
            <h2 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Messages</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          {/* Conversation list */}
          <div className="w-full sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--card-border)] overflow-y-auto max-h-40 sm:max-h-none">
            {loadingList ? (
              <div className="p-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-amber)]" />
              </div>
            ) : accepted.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <Users className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  No accepted connections yet. Connect with creators and wait for acceptance to message.
                </p>
              </div>
            ) : (
              <ul className="py-1">
                {accepted.map((c) => {
                  const pid = c.senderId === currentUser.id ? c.recipientId : c.senderId;
                  const p = peers[pid];
                  const active = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          // Optimistic: clear unread badge immediately
                          setConnections((prev) =>
                            prev.map((x) =>
                              x.id === c.id
                                ? {
                                    ...x,
                                    unreadCounts: {
                                      ...(x.unreadCounts || {}),
                                      [myUid]: 0,
                                      [currentUser.id]: 0,
                                    },
                                  }
                                : x
                            )
                          );
                          markMessagesRead(c.id, myUid).catch(() => {});
                        }}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[var(--accent-amber)]/15 border-l-2 border-[var(--accent-amber)]'
                            : 'hover:bg-[var(--card-inner-bg)] border-l-2 border-transparent'
                        }`}
                      >
                        <UserAvatar name={p?.name || 'Creator'} avatarUrl={p?.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p
                            className={`text-xs truncate ${
                              (Number(c.unreadCounts?.[myUid]) || Number(c.unreadCounts?.[currentUser.id]) || 0) > 0 &&
                              c.id !== selectedId
                                ? 'font-bold text-[var(--text-primary)]'
                                : 'font-semibold text-[var(--text-primary)]'
                            }`}
                          >
                            {p?.name || 'Creator'}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">
                            {c.lastMessageText || p?.primaryRole || 'Connected'}
                          </p>
                        </div>
                        {(() => {
                          const n =
                            Number(c.unreadCounts?.[myUid]) ||
                            Number(c.unreadCounts?.[currentUser.id]) ||
                            0;
                          if (n <= 0 || c.id === selectedId) return null;
                          return (
                            <span
                              className="shrink-0 ml-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] text-[10px] font-bold leading-none flex items-center justify-center"
                              aria-label={`${n} unread`}
                            >
                              {n > 99 ? '99+' : n}
                            </span>
                          );
                        })()}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Thread */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {selected ? (
              <>
                <div className="px-4 py-2 border-b border-[var(--card-border)] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {peer?.name || 'Conversation'}
                    </span>
                    {peerId && (
                      <button 
                        onClick={() => {
                          if (onNavigateToProfile) {
                            onNavigateToProfile(peerId);
                            onClose();
                          } else {
                            window.open(`/explore/${peerId}`, '_blank');
                          }
                        }}
                        className="text-[10px] text-[var(--accent-amber)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                      >
                        View Profile
                      </button>
                    )}
                  </div>
                  
                  {/* Collaboration Status Button */}
                  {selected.status === 'collaborating' ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 text-[10px] font-bold tracking-wider uppercase">
                      Collaborating
                    </span>
                  ) : selected.status === 'completed' ? (
                    <span className="px-3 py-1 rounded-full bg-[var(--card-inner-bg)] text-[var(--text-muted)] border border-[var(--card-inner-border)] text-[10px] font-bold tracking-wider uppercase">
                      Completed
                    </span>
                  ) : (
                    <button
                      onClick={handleToggleCollaboration}
                      disabled={selected.collaborateRequestedBy?.includes(currentUser.id)}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer shadow-sm ${
                        selected.collaborateRequestedBy?.includes(currentUser.id)
                          ? 'bg-[var(--card-inner-bg)] text-[var(--text-muted)] border border-[var(--card-inner-border)] cursor-not-allowed'
                          : 'bg-[var(--accent-amber)] text-[#181614] hover:opacity-90'
                      }`}
                    >
                      {selected.collaborateRequestedBy?.includes(currentUser.id)
                        ? 'Waiting for partner...'
                        : 'Collaborate'}
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {messages.length === 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] text-center py-8">
                      No messages yet. Say hello and start collaborating.
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = m.senderId === currentUser.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                            mine
                              ? 'bg-[var(--accent-amber)] text-[#181614] rounded-br-md'
                              : 'bg-[var(--card-inner-bg)] text-[var(--text-primary)] border border-[var(--card-inner-border)] rounded-bl-md'
                          }`}
                        >
                          {(m as any).sharedPost ? (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Shared Post</p>
                              {(m as any).sharedPost.imageUrl && (
                                <img
                                  src={(m as any).sharedPost.imageUrl}
                                  alt=""
                                  className="w-full max-h-36 object-cover rounded-xl"
                                />
                              )}
                              <p className="font-semibold line-clamp-2">
                                {(m as any).sharedPost.caption || 'Post'}
                              </p>
                              {(m as any).sharedPost.authorName && (
                                <p className="text-[10px] opacity-80">by {(m as any).sharedPost.authorName}</p>
                              )}
                              <a
                                href={(m as any).sharedPost.url || `/?post=${(m as any).sharedPost.postId}`}
                                className={`inline-block mt-1 text-[10px] font-bold underline ${mine ? 'text-[#181614]' : 'text-[var(--accent-amber)]'}`}
                              >
                                View Post
                              </a>
                            </div>
                          ) : (
                            m.text
                          )}
                          <div
                            className={`text-[9px] mt-1 ${
                              mine ? 'text-[#181614]/70' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {m.createdAt
                              ? new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                {error && (
                  <p className="px-4 text-[11px] text-red-500 shrink-0">{error}</p>
                )}
                <form
                  onSubmit={handleSend}
                  className="p-3 border-t border-[var(--card-border)] flex items-center gap-2 shrink-0"
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-amber)]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="p-2.5 rounded-xl bg-[var(--accent-amber)] text-[#181614] disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  Select a conversation to start messaging.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
