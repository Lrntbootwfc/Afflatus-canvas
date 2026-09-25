import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react';
import { Post } from '../../types';
import affilApi from '../../lib/affilApi';
import { getPostShareUrl, buildPostShareText, getProfileFromFirestore } from '../../lib/firebase';
import { ShareToAfflatusModal } from './ShareToAfflatusModal';
import type { CreatorProfile } from '../../types';


interface PostCardProps {
  post: Post;
  currentUserId: string;
  onDeleted?: () => void;
  currentUser?: CreatorProfile | null;
  onOpenMessenger?: (connectionId: string) => void;
  onOpenPost?: (postId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, currentUserId, currentUser, onOpenMessenger, onOpenPost, onDeleted }) => {
  const [likes, setLikes] = useState<string[]>(post.likes || []);
  const [isLiking, setIsLiking] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [displayCaption, setDisplayCaption] = useState(post.caption || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareToAfflatusOpen, setShareToAfflatusOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [shareProfile, setShareProfile] = useState<CreatorProfile | null>(currentUser || null);

  const isAuthor = currentUserId === post.authorId;
  const hasLiked = likes.includes(currentUserId);

  if (isDeleted) return null;

  const handleLike = async () => {
    if (isLiking || !currentUserId) return;
    setIsLiking(true);

    // Optimistic UI update
    if (hasLiked) {
      setLikes(likes.filter((id) => id !== currentUserId));
    } else {
      setLikes([...likes, currentUserId]);
    }

    try {
      await affilApi.toggleLike(post.id, currentUserId);
    } catch (err) {
      console.error('Failed to toggle like:', err);
      // Revert on error
      if (hasLiked) {
        setLikes([...likes, currentUserId]);
      } else {
        setLikes(likes.filter((id) => id !== currentUserId));
      }
    } finally {
      setIsLiking(false);
    }
  };

  const openShareMenu = () => setShareMenuOpen((v) => !v);

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
        await navigator.share({ title: 'Afflatus post', text: post.caption || 'Check this post on Afflatus', url });
      } else {
        await handleCopyLink();
      }
    } catch {
      /* cancelled */
    }
    setShareMenuOpen(false);
  };

  const handleShareToAfflatus = async () => {
    setShareMenuOpen(false);
    if (!currentUserId) {
      alert('Sign in to share to Afflatus');
      return;
    }
    let profile = shareProfile || currentUser || null;
    if (!profile) {
      profile = await getProfileFromFirestore(currentUserId);
      setShareProfile(profile);
    }
    if (!profile) {
      alert('Could not load your profile');
      return;
    }
    setShareToAfflatusOpen(true);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await affilApi.deletePost(post.id);
      setIsDeleted(true);
      onDeleted?.();
    } catch (err) {
      console.error('Failed to delete post:', err);
      alert('Failed to delete post.');
    }
  };

  const handleSaveEdit = async () => {
    if (!currentUserId || !isAuthor) return;
    setIsSavingEdit(true);
    try {
      await affilApi.updatePost(post.id, { userId: currentUserId, caption: editCaption });
      setDisplayCaption(editCaption);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to edit post:', err);
      alert('Failed to save edit.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[var(--input-bg)] overflow-hidden border border-[var(--card-border)]">
            {post.authorAvatar ? (
              <img src={post.authorAvatar} alt={post.authorName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold">
                {post.authorName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h4 className="font-bold text-[var(--text-primary)] text-sm">{post.authorName}</h4>
            <p className="text-[11px] text-[var(--text-muted)]">{post.authorRole} • {formattedDate}</p>
          </div>
        </div>
        
        {isAuthor && (
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
            >
              <MoreHorizontal size={18} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg z-10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] transition-colors"
                >
                  Edit Post
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-[var(--card-inner-bg)] transition-colors"
                >
                  Delete Post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="mb-4">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full text-sm bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2 text-[var(--text-primary)]"
              rows={3}
            />
            <div className="flex gap-2">
              <button type="button" disabled={isSavingEdit} onClick={handleSaveEdit} className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--accent-amber)]">Save</button>
              <button type="button" onClick={() => { setIsEditing(false); setEditCaption(displayCaption); }} className="text-xs font-bold px-3 py-1 rounded-full border border-[var(--card-border)]">Cancel</button>
            </div>
          </div>
        ) : displayCaption ? (
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{displayCaption}</p>
        ) : null}
      </div>

      {/* Image (if any) */}
      {post.imageUrl && (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="mb-4 w-full rounded-2xl overflow-hidden border border-[var(--card-border)] max-h-96 bg-[var(--app-bg)] flex items-center justify-center cursor-zoom-in"
        >
          <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-contain max-h-96" />
        </button>
      )}
      {lightboxOpen && post.imageUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-sm font-bold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20"
            onClick={() => setLightboxOpen(false)}
          >
            Close
          </button>
          <img
            src={post.imageUrl}
            alt="Expanded post"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
        <div className="flex items-center space-x-6">
          <button 
            onClick={handleLike}
            disabled={isLiking}
            className={`flex items-center space-x-2 text-sm transition-colors ${
              hasLiked ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Heart size={18} className={hasLiked ? 'fill-current' : ''} />
            <span>{likes.length}</span>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={openShareMenu}
              className="flex items-center space-x-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Share post"
            >
              <Share2 size={18} />
              <span>Share</span>
            </button>
            {shareMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl z-20 overflow-hidden">
                <button type="button" onClick={handleShareToAfflatus} className="w-full text-left px-3 py-2.5 text-xs hover:bg-[var(--card-inner-bg)] text-[var(--text-primary)]">
                  Share to Afflatus
                </button>
                <button type="button" onClick={handleCopyLink} className="w-full text-left px-3 py-2.5 text-xs hover:bg-[var(--card-inner-bg)] text-[var(--text-primary)]">
                  Copy link
                </button>
                <button type="button" onClick={handleExternalShare} className="w-full text-left px-3 py-2.5 text-xs hover:bg-[var(--card-inner-bg)] text-[var(--text-primary)]">
                  Share externally
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {shareToAfflatusOpen && shareProfile && (
        <ShareToAfflatusModal
          post={post}
          currentUser={shareProfile}
          onClose={() => setShareToAfflatusOpen(false)}
          onOpenMessenger={onOpenMessenger}
        />
      )}
    </div>
  );
};
