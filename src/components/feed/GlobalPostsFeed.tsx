import React, { useState, useEffect } from 'react';
import { PostCard } from './PostCard';
import { CreatePostInput } from './CreatePostInput';
import { Post, CreatorProfile } from '../../types';
import affilApi from '../../lib/affilApi';

interface GlobalPostsFeedProps {
  currentUser: CreatorProfile | null;
  refreshTrigger?: number;
}

export const GlobalPostsFeed: React.FC<GlobalPostsFeedProps> = ({ currentUser, refreshTrigger = 0 }) => {
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
      <div className="py-20 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-amber)] border-t-transparent animate-spin" />
        <p className="text-xs text-[var(--text-muted)] font-mono">Loading feed...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      
      {posts.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <p className="text-sm text-[var(--text-muted)]">No posts yet. Be the first to share something!</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {posts.map((post) => (
            <div key={post.id} className="break-inside-avoid mb-6">
              <PostCard post={post} currentUserId={currentUser?.id || ''} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
