import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react';
import { Post } from '../../types';
import affilApi from '../../lib/affilApi';

interface PostCardProps {
  post: Post;
  currentUserId: string;
}

export const PostCard: React.FC<PostCardProps> = ({ post, currentUserId }) => {
  const [likes, setLikes] = useState<string[]>(post.likes || []);
  const [isLiking, setIsLiking] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
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

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await affilApi.deletePost(post.id);
      setIsDeleted(true);
    } catch (err) {
      console.error('Failed to delete post:', err);
      alert('Failed to delete post.');
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
              <div className="absolute right-0 mt-1 w-32 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg z-10 overflow-hidden">
                <button 
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
        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{post.caption}</p>
      </div>

      {/* Image (if any) */}
      {post.imageUrl && (
        <div className="mb-4 rounded-2xl overflow-hidden border border-[var(--card-border)] max-h-96 bg-[var(--app-bg)] flex items-center justify-center">
          <img src={post.imageUrl} alt="Post content" className="w-full h-auto object-contain max-h-96" />
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
        </div>
      </div>
    </div>
  );
};
