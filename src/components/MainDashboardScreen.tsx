import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  UserCheck,
  Compass,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  MessageSquare,
  Plus,
  PanelLeft,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import type { CreatorProfile } from '../types';
import { CreatorCard } from './explore/CreatorCard';
import {
  createConnectionRequest,
  getConnectionsForUser,
  respondToConnection,
  getProfileFromFirestore,
  listAiMatchConversations,
  createAiMatchConversation,
  getAiMatchConversation,
  saveAiMatchConversation,
  renameAiMatchConversation,
  deleteAiMatchConversation,
  type ConnectionRequest,
  type AiMatchConversationMeta,
} from '../lib/firebase';
import { affilApi } from '../lib/affilApi';

interface MainDashboardScreenProps {
  currentUser: CreatorProfile;
  onEditProfile: () => void;
  onUpdateCurrentUser?: (updated: CreatorProfile) => void;
  onNavigateToExplore?: (
    tab?: string,
    category?: string,
    search?: string,
    entity?: { type: 'creator'; id: string } | null
  ) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: CreatorProfile[];
  requirements?: any; // The structured JSON from Gemini
}

export const MainDashboardScreen: React.FC<MainDashboardScreenProps> = ({
  currentUser,
  onEditProfile,
  onUpdateCurrentUser,
  onNavigateToExplore,
}) => {
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationList, setConversationList] = useState<AiMatchConversationMeta[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Active location for THIS conversation only (not profile memory) */
  const [sessionLocation, setSessionLocation] = useState<string | null>(null);

  // Connections State (Secondary Section)
  const [incomingConnections, setIncomingConnections] = useState<ConnectionRequest[]>([]);
  const [isRespondingId, setIsRespondingId] = useState<string | null>(null);
  const [showRequestsModal, setShowRequestsModal] = useState<boolean>(false);
  const [peerProfiles, setPeerProfiles] = useState<Record<string, CreatorProfile>>({});

  // Proposal State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const refreshConversationList = async () => {
    if (!currentUser?.id) return;
    setHistoryLoading(true);
    try {
      const list = await listAiMatchConversations(currentUser.id);
      setConversationList(list);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    refreshConversationList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const persistMessages = async (msgs: ChatMessage[], convId: string) => {
    try {
      await saveAiMatchConversation(
        currentUser.id,
        convId,
        msgs.map((m) => ({
          role: m.role,
          content: m.content,
          results: m.results,
          requirements: m.requirements,
        })),
        undefined,
        sessionLocation
      );
      await refreshConversationList();
    } catch (err) {
      console.warn('[AI Match] persist failed', err);
    }
  };

  const ensureConversation = async (firstUserText?: string) => {
    if (conversationId) return conversationId;
    const created = await createAiMatchConversation(
      currentUser.id,
      firstUserText ? firstUserText.slice(0, 48) : undefined
    );
    setConversationId(created.id);
    return created.id;
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setHistoryOpen(false);
  };

  const openConversation = async (id: string) => {
    const full = await getAiMatchConversation(currentUser.id, id);
    if (!full) return;
    setConversationId(full.id);
    setSessionLocation((full as any).sessionLocation || null);
    setMessages(
      (full.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        results: (m.results as any) || undefined,
        requirements: m.requirements,
      }))
    );
    setHistoryOpen(false);
  };

  const handleRenameConversation = async (id: string, currentTitle: string) => {
    const next = window.prompt('Rename conversation', currentTitle || '');
    if (next === null) return;
    const title = next.trim();
    if (!title) return;
    try {
      await renameAiMatchConversation(currentUser.id, id, title);
      await refreshConversationList();
    } catch (e: any) {
      showToast(e?.message || 'Could not rename');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!window.confirm('Delete this conversation permanently?')) return;
    try {
      await deleteAiMatchConversation(currentUser.id, id);
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
        setSessionLocation(null);
      }
      await refreshConversationList();
    } catch (e: any) {
      showToast(e?.message || 'Could not delete');
    }
  };

  const groupConversations = () => {
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startYesterday = startToday - 86400000;
    const groups: { label: string; items: AiMatchConversationMeta[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous', items: [] },
    ];
    for (const c of conversationList) {
      const t0 = Date.parse(c.updatedAt || c.createdAt || '') || 0;
      if (t0 >= startToday) groups[0].items.push(c);
      else if (t0 >= startYesterday) groups[1].items.push(c);
      else groups[2].items.push(c);
    }
    return groups.filter((g) => g.items.length > 0);
  };

  useEffect(() => {
    // Fetch incoming connections for the secondary section
    const fetchConnections = async () => {
      try {
        const conns = await getConnectionsForUser(currentUser.id);
        const pending = conns.filter((c) => c.recipientId === currentUser.id && c.status === 'pending');
        setIncomingConnections(pending);

        if (pending.length > 0) {
          // Fetch profiles for the senders
          const profiles: Record<string, CreatorProfile> = {};
          await Promise.all(
            pending.map(async (c) => {
              try {
                const profile = await getProfileFromFirestore(c.senderId);
                if (profile) profiles[c.senderId] = profile;
              } catch (e) {
                // ignore
              }
            })
          );
          setPeerProfiles(profiles);
        }
      } catch (err) {
        console.error('Failed to load connections:', err);
      }
    };
    fetchConnections();
  }, [currentUser.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRespondConnection = async (connId: string, status: 'accepted' | 'declined') => {
    setIsRespondingId(connId);
    try {
      await respondToConnection(connId, status, currentUser.id);
      setIncomingConnections((prev) => prev.filter((c) => c.id !== connId));
      showToast(status === 'accepted' ? 'Connection accepted.' : 'Connection declined.');
    } catch (err: any) {
      showToast(err?.message || 'Could not update connection.');
    } finally {
      setIsRespondingId(null);
    }
  };

  const handleConnectCreator = async (creator: CreatorProfile, message: string = '') => {
    try {
      const msg = message || `Hi ${creator.name}, I discovered you via AI Match and would love to connect.`;
      const { alreadyExists } = await createConnectionRequest({
        senderId: currentUser.id,
        recipientId: creator.id,
        message: msg,
      });
      if (alreadyExists) {
        showToast(`You already sent a proposal to ${creator.name}.`);
      } else {
        showToast(`Proposal sent successfully to ${creator.name}!`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Error sending proposal.');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMsg = inputValue.trim();
    setInputValue('');

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userMsg }
    ];
    setMessages(newMessages);
    setIsTyping(true);

    try {
      // Send the entire chat history for context
      const chatHistory = newMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const profileLoc = (currentUser.location || (currentUser as any).city || '').trim();
      const res = await fetch('/api/recommendations/ai-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          messages: chatHistory,
          sessionLocation: sessionLocation || undefined,
          defaultLocation: profileLoc || undefined,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get recommendations');
      }

      if (data.outOfScope || data.conversational) {
        const withAssistant: ChatMessage[] = [
          ...newMessages,
          {
            role: 'assistant',
            content:
              data.message ||
              (data.conversational
                ? "Tell me a role and city when you want matches — e.g. \"cinematographer in Mumbai\"."
                : "I'm Afflatus AI Match — ask me about finding creators or using Afflatus."),
          },
        ];
        setMessages(withAssistant);
        try {
          const cid = await ensureConversation(userMsg);
          await persistMessages(withAssistant, cid);
        } catch {}
        return;
      }

      const creatorsFound = (data.candidates || []).map((c: any) => {
        const raw = typeof c.score === 'number' ? c.score : 0;
        const relevanceScore = raw > 1 ? raw / 100 : raw;
        const profile = c.profile || {};
        return {
          ...profile,
          id: profile.id || c.creatorId || c.userId,
          relevanceScore,
          discoveryReason: Array.isArray(c.matchReasons)
            ? c.matchReasons.filter(Boolean).join(' • ')
            : c.discoveryReason || profile.discoveryReason,
        };
      });

      // Update session location from server active location (explicit or session)
      if (data.activeLocation) {
        setSessionLocation(String(data.activeLocation));
      }

      let assistantResponse = '';
      const relaxed: string[] = Array.isArray(data.relaxed) ? data.relaxed : [];
      const locationNotes: string[] = [];
      if (data.locationSource === 'profile' && data.activeLocation) {
        locationNotes.push(
          `Location wasn't mentioned, so I used your profile location (${data.activeLocation}) as the default.`
        );
      } else if (data.locationSource === 'session' && data.activeLocation) {
        locationNotes.push(`Still searching in ${data.activeLocation} from earlier in this chat.`);
      }
      const relaxNote =
        relaxed.length > 0
          ? ` No exact match for every constraint — relaxed: ${relaxed.join(', ').replace(/_/g, ' ')}.`
          : '';
      const locPrefix = locationNotes.length ? locationNotes.join(' ') + ' ' : '';
      if (creatorsFound.length === 0) {
        assistantResponse =
          locPrefix +
          "I couldn't find anyone matching those criteria in the network. Try a different role, a nearby city, or broaden the request.";
      } else if (creatorsFound.length === 1) {
        assistantResponse = locPrefix + `I found 1 creator matching your criteria.${relaxNote}`;
      } else {
        assistantResponse =
          locPrefix + `I found ${creatorsFound.length} creators matching your criteria.${relaxNote} Here are the top matches:`;
      }

      const withAssistant: ChatMessage[] = [
        ...newMessages,
        {
          role: 'assistant',
          content: assistantResponse,
          results: creatorsFound,
          requirements: data.understanding
        }
      ];
      setMessages(withAssistant);
      try {
        const cid = await ensureConversation(userMsg);
        await persistMessages(withAssistant, cid);
      } catch (persistErr) {
        console.warn(persistErr);
      }

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I encountered an error trying to process that request. Please try again."
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="w-full min-h-[100dvh] py-4 sm:py-8 px-3 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-4 sm:space-y-8 animate-in fade-in duration-200 flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      
      {/* Top Bar: Profile Actions & Connections */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-[var(--card-border)]">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <div className="bg-[var(--card-inner-bg)] px-4 py-2 rounded-2xl border border-[var(--card-inner-border)] flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent-amber)]/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[var(--accent-amber)]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Workspace</p>
              <p className="text-xs font-semibold text-[var(--text-primary)]">Afflatus AI Match</p>
            </div>
          </div>

          <button
            onClick={onEditProfile}
            className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Edit Profile
          </button>
        </div>

        {incomingConnections.length > 0 && (
          <button
            onClick={() => setShowRequestsModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold shrink-0 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>{incomingConnections.length} New Request{incomingConnections.length !== 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

      {/* Chat + history */}
      <div className="flex-1 flex flex-col sm:flex-row gap-3 min-h-[min(70dvh,520px)] sm:min-h-[600px] max-h-[calc(100dvh-8rem)] sm:max-h-[80vh]">
        {/* History sidebar */}
        <aside
          className={`${historyOpen ? 'flex' : 'hidden'} sm:flex w-full sm:w-56 shrink-0 flex-col bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden`}
        >
          <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> History
            </span>
            <button type="button" onClick={startNewConversation} className="text-[10px] font-bold text-[var(--accent-amber)] hover:underline">
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-thin">
            {historyLoading && (
              <p className="text-[10px] text-[var(--text-muted)] px-2">Loading…</p>
            )}
            {!historyLoading && conversationList.length === 0 && (
              <p className="text-[10px] text-[var(--text-muted)] px-2">No saved chats yet.</p>
            )}
            {groupConversations().map((g) => (
              <div key={g.label}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-2 mb-1">{g.label}</p>
                <div className="space-y-0.5">
                  {g.items.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center gap-1 rounded-xl ${
                        conversationId === c.id
                          ? 'bg-[var(--accent-amber)]/15 border border-[var(--accent-amber)]/30'
                          : 'hover:bg-[var(--card-inner-bg)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        className="flex-1 min-w-0 text-left px-2.5 py-2 text-[11px] truncate text-[var(--text-secondary)]"
                        title={c.title}
                      >
                        {c.title}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 p-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameConversation(c.id, c.title);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="shrink-0 p-1 pr-2 text-[9px] text-[var(--text-muted)] hover:text-red-500"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(c.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col bg-[var(--card-bg)] rounded-2xl sm:rounded-3xl border border-[var(--card-border)] shadow-xl overflow-hidden min-h-0">
        
        {/* Chat Header */}
        <div className="p-4 border-b border-[var(--card-border)] bg-[var(--card-inner-bg)]/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent-amber)]" />
            <h2 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Collaboration Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="sm:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]"
              aria-label="Chat history"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={startNewConversation}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
        </div>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-[var(--text-muted)] animate-in slide-in-from-bottom-4 duration-500">
              <div className="w-16 h-16 rounded-3xl bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] flex items-center justify-center shadow-inner">
                <Sparkles className="w-8 h-8 text-[var(--accent-amber)]" />
              </div>
              <div className="space-y-2">
                <h3 className="font-editorial text-2xl font-bold text-[var(--text-primary)]">What are you looking for?</h3>
                <p className="text-sm max-w-md mx-auto">
                  Describe your ideal collaborator. Include roles, location, experience, and personality traits.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <button onClick={() => setInputValue("Find me a highly creative Director in Mumbai")} className="px-3 py-1.5 rounded-full text-xs bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] hover:border-[var(--accent-amber)] transition-colors">
                  "Find me a highly creative Director in Mumbai"
                </button>
                <button onClick={() => setInputValue("I need a reliable gaffer who handles feedback well")} className="px-3 py-1.5 rounded-full text-xs bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] hover:border-[var(--accent-amber)] transition-colors">
                  "I need a reliable gaffer who handles feedback well"
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
                
                {/* Text Bubble */}
                <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] font-medium rounded-br-sm'
                    : 'bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] text-[var(--text-primary)] rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>

                {/* Optional Structured JSON Debug (for Assistant) */}
                {msg.role === 'assistant' && msg.requirements && (
                  <div className="pl-2">
                    <details className="text-[10px] font-mono text-[var(--text-muted)] cursor-pointer">
                      <summary className="hover:text-[var(--accent-amber)]">View AI Understanding</summary>
                      <pre className="mt-2 p-2 bg-black/20 rounded-lg overflow-x-auto">
                        {JSON.stringify(msg.requirements, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {/* Inline Creator Results Grid */}
                {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                  <div className="w-full mt-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {msg.results.map((creator) => {
                        const pct =
                          typeof creator.relevanceScore === 'number'
                            ? Math.round(
                                creator.relevanceScore <= 1
                                  ? creator.relevanceScore * 100
                                  : creator.relevanceScore
                              )
                            : null;
                        const secondary = (creator.secondaryRoles || []).slice(0, 2).join(', ');
                        return (
                          <div
                            key={creator.id}
                            className="rounded-2xl border border-[var(--card-inner-border)] bg-[var(--card-inner-bg)] p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--app-bg)] border border-[var(--card-border)] shrink-0 flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                                {creator.avatarUrl ? (
                                  <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  (creator.name || '?').charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{creator.name || 'Creator'}</p>
                                  {pct != null && (
                                    <span className="shrink-0 text-[10px] font-mono font-bold text-[var(--accent-amber)]">{pct}%</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] truncate">
                                  {creator.primaryRole || 'Creator'}
                                  {secondary ? ` · ${secondary}` : ''}
                                  {creator.location ? ` · ${creator.location}` : ''}
                                </p>
                              </div>
                            </div>
                            {creator.discoveryReason && (
                              <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2">{creator.discoveryReason}</p>
                            )}
                            <div className="flex gap-2 mt-auto">
                              <button
                                type="button"
                                onClick={() => handleConnectCreator(creator)}
                                className="flex-1 text-[10px] font-bold uppercase tracking-wide py-1.5 rounded-full bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)]"
                              >
                                Connect
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const cid = creator.id || (creator as any).creatorId;
                                  if (onNavigateToExplore && cid) {
                                    onNavigateToExplore('creators', undefined, undefined, {
                                      type: 'creator',
                                      id: cid,
                                    });
                                  } else if (onNavigateToExplore) {
                                    onNavigateToExplore('creators', undefined, creator.name);
                                  } else {
                                    showToast(`Open Explore to view ${creator.name}`);
                                  }
                                }}
                                className="flex-1 text-[10px] font-bold uppercase tracking-wide py-1.5 rounded-full border border-[var(--card-border)] text-[var(--text-secondary)]"
                              >
                                Profile
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {isTyping && (
            <div className="flex items-start">
              <div className="px-4 py-3 rounded-2xl bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] rounded-bl-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--card-inner-bg)]/30">
          <form onSubmit={handleSendMessage} className="relative max-w-4xl mx-auto flex items-end gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask Afflatus..."
              rows={inputValue.split('\n').length > 1 ? Math.min(inputValue.split('\n').length, 5) : 1}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-4 pr-12 py-3.5 text-sm text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none scrollbar-none transition-all"
              style={{ minHeight: '52px' }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="absolute right-2 bottom-2 p-2 rounded-xl bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              AI Match interprets your needs deterministically. Results are strictly filtered and scored.
            </span>
          </div>
        </div>
      </div>
      </div>

      {/* Global Toast */}
      {toastMessage && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-[var(--card-inner-bg)] border border-[var(--card-border)] shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold text-[var(--text-primary)]">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Pending Requests Modal */}
      {showRequestsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card-warm-white w-full max-w-lg rounded-3xl border border-[var(--card-border)] shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)] shrink-0">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[var(--accent-amber)]" />
                <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Pending Requests</h3>
              </div>
              <button
                onClick={() => setShowRequestsModal(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-4 space-y-4">
              {incomingConnections.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                  No pending requests right now.
                </div>
              ) : (
                incomingConnections.map((conn) => {
                  const sender = peerProfiles[conn.senderId];
                  return (
                    <div key={conn.id} className="p-4 rounded-2xl bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] flex flex-col gap-3">
                      <div className="flex items-center gap-3 mb-1">
                        <UserAvatar name={sender?.name || 'Creator'} avatarUrl={sender?.avatarUrl} size="sm" />
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">{sender?.name || 'Loading...'}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{sender?.primaryRole || 'Creator'}</p>
                        </div>
                      </div>
                      {(conn.kind === 'post_share' || conn.kind === 'message_request') && (
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-amber)]">
                          Message request
                        </p>
                      )}
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">Message:</p>
                        <p className="text-xs text-[var(--text-primary)] italic">"{conn.message}"</p>
                      </div>
                      {conn.sharedPost && (
                        <a
                          href={conn.sharedPost.url || `/?post=${conn.sharedPost.postId}`}
                          className="block rounded-xl border border-[var(--card-inner-border)] overflow-hidden hover:border-[var(--accent-amber)] transition-colors"
                        >
                          {conn.sharedPost.imageUrl && (
                            <img src={conn.sharedPost.imageUrl} alt="" className="w-full h-24 object-cover" />
                          )}
                          <div className="p-2">
                            <p className="text-[10px] font-bold text-[var(--text-primary)] line-clamp-2">
                              {conn.sharedPost.caption || 'Shared post'}
                            </p>
                            {conn.sharedPost.authorName && (
                              <p className="text-[9px] text-[var(--text-muted)]">by {conn.sharedPost.authorName}</p>
                            )}
                            <span className="text-[9px] font-bold text-[var(--accent-amber)]">View post</span>
                          </div>
                        </a>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-inner-border)]">
                        <button
                          onClick={() => handleRespondConnection(conn.id, 'declined')}
                          disabled={isRespondingId === conn.id}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleRespondConnection(conn.id, 'accepted')}
                          disabled={isRespondingId === conn.id}
                          className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                        >
                          {isRespondingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Accept
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
