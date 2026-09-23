import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Send } from 'lucide-react';
import affilApi from '../../lib/affilApi';
import { CreatorProfile } from '../../types';

interface CreatePostInputProps {
  currentUser: CreatorProfile;
  onPostCreated?: () => void;
}

export const CreatePostInput: React.FC<CreatePostInputProps> = ({ currentUser, onPostCreated }) => {
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 150 * 1024) {
      alert('Image size cannot be greater than 150KB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() && !imageUrl.trim()) return;

    setIsSubmitting(true);
    try {
      await affilApi.createPost({
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorRole: currentUser.role || 'Creator',
        authorAvatar: currentUser.avatarUrl || undefined,
        caption: caption.trim(),
        imageUrl: imageUrl.trim() || undefined,
      });
      setCaption('');
      setImageUrl('');
      if (onPostCreated) {
        onPostCreated();
      }
    } catch (err) {
      console.error('Failed to create post:', err);
      alert('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 mb-6 shadow-sm">
      <div className="flex space-x-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[var(--input-bg)] overflow-hidden border border-[var(--card-border)] shrink-0">
          {currentUser.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Share your latest work, ideas, or behind-the-scenes..."
          className="w-full bg-transparent resize-none outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] min-h-[60px]"
          disabled={isSubmitting}
        />
      </div>

      {imageUrl && (
        <div className="mb-4 relative rounded-2xl overflow-hidden border border-[var(--card-border)] bg-[var(--app-bg)] flex items-center justify-center">
          <img src={imageUrl} alt="Upload preview" className="w-full h-auto object-contain max-h-64" />
          <button 
            type="button"
            onClick={() => setImageUrl('')}
            className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
        <div className="flex items-center">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent-amber)] transition-colors px-2 py-1 rounded-lg"
          >
            <ImageIcon size={18} />
            <span>Image</span>
          </button>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || (!caption.trim() && !imageUrl.trim())}
          className="flex items-center space-x-2 bg-[var(--accent-amber)] hover:bg-[#e69c1e] text-black px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <span>{isSubmitting ? 'Posting...' : 'Post'}</span>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};
