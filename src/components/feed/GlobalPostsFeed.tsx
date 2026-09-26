import React, { useState, useEffect } from 'react';
import { PostCard } from './PostCard';
import { Post, CreatorProfile } from '../../types';
import affilApi from '../../lib/affilApi';

interface GlobalPostsFeedProps {
  currentUser: CreatorProfile | null;
  onOpenMessenger?: (connectionId: string) => void;
  onOpenPost?: (postId: string) => void;
  refreshTrigger?: number;
}

export const GlobalPostsFeed: React.FC<GlobalPostsFeedProps> = ({
  currentUser,
  refreshTrigger = 0,
  onOpenMessenger,
  onOpenPost,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [refreshTrigger]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const data = await affilApi.getGlobalFeed();
      setPosts(data.posts || []);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-amber)] border-t-transparent" />
        <p className="font-mono text-xs text-[var(--text-muted)]">Loading feed...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center space-y-3 py-20">
          <p className="text-sm text-[var(--text-muted)]">No posts yet. Be the first to share something!</p>
        </div>
      ) : (
        <div
          className="w-full gap-3 sm:gap-4"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))',
          }}
        >
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUser?.id || ''}
              currentUser={currentUser}
              onOpenMessenger={onOpenMessenger}
              onOpenPost={onOpenPost}
              onDeleted={fetchPosts}
            />
          ))}
        </div>
      )}
    </div>
  );
};
