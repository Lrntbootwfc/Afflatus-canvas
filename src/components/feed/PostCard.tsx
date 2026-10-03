import React, { useState } from 'react';
import { Heart, Share2, Pencil, Trash2 } from 'lucide-react';
import { Post } from '../../types';
import affilApi from '../../lib/affilApi';
import { getPostShareUrl, getProfileFromFirestore } from '../../lib/firebase';
import { ShareToAfflatusModal } from './ShareToAfflatusModal';
import type { CreatorProfile } from '../../types';

interface PostCardProps {
  post: Post;
  currentUserId: string;
  onDeleted?: () => void;
  currentUser?: CreatorProfile | null;
  onOpenMessenger?: (connectionId: string) => void;
  onOpenPost?: (postId: string) => void;
  /** Click name/avatar → open that user's public profile */
  onViewAuthor?: (authorId: string) => void;
  /**
   * When false (default), Like/Share actions are disabled but existing
   * reaction counts remain visible (view-only).
   */
  allowReactions?: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUserId,
  currentUser,
  onOpenMessenger,
  onOpenPost,
  onViewAuthor,
  onDeleted,
  allowReactions = false,
}) => {
  const [likes, setLikes] = useState<string[]>(post.likes || []);
  const [isLiking, setIsLiking] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [displayCaption, setDisplayCaption] = useState(post.caption || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareToAfflatusOpen, setShareToAfflatusOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [shareProfile, setShareProfile] = useState<CreatorProfile | null>(currentUser || null);

  // Only the post author may edit/delete — never expose controls for others' posts
  const resolvedUserId = String(currentUserId || currentUser?.id || '').trim();
  const resolvedAuthorId = String(post.authorId || '').trim();
  const isAuthor = Boolean(resolvedUserId && resolvedAuthorId && resolvedUserId === resolvedAuthorId);
  const hasLiked = resolvedUserId ? likes.includes(resolvedUserId) : false;

  if (isDeleted) return null;

  const handleLike = async () => {
    // Req: view reaction counts only — do not create likes
    if (!allowReactions) return;
    if (isLiking || !resolvedUserId) return;
    setIsLiking(true);
    if (hasLiked) setLikes(likes.filter((id) => id !== resolvedUserId));
    else setLikes([...likes, resolvedUserId]);
    try {
      await affilApi.toggleLike(post.id, resolvedUserId);
    } catch {
      if (hasLiked) setLikes([...likes, resolvedUserId]);
      else setLikes(likes.filter((id) => id !== resolvedUserId));
    } finally {
      setIsLiking(false);
    }
  };

  const handleCopyLink = async () => {
    const url = getPostShareUrl(post.id);
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    } catch {
      prompt('Copy this post link:', url);
    }
    setShareMenuOpen(false);
  };

  const handleExternalShare = async () => {
    const url = getPostShareUrl(post.id);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Afflatus post',
          text: post.caption || 'Check this post on Afflatus',
          url,
        });
      } else await handleCopyLink();
    } catch {
      /* cancelled */
    }
    setShareMenuOpen(false);
  };

  const handleShareToAfflatus = async () => {
    if (!allowReactions) return;
    setShareMenuOpen(false);
    if (!resolvedUserId) {
      alert('Sign in to share to Afflatus');
      return;
    }
    let profile = shareProfile || currentUser || null;
    if (!profile) {
      profile = await getProfileFromFirestore(resolvedUserId);
      setShareProfile(profile);
    }
    if (!profile) {
      alert('Could not load your profile');
      return;
    }
    setShareToAfflatusOpen(true);
  };

  const handleDelete = async () => {
    // Hard gate: never delete another user's post from this UI
    if (!isAuthor || !resolvedUserId) return;
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await affilApi.deletePost(post.id);
      setIsDeleted(true);
      onDeleted?.();
    } catch {
      alert('Failed to delete post.');
    }
  };

  const handleSaveEdit = async () => {
    // Hard gate: never edit another user's post from this UI
    if (!resolvedUserId || !isAuthor) return;
    setIsSavingEdit(true);
    try {
      await affilApi.updatePost(post.id, { userId: resolvedUserId, caption: editCaption });
      setDisplayCaption(editCaption);
      setIsEditing(false);
    } catch {
      alert('Failed to save edit.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Caption only — do not surface author role on the card
  const title =
    (displayCaption || '').trim().split('\n')[0]?.slice(0, 72) || 'Post';

  return (
    <article className="group relative z-0 flex flex-col overflow-visible rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm transition-all duration-300 hover:z-10 hover:border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)] hover:shadow-md">
      {/* Media — role badge removed */}
      <div
        className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-t-xl bg-[var(--card-inner-bg)]"
        onClick={() => setLightboxOpen(true)}
      >
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-4 text-center"
            style={{
              background:
                'linear-gradient(160deg, var(--card-inner-bg) 0%, color-mix(in srgb, var(--accent-amber) 10%, var(--card-bg)) 100%)',
            }}
          >
            <p className="line-clamp-3 text-xs text-[var(--text-secondary)]">{displayCaption || 'Shared on Afflatus'}</p>
          </div>
        )}
      </div>

      {/* Compact strip: caption + avatar/name + like/share + author edit/delete icons */}
      <div className="flex flex-col gap-1.5 px-2.5 py-2 sm:px-3 sm:py-2.5">
        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1.5 text-[11px] text-[var(--text-primary)]"
              rows={2}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="rounded-md bg-[var(--accent-amber)] px-2 py-1 text-[10px] font-bold text-[var(--btn-on-accent,#14100C)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditCaption(displayCaption);
                }}
                className="rounded-md border border-[var(--card-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {displayCaption ? (
              <p
                className="line-clamp-2 cursor-pointer text-[12px] font-semibold leading-snug text-[var(--text-primary)] sm:text-[13px]"
                onClick={() => setLightboxOpen(true)}
              >
                {title}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer hover:opacity-90"
                onClick={(e) => {
                  e.stopPropagation();
                  if (post.authorId && onViewAuthor) onViewAuthor(post.authorId);
                }}
                aria-label={`View ${post.authorName || 'creator'} profile`}
              >
                <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--card-border)] bg-[var(--card-inner-bg)]">
                  {post.authorAvatar ? (
                    <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-[var(--text-muted)]">
                      {(post.authorName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="truncate text-[11px] font-medium text-[var(--text-primary)] hover:underline">
                  {post.authorName || 'Creator'}
                </span>
              </button>
              <div className="relative flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={isLiking || !allowReactions}
                  className={`flex items-center gap-0.5 rounded p-0.5 text-[11px] ${
                    hasLiked
                      ? 'text-[var(--accent-amber)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  } disabled:opacity-50`}
                  aria-label="Like"
                >
                  <Heart size={14} className={hasLiked ? 'fill-current' : ''} />
                  <span className="font-mono">{likes.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!allowReactions) return;
                    setShareMenuOpen((v) => !v);
                  }}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  aria-label="Share"
                  disabled={!allowReactions}
                >
                  <Share2 size={14} />
                </button>
                {isAuthor && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      aria-label="Edit post"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="rounded p-0.5 text-[var(--text-muted)] hover:text-red-500"
                      aria-label="Delete post"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                {shareMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[60] mb-1 w-40 overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl">
                    <button
                      type="button"
                      onClick={handleShareToAfflatus}
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]"
                    >
                      Share to Afflatus
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={handleExternalShare}
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]"
                    >
                      Share externally
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Expanded full post (media + complete caption + actions) — not image-only */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded post"
        >
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl sm:max-w-xl md:max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media — aspect preserved, contain, no forced crop */}
            {post.imageUrl ? (
              <div className="flex max-h-[55vh] min-h-0 shrink-0 items-center justify-center bg-black/90 p-2 sm:max-h-[60vh]">
                <img
                  src={post.imageUrl}
                  alt=""
                  className="max-h-[55vh] w-auto max-w-full object-contain sm:max-h-[60vh]"
                />
              </div>
            ) : null}

            {/* Metadata grows with content — no max-height clamp on caption */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--card-border)] bg-[var(--card-inner-bg)]">
                  {post.authorAvatar ? (
                    <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                      {(post.authorName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{post.authorName}</p>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] p-2 text-sm text-[var(--text-primary)]"
                    rows={5}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleSaveEdit}
                      className="rounded-lg bg-[var(--accent-amber)] px-3 py-1.5 text-xs font-bold text-[var(--btn-on-accent,#14100C)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setEditCaption(displayCaption);
                      }}
                      className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                displayCaption && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-primary)]">
                    {displayCaption}
                  </p>
                )
              )}
            </div>

            {/* Actions: like, share, author edit/delete icons — no role */}
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--card-border)] px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={handleLike}
                disabled={isLiking || !allowReactions}
                className={`flex items-center gap-1.5 text-sm ${
                  hasLiked ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                } disabled:opacity-50`}
                aria-label="Like"
              >
                <Heart size={18} className={hasLiked ? 'fill-current' : ''} />
                <span className="font-mono">{likes.length}</span>
              </button>
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!allowReactions) return;
                    setShareMenuOpen((v) => !v);
                  }}
                  className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  disabled={!allowReactions}
                  aria-label="Share"
                >
                  <Share2 size={18} />
                </button>
                {isAuthor && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      aria-label="Edit post"
                      title="Edit"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="text-[var(--text-muted)] hover:text-red-500"
                      aria-label="Delete post"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
                {shareMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[60] mb-2 w-44 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl">
                    <button type="button" onClick={handleShareToAfflatus} className="w-full px-3 py-2.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]">
                      Share to Afflatus
                    </button>
                    <button type="button" onClick={handleCopyLink} className="w-full px-3 py-2.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]">
                      Copy link
                    </button>
                    <button type="button" onClick={handleExternalShare} className="w-full px-3 py-2.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)]">
                      Share externally
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {shareToAfflatusOpen && shareProfile && (
        <ShareToAfflatusModal
          post={post}
          currentUser={shareProfile}
          onClose={() => setShareToAfflatusOpen(false)}
          onOpenMessenger={onOpenMessenger}
        />
      )}
    </article>
  );
};
