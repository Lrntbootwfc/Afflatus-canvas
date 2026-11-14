/**
 * WhatsApp-style messenger: 1:1 chats, groups/communities, media, mobile-first.
 * Place at: src/components/messaging/MessengerDrawer.tsx
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  MessageSquare,
  Send,
  Loader2,
  Users,
  Paperclip,
  ArrowLeft,
  Plus,
  Image as ImageIcon,
  FileText,
  Mic,
} from 'lucide-react';
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
import {
  uploadChatMedia,
  sendChatMessage,
  createGroup,
  subscribeToMyGroups,
  sendGroupMessage,
  subscribeToGroupMessages,
} from '../../lib/messagingApi';
import type { ChatGroup, ChatMessageDoc, MessageMedia } from '../../lib/messagingTypes';
import { UserAvatar } from '../UserAvatar';

interface MessengerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CreatorProfile;
  initialConnectionId?: string | null;
  onNavigateToProfile?: (creatorId: string) => void;
}

type PeerMap = Record<string, CreatorProfile | null>;
type TabKey = 'chats' | 'groups';

export const MessengerDrawer: React.FC<MessengerDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialConnectionId,
  onNavigateToProfile,
}) => {
  const [tab, setTab] = useState<TabKey>('chats');
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConnectionId || null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<(ChatMessage | ChatMessageDoc)[]>([]);
  const [peers, setPeers] = useState<PeerMap>({});
  const [draft, setDraft] = useState('');
  const [pendingMedia, setPendingMedia] = useState<MessageMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupKind, setGroupKind] = useState<'group' | 'community'>('group');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const myUid = auth.currentUser?.uid || currentUser.id;

  const accepted = useMemo(
    () =>
      connections.filter(
        (c) =>
          c.status === 'accepted' || c.status === 'collaborating' || c.status === 'completed'
      ),
    [connections]
  );

  const selected = accepted.find((c) => c.id === selectedId) || null;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const peerId = selected
    ? selected.senderId === currentUser.id
      ? selected.recipientId
      : selected.senderId
    : null;
  const peer = peerId ? peers[peerId] : null;

  const inThread = !!(selectedId || selectedGroupId);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingList(true);
    setError(null);
    if (!initialConnectionId) {
      setSelectedId(null);
      setSelectedGroupId(null);
      setMessages([]);
    }
    const unsub = subscribeToUserConnections(
      currentUser.id,
      (list) => {
        setConnections(list || []);
        setLoadingList(false);
      },
      (err) => {
        setError(sanitizeUserFacingError(err, 'Could not load chats'));
        setLoadingList(false);
      }
    );
    const unsubG = subscribeToMyGroups(
      myUid,
      (list) => setGroups(list || []),
      (err) => console.warn('[Messenger] groups', err)
    );
    return () => {
      unsub?.();
      unsubG?.();
    };
  }, [isOpen, currentUser.id, myUid, initialConnectionId]);

  useEffect(() => {
    if (initialConnectionId) {
      setSelectedId(initialConnectionId);
      setSelectedGroupId(null);
      setTab('chats');
    }
  }, [initialConnectionId]);

  // Load peer profiles
  useEffect(() => {
    const ids = new Set<string>();
    accepted.forEach((c) => {
      ids.add(c.senderId === currentUser.id ? c.recipientId : c.senderId);
    });
    ids.forEach(async (id) => {
      if (peers[id]) return;
      try {
        const p = await getProfileFromFirestore(id);
        setPeers((prev) => ({ ...prev, [id]: p }));
      } catch {
        setPeers((prev) => ({ ...prev, [id]: null }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, currentUser.id]);

  // Subscribe 1:1 messages
  useEffect(() => {
    if (!selectedId) return;
    setMessages([]);
    const unsub = subscribeToMessages(
      selectedId,
      (list) => setMessages(list || []),
      (err) => setError(sanitizeUserFacingError(err, 'Could not load messages'))
    );
    if (peerId) {
      markMessagesRead(selectedId, myUid).catch(() => {});
    }
    return () => unsub?.();
  }, [selectedId, peerId, myUid]);

  // Subscribe group messages
  useEffect(() => {
    if (!selectedGroupId) return;
    setMessages([]);
    const unsub = subscribeToGroupMessages(
      selectedGroupId,
      (list) => setMessages(list || []),
      (err) => setError(sanitizeUserFacingError(err, 'Could not load group messages'))
    );
    return () => unsub?.();
  }, [selectedGroupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const media = await uploadChatMedia(file);
      setPendingMedia(media);
    } catch (err: any) {
      setError(sanitizeUserFacingError(err, 'Could not attach file'));
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !pendingMedia) || sending) return;
    setSending(true);
    setError(null);
    try {
      if (selectedGroupId) {
        await sendGroupMessage({
          groupId: selectedGroupId,
          senderId: myUid,
          text,
          media: pendingMedia || undefined,
        });
      } else if (selectedId && peerId) {
        if (pendingMedia) {
          await sendChatMessage({
            connectionId: selectedId,
            senderId: myUid,
            recipientId: peerId,
            text,
            media: pendingMedia,
          });
        } else {
          await sendMessage({
            connectionId: selectedId,
            senderId: myUid,
            recipientId: peerId,
            text,
            senderName: currentUser.name,
          });
        }
      }
      setDraft('');
      setPendingMedia(null);
    } catch (err: any) {
      setError(sanitizeUserFacingError(err, 'Failed to send'));
    } finally {
      setSending(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setSending(true);
    try {
      const g = await createGroup({
        name: groupName.trim(),
        kind: groupKind,
        memberIds: groupMembers,
        createdBy: myUid,
      });
      setShowNewGroup(false);
      setGroupName('');
      setGroupMembers([]);
      setTab('groups');
      setSelectedGroupId(g.id);
      setSelectedId(null);
    } catch (err: any) {
      setError(sanitizeUserFacingError(err, 'Could not create group'));
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const renderMedia = (m?: MessageMedia | null) => {
    if (!m?.url) return null;
    if (m.kind === 'image') {
      return (
        <a href={m.url} target="_blank" rel="noreferrer" className="block mt-1">
          <img src={m.url} alt={m.fileName || 'image'} className="max-w-[220px] sm:max-w-[280px] rounded-lg max-h-56 object-cover" />
        </a>
      );
    }
    if (m.kind === 'video') {
      return (
        <video controls className="mt-1 max-w-[240px] sm:max-w-[320px] rounded-lg max-h-56" src={m.url} />
      );
    }
    if (m.kind === 'audio') {
      return <audio controls className="mt-1 w-full max-w-[260px]" src={m.url} />;
    }
    return (
      <a
        href={m.url}
        download={m.fileName}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-2 text-xs underline"
      >
        <FileText className="w-3.5 h-3.5" />
        {m.fileName || 'File'}
      </a>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />

      {/* Panel: full-screen on mobile, drawer on md+ */}
      <div className="relative w-full h-full md:max-w-md lg:max-w-lg bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-[var(--card-border)] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {inThread && (
              <button
                type="button"
                className="md:hidden p-2 rounded-full hover:bg-[var(--card-inner-bg)]"
                onClick={() => {
                  setSelectedId(null);
                  setSelectedGroupId(null);
                  setMessages([]);
                }}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <MessageSquare className="w-4 h-4 text-[var(--accent-amber)] shrink-0" />
            <h2 className="font-editorial text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">
              {selectedGroup
                ? selectedGroup.name
                : peer
                  ? peer.name || 'Chat'
                  : 'Messages'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!inThread && (
              <button
                type="button"
                title="New group"
                onClick={() => setShowNewGroup(true)}
                className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)]"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs — list mode only */}
        {!inThread && (
          <div className="flex border-b border-[var(--card-border)] shrink-0">
            {(['chats', 'groups'] as TabKey[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide ${
                  tab === t
                    ? 'text-[var(--accent-amber)] border-b-2 border-[var(--accent-amber)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {t === 'chats' ? 'Chats' : 'Groups & communities'}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          {/* Chat list — hidden on mobile when in a thread */}
          <div
            className={`${
              inThread ? 'hidden md:flex' : 'flex'
            } w-full md:w-[42%] md:max-w-[280px] flex-col border-r border-[var(--card-border)] min-h-0`}
          >
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : tab === 'chats' ? (
                accepted.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--text-muted)]">
                    No chats yet. Accept a connection to start messaging.
                  </p>
                ) : (
                  accepted.map((c) => {
                    const pid = c.senderId === currentUser.id ? c.recipientId : c.senderId;
                    const p = peers[pid];
                    const unread = Number((c as any).unreadCounts?.[myUid] || 0);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          setSelectedGroupId(null);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[var(--card-inner-bg)] border-b border-[var(--card-border)]/60 ${
                          selectedId === c.id ? 'bg-[var(--card-inner-bg)]' : ''
                        }`}
                      >
                        <UserAvatar
                          name={p?.name || '?'}
                          avatarUrl={(p as any)?.avatarUrl}
                          size="md" className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                              {p?.name || 'Creator'}
                            </span>
                            {unread > 0 && (
                              <span className="text-[10px] font-bold bg-[var(--accent-amber)] text-black rounded-full px-1.5">
                                {unread}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {(c as any).lastMessageText || p?.primaryRole || 'Connected'}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )
              ) : groups.length === 0 ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm text-[var(--text-muted)]">
                    No groups yet. Create a group or community with your connections.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewGroup(true)}
                    className="text-xs font-bold uppercase tracking-wide text-[var(--accent-amber)]"
                  >
                    + New group
                  </button>
                </div>
              ) : (
                groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(g.id);
                      setSelectedId(null);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[var(--card-inner-bg)] border-b border-[var(--card-border)]/60 ${
                      selectedGroupId === g.id ? 'bg-[var(--card-inner-bg)]' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[var(--card-inner-bg)] flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-[var(--accent-amber)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
                        {g.name}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {g.kind} · {g.memberIds?.length || 0} members
                        {g.lastMessageText ? ` · ${g.lastMessageText}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div
            className={`${
              inThread ? 'flex' : 'hidden md:flex'
            } flex-1 flex-col min-w-0 min-h-0 bg-[var(--app-bg,var(--card-bg))]`}
          >
            {!inThread ? (
              <div className="flex-1 flex items-center justify-center p-6 text-sm text-[var(--text-muted)] text-center">
                Select a chat or group to start messaging
              </div>
            ) : (
              <>
                {/* Peer / group header actions */}
                <div className="hidden md:flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)] shrink-0">
                  {selectedGroup ? (
                    <>
                      <Users className="w-4 h-4 text-[var(--accent-amber)]" />
                      <span className="text-sm font-semibold truncate">{selectedGroup.name}</span>
                      <span className="text-[10px] uppercase text-[var(--text-muted)]">
                        {selectedGroup.kind}
                      </span>
                    </>
                  ) : peer ? (
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0"
                      onClick={() => peer.id && onNavigateToProfile?.(peer.id)}
                    >
                      <UserAvatar name={peer.name} avatarUrl={(peer as any).avatarUrl} size="sm" />
                      <span className="text-sm font-semibold truncate">{peer.name}</span>
                    </button>
                  ) : null}
                </div>

                <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-3 space-y-2">
                  {messages.map((msg) => {
                    const mine = msg.senderId === myUid;
                    const media = (msg as any).media as MessageMedia | undefined;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? 'bg-[var(--accent-amber)] text-black rounded-br-md'
                              : 'bg-[var(--card-inner-bg)] text-[var(--text-primary)] rounded-bl-md'
                          }`}
                        >
                          {msg.text && !(media && msg.text.startsWith('Sent ')) && (
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          )}
                          {renderMedia(media)}
                          <p
                            className={`text-[10px] mt-1 ${
                              mine ? 'text-black/60' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Composer */}
                <div className="border-t border-[var(--card-border)] p-2 sm:p-3 shrink-0 safe-area-pb">
                  {pendingMedia && (
                    <div className="mb-2 flex items-center gap-2 text-xs bg-[var(--card-inner-bg)] rounded-lg px-2 py-1.5">
                      {pendingMedia.kind === 'image' ? (
                        <ImageIcon className="w-3.5 h-3.5" />
                      ) : pendingMedia.kind === 'audio' ? (
                        <Mic className="w-3.5 h-3.5" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      <span className="truncate flex-1">{pendingMedia.fileName || pendingMedia.kind}</span>
                      <button type="button" className="underline" onClick={() => setPendingMedia(null)}>
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5 sm:gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
                      onChange={onPickFile}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="p-2.5 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] shrink-0"
                      title="Attach"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={1}
                      placeholder="Message"
                      className="flex-1 resize-none rounded-2xl bg-[var(--card-inner-bg)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--text-primary)] max-h-28 min-h-[40px]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={sending || (!draft.trim() && !pendingMedia)}
                      onClick={handleSend}
                      className="p-2.5 rounded-full bg-[var(--accent-amber)] text-black disabled:opacity-40 shrink-0"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* New group modal */}
        {showNewGroup && (
          <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/50 p-3">
            <div className="w-full max-w-md rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 space-y-3">
              <h3 className="font-bold text-[var(--text-primary)]">New group / community</h3>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-inner-bg)] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                {(['group', 'community'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setGroupKind(k)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${
                      groupKind === k
                        ? 'bg-[var(--accent-amber)] text-black'
                        : 'bg-[var(--card-inner-bg)] text-[var(--text-muted)]'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)]">Add members from your connections</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {accepted.map((c) => {
                  const pid = c.senderId === currentUser.id ? c.recipientId : c.senderId;
                  const p = peers[pid];
                  const on = groupMembers.includes(pid);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--card-inner-bg)] text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setGroupMembers((prev) =>
                            on ? prev.filter((x) => x !== pid) : [...prev, pid]
                          )
                        }
                      />
                      <span className="truncate">{p?.name || pid}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-2 text-xs font-bold uppercase text-[var(--text-muted)]"
                  onClick={() => setShowNewGroup(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!groupName.trim() || sending}
                  onClick={handleCreateGroup}
                  className="px-4 py-2 rounded-full bg-[var(--accent-amber)] text-black text-xs font-bold uppercase disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessengerDrawer;
