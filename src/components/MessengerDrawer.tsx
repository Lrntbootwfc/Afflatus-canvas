/**
 * WhatsApp-inspired Messenger with persistent Chats / Groups / Communities navigation.
 * Navigation remains visible when a conversation is open (desktop split; mobile back + tabs).
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
  Search,
  Hash,
  User,
} from 'lucide-react';
import type { CreatorProfile } from '../../types';
import {
  getProfileFromFirestore,
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
/** Primary sections — always independently accessible */
type SectionKey = 'chats' | 'groups' | 'communities';

type UnifiedItem =
  | {
      kind: 'dm';
      id: string;
      name: string;
      preview: string;
      at: string;
      unread: number;
      peerId: string;
      peer: CreatorProfile | null;
      connection: ConnectionRequest;
    }
  | {
      kind: 'group' | 'community';
      id: string;
      name: string;
      preview: string;
      at: string;
      unread: number;
      group: ChatGroup;
      memberCount: number;
    };

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const MessengerDrawer: React.FC<MessengerDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialConnectionId,
  onNavigateToProfile,
}) => {
  const [section, setSection] = useState<SectionKey>('chats');
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
  const [search, setSearch] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const myUid = auth.currentUser?.uid || currentUser.id;

  const accepted = useMemo(
    () =>
      (connections || []).filter(
        (c) =>
          c.status === 'accepted' ||
          c.status === 'collaborating' ||
          c.status === 'completed' ||
          c.kind === 'message_request'
      ),
    [connections]
  );

  const pureGroups = useMemo(
    () => (groups || []).filter((g) => (g.kind || 'group') !== 'community'),
    [groups]
  );
  const communities = useMemo(
    () => (groups || []).filter((g) => g.kind === 'community'),
    [groups]
  );

  const selected = accepted.find((c) => c.id === selectedId) || null;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const peerId = selected
    ? selected.senderId === currentUser.id
      ? selected.recipientId
      : selected.senderId
    : null;
  const peer = peerId ? peers[peerId] ?? null : null;
  const inThread = !!(selectedId || selectedGroupId);

  // List subscriptions — stay alive while drawer is open (do not drop on section switch)
  useEffect(() => {
    if (!isOpen) return;
    setLoadingList(true);
    setError(null);
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
  }, [isOpen, currentUser.id, myUid]);

  useEffect(() => {
    if (initialConnectionId) {
      setSelectedId(initialConnectionId);
      setSelectedGroupId(null);
      setSection('chats');
    }
  }, [initialConnectionId]);

  // Peer profiles for DMs
  useEffect(() => {
    const ids = new Set<string>();
    accepted.forEach((c) => {
      ids.add(c.senderId === currentUser.id ? c.recipientId : c.senderId);
    });
    ids.forEach(async (id) => {
      if (peers[id] !== undefined) return;
      try {
        const p = await getProfileFromFirestore(id);
        setPeers((prev) => ({ ...prev, [id]: p }));
      } catch {
        setPeers((prev) => ({ ...prev, [id]: null }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, currentUser.id]);

  // 1:1 messages
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

  // Group / community messages
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

  const buildUnifiedChats = (): UnifiedItem[] => {
    const items: UnifiedItem[] = [];
    accepted.forEach((c) => {
      const pid = c.senderId === currentUser.id ? c.recipientId : c.senderId;
      const p = peers[pid] ?? null;
      items.push({
        kind: 'dm',
        id: c.id,
        name: p?.name || 'Chat',
        preview: String((c as any).lastMessageText || ''),
        at: String((c as any).lastMessageAt || c.updatedAt || c.createdAt || ''),
        unread: Number((c as any).unreadCounts?.[myUid] || 0),
        peerId: pid,
        peer: p,
        connection: c,
      });
    });
    // Groups + communities also appear in unified Chats (WhatsApp-style)
    groups.forEach((g) => {
      const k = g.kind === 'community' ? 'community' : 'group';
      items.push({
        kind: k,
        id: g.id,
        name: g.name,
        preview: String(g.lastMessageText || g.description || ''),
        at: String(g.lastMessageAt || g.updatedAt || g.createdAt || ''),
        unread: 0,
        group: g,
        memberCount: Array.isArray(g.memberIds) ? g.memberIds.length : 0,
      });
    });
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return items;
  };

  const listItems = useMemo(() => {
    let items: UnifiedItem[] = [];
    if (section === 'chats') items = buildUnifiedChats();
    else if (section === 'groups') {
      items = pureGroups.map((g) => ({
        kind: 'group' as const,
        id: g.id,
        name: g.name,
        preview: String(g.lastMessageText || g.description || ''),
        at: String(g.lastMessageAt || g.updatedAt || g.createdAt || ''),
        unread: 0,
        group: g,
        memberCount: Array.isArray(g.memberIds) ? g.memberIds.length : 0,
      }));
    } else {
      items = communities.map((g) => ({
        kind: 'community' as const,
        id: g.id,
        name: g.name,
        preview: String(g.description || g.lastMessageText || ''),
        at: String(g.lastMessageAt || g.updatedAt || g.createdAt || ''),
        unread: 0,
        group: g,
        memberCount: Array.isArray(g.memberIds) ? g.memberIds.length : 0,
      }));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.preview.toLowerCase().includes(q)
      );
    }
    if (filterUnread) items = items.filter((i) => i.unread > 0);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, accepted, groups, pureGroups, communities, peers, search, filterUnread, myUid, currentUser.id]);

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
      setSection(g.kind === 'community' ? 'communities' : 'groups');
      setSelectedGroupId(g.id);
      setSelectedId(null);
    } catch (err: any) {
      setError(sanitizeUserFacingError(err, 'Could not create group'));
    } finally {
      setSending(false);
    }
  };

  const openDm = (id: string) => {
    setSelectedId(id);
    setSelectedGroupId(null);
  };
  const openGroup = (id: string) => {
    setSelectedGroupId(id);
    setSelectedId(null);
  };
  const closeThread = () => {
    setSelectedId(null);
    setSelectedGroupId(null);
    setMessages([]);
  };

  const switchSection = (s: SectionKey) => {
    setSection(s);
    // Keep current conversation open — do not force-close (critical requirement)
  };

  if (!isOpen) return null;

  const renderMedia = (m?: MessageMedia | null) => {
    if (!m?.url) return null;
    if (m.kind === 'image') {
      return (
        <a href={m.url} target="_blank" rel="noreferrer" className="block mt-1">
          <img
            src={m.url}
            alt={m.fileName || 'image'}
            className="max-w-[220px] sm:max-w-[280px] rounded-lg max-h-56 object-cover"
          />
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

  const SectionTabs = (
    <div className="flex border-b border-[var(--card-border)] shrink-0" role="tablist">
      {(
        [
          { key: 'chats' as const, label: 'Chats', icon: MessageSquare },
          { key: 'groups' as const, label: 'Groups', icon: Users },
          { key: 'communities' as const, label: 'Communities', icon: Hash },
        ] as const
      ).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={section === key}
          onClick={() => switchSection(key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-colors ${
            section === key
              ? 'text-[var(--accent-amber)] border-b-2 border-[var(--accent-amber)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );

  const ListPane = (
    <div className="flex flex-col min-h-0 h-full">
      {SectionTabs}
      <div className="px-2 py-2 flex gap-2 items-center border-b border-[var(--card-border)] shrink-0">
        <div className="flex-1 flex items-center gap-2 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-xs text-[var(--input-text)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterUnread((v) => !v)}
          className={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-md border shrink-0 ${
            filterUnread
              ? 'border-[var(--accent-amber)] text-[var(--accent-amber)] bg-[var(--accent-secondary-subtle)]'
              : 'border-[var(--card-border)] text-[var(--text-muted)]'
          }`}
        >
          Unread
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loadingList ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : listItems.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-[var(--text-muted)]">
              {section === 'chats'
                ? 'No conversations yet.'
                : section === 'groups'
                  ? 'You are not in any groups yet.'
                  : 'You are not in any communities yet.'}
            </p>
            {(section === 'groups' || section === 'communities') && (
              <button
                type="button"
                onClick={() => {
                  setGroupKind(section === 'communities' ? 'community' : 'group');
                  setShowNewGroup(true);
                }}
                className="btn-accent amber-pill-btn mt-2 px-4 py-2 rounded-full text-xs font-bold"
              >
                Create {section === 'communities' ? 'community' : 'group'}
              </button>
            )}
          </div>
        ) : (
          listItems.map((item) => {
            const active =
              (item.kind === 'dm' && selectedId === item.id) ||
              ((item.kind === 'group' || item.kind === 'community') && selectedGroupId === item.id);
            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => {
                  if (item.kind === 'dm') openDm(item.id);
                  else openGroup(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-[var(--card-border)]/40 ${
                  active
                    ? 'bg-[var(--nav-item-hover)]'
                    : 'hover:bg-[var(--card-inner-bg)]'
                }`}
              >
                <div className="relative shrink-0">
                  {item.kind === 'dm' ? (
                    <UserAvatar
                      name={item.name}
                      src={(item.peer as any)?.avatarUrl || (item.peer as any)?.photoURL}
                      size="md"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--card-inner-bg)] border border-[var(--card-border)] flex items-center justify-center">
                      {item.kind === 'community' ? (
                        <Hash className="w-4 h-4 text-[var(--accent-amber)]" />
                      ) : (
                        <Users className="w-4 h-4 text-[var(--accent-amber)]" />
                      )}
                    </div>
                  )}
                  {item.unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-amber)] text-[var(--btn-on-accent)] text-[9px] font-bold flex items-center justify-center">
                      {item.unread > 99 ? '99+' : item.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate flex items-center gap-1">
                      {item.kind === 'group' && (
                        <Users className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                      )}
                      {item.kind === 'community' && (
                        <Hash className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                      )}
                      {item.kind === 'dm' && (
                        <User className="w-3 h-3 text-[var(--text-muted)] shrink-0 opacity-0" />
                      )}
                      {item.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                      {formatTime(item.at)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {item.kind !== 'dm' && item.memberCount > 0
                      ? `${item.memberCount} members · ${item.preview || 'No messages yet'}`
                      : item.preview || 'No messages yet'}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const ThreadPane = (
    <div className="flex flex-col min-h-0 h-full flex-1">
      {/* Conversation header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--card-border)] shrink-0">
        <button
          type="button"
          className="md:hidden p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-primary)]"
          onClick={closeThread}
          aria-label="Back to list"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {selectedGroup ? (
          <>
            <div className="w-9 h-9 rounded-full bg-[var(--card-inner-bg)] border border-[var(--card-border)] flex items-center justify-center shrink-0">
              {selectedGroup.kind === 'community' ? (
                <Hash className="w-4 h-4 text-[var(--accent-amber)]" />
              ) : (
                <Users className="w-4 h-4 text-[var(--accent-amber)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                {selectedGroup.name}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {selectedGroup.kind === 'community' ? 'Community' : 'Group'} ·{' '}
                {Array.isArray(selectedGroup.memberIds) ? selectedGroup.memberIds.length : 0}{' '}
                members
                {selectedGroup.description ? ` · ${selectedGroup.description}` : ''}
              </p>
            </div>
          </>
        ) : peer ? (
          <>
            <button
              type="button"
              className="shrink-0"
              onClick={() => peerId && onNavigateToProfile?.(peerId)}
            >
              <UserAvatar
                name={peer.name}
                src={(peer as any)?.avatarUrl || (peer as any)?.photoURL}
                size="md"
              />
            </button>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                {peer.name || 'Chat'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Direct message</p>
            </div>
          </>
        ) : (
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Conversation</h3>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--text-muted)]">
              No messages yet. Say hello.
            </p>
          </div>
        ) : (
          messages.map((m: any) => {
            const mine = m.senderId === myUid;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                    mine
                      ? 'bg-[var(--accent-amber)] text-[var(--btn-on-accent)] rounded-br-md'
                      : 'bg-[var(--card-inner-bg)] text-[var(--text-primary)] border border-[var(--card-border)] rounded-bl-md'
                  }`}
                >
                  {!mine && selectedGroupId && (
                    <p className="text-[10px] font-bold opacity-70 mb-0.5">
                      {m.senderName || m.senderId?.slice(0, 8) || 'Member'}
                    </p>
                  )}
                  {m.text ? <p className="whitespace-pre-wrap">{m.text}</p> : null}
                  {renderMedia(m.media)}
                  <p
                    className={`text-[10px] mt-1 ${
                      mine ? 'opacity-70' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--card-border)] p-2 sm:p-3 shrink-0 space-y-2">
        {pendingMedia && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] px-1">
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="truncate flex-1">{pendingMedia.fileName || pendingMedia.kind}</span>
            <button
              type="button"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => setPendingMedia(null)}
            >
              Remove
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-2.5 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] shrink-0"
            aria-label="Attach"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Type a message"
            className="flex-1 resize-none rounded-2xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] text-sm px-3 py-2.5 outline-none focus:border-[var(--accent-amber)] max-h-28 min-h-[40px]"
          />
          <button
            type="button"
            disabled={sending || (!draft.trim() && !pendingMedia)}
            onClick={handleSend}
            className="btn-accent amber-pill-btn p-2.5 rounded-full shrink-0 disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      {/* Wider panel on desktop for split list + conversation */}
      <div className="relative w-full h-full md:max-w-3xl lg:max-w-4xl bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl flex flex-col text-[var(--text-primary)]">
        {/* Global header — always shows section context + close */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-[var(--card-border)] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[var(--accent-amber)] shrink-0" />
            <h2 className="font-editorial text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">
              Messages
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="New group or community"
              onClick={() => setShowNewGroup(true)}
              className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
            {error}
          </div>
        )}

        {/* Body: list always available; conversation alongside on md+ */}
        <div className="flex-1 min-h-0 flex">
          {/* List column — ALWAYS mounted so Chats/Groups/Communities tabs stay reachable */}
          <div
            className={`${
              inThread ? 'hidden md:flex' : 'flex'
            } w-full md:w-[38%] md:max-w-[320px] flex-col border-r border-[var(--card-border)] min-h-0`}
          >
            {ListPane}
          </div>

          {/* Conversation column */}
          <div
            className={`${
              inThread ? 'flex' : 'hidden md:flex'
            } flex-1 flex-col min-h-0 min-w-0`}
          >
            {inThread ? (
              ThreadPane
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm px-6 text-center">
                Select a conversation from Chats, Groups, or Communities.
              </div>
            )}
          </div>
        </div>

        {/* Mobile: when in thread, still expose section switcher as a compact bar */}
        {inThread && (
          <div className="md:hidden border-t border-[var(--card-border)] shrink-0">
            {SectionTabs}
          </div>
        )}

        {/* New group / community modal */}
        {showNewGroup && (
          <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/50 p-3">
            <div className="w-full max-w-md rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="font-editorial font-bold text-[var(--text-primary)]">
                  Create {groupKind === 'community' ? 'community' : 'group'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewGroup(false)}
                  className="p-1 text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                {(['group', 'community'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setGroupKind(k)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase border ${
                      groupKind === k
                        ? 'border-[var(--accent-amber)] text-[var(--accent-amber)] bg-[var(--accent-secondary-subtle)]'
                        : 'border-[var(--card-border)] text-[var(--text-muted)]'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] text-sm px-3 py-2 outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                You will be added as admin. Invite more members from the conversation later.
              </p>
              <button
                type="button"
                disabled={sending || !groupName.trim()}
                onClick={handleCreateGroup}
                className="btn-accent amber-pill-btn w-full py-2.5 rounded-full text-xs font-bold disabled:opacity-50"
              >
                {sending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessengerDrawer;
