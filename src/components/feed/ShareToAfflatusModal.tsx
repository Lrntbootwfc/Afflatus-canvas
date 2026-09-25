import React, { useEffect, useState } from 'react';
import { X, Search, Send, Loader2, CheckCircle2 } from 'lucide-react';
import type { CreatorProfile, Post } from '../../types';
import {
  searchCreatorsByName,
  findConnectionBetween,
  createConnectionRequest,
  getPostShareUrl,
  auth,
} from '../../lib/firebase';
import { affilApi } from '../../lib/affilApi';
import { UserAvatar } from '../UserAvatar';

interface ShareToAfflatusModalProps {
  post: Post;
  currentUser: CreatorProfile;
  onClose: () => void;
  onOpenMessenger?: (connectionId: string) => void;
}

export const ShareToAfflatusModal: React.FC<ShareToAfflatusModalProps> = ({
  post,
  currentUser,
  onClose,
  onOpenMessenger,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchCreatorsByName(query.trim());
        if (!cancelled) {
          setResults(list.filter((u) => u.id && u.id !== currentUser.id));
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentUser.id]);

  const handleSend = async (recipient: CreatorProfile) => {
    const uid = auth.currentUser?.uid;
    if (!uid || uid !== currentUser.id) {
      setError('You must be signed in to share.');
      return;
    }
    setSendingId(recipient.id);
    setError(null);
    try {
      const url = getPostShareUrl(post.id);
      const sharedPost = {
        postId: post.id,
        url,
        caption: post.caption || '',
        imageUrl: post.imageUrl,
        authorName: post.authorName,
        authorId: post.authorId,
      };
      const shareText = `Shared a post${post.authorName ? ` by ${post.authorName}` : ''}`;

      let connection = await findConnectionBetween(currentUser.id, recipient.id);
      const isOpenThread =
        connection &&
        (connection.status === 'accepted' ||
          connection.status === 'collaborating' ||
          connection.status === 'completed');

      if (isOpenThread && connection) {
        // Already connected — deliver into existing Messenger thread
        await affilApi.sendTemporaryChat(connection.id, recipient.id, shareText, sharedPost);
        setSentTo(recipient.name || recipient.username || 'user');
        onOpenMessenger?.(connection.id);
      } else if (connection && connection.status === 'pending') {
        // Pending request already exists — attach share as message request (no force-open chat)
        // Re-use existing pending connection id for temporary message + keep as request
        await affilApi.sendTemporaryChat(connection.id, recipient.id, shareText, sharedPost);
        setSentTo(`message request to ${recipient.name || 'user'}`);
      } else {
        // Not connected — Instagram-style message request (pending). Does NOT open full chat.
        const { connection: created } = await createConnectionRequest({
          senderId: currentUser.id,
          recipientId: recipient.id,
          message: shareText,
          kind: 'post_share',
          sharedPost,
        });
        await affilApi.sendTemporaryChat(created.id, recipient.id, shareText, sharedPost);
        setSentTo(`message request to ${recipient.name || 'user'}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not share post. Complete your profile if required, then try again.');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)] shrink-0">
          <div>
            <h3 className="font-editorial text-base font-bold text-[var(--text-primary)]">Share to Afflatus</h3>
            <p className="text-[10px] text-[var(--text-muted)]">Send this post in Messages</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="w-full bg-transparent text-xs text-[var(--input-text)] focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {error && (
            <p className="text-[11px] text-red-500 px-2 py-2">{error}</p>
          )}
          {sentTo && (
            <div className="flex items-center gap-2 text-emerald-500 text-xs px-3 py-2">
              <CheckCircle2 className="w-4 h-4" />
              Sent to {sentTo}
            </div>
          )}
          {searching && (
            <div className="flex justify-center py-8 text-[var(--text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-8">No users found</p>
          )}
          {!query.trim() && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-8">Type a name to find someone</p>
          )}
          <div className="space-y-1">
            {results.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--card-inner-bg)]"
              >
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{u.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {u.primaryRole || u.username || ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!!sendingId}
                  onClick={() => handleSend(u)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold bg-[var(--accent-amber)] text-[#181614] disabled:opacity-50"
                >
                  {sendingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Send
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
