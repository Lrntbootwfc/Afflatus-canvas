import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Send, AlertCircle } from 'lucide-react';
import affilApi from '../../lib/affilApi';
import { CreatorProfile } from '../../types';
import {
  compressImageFile,
  validateImageFileSize,
  IMAGE_HARD_MAX_BYTES,
  formatBytes,
} from '../../lib/mediaLimits';

interface CreatePostInputProps {
  currentUser: CreatorProfile;
  onPostCreated?: () => void;
}

export const CreatePostInput: React.FC<CreatePostInputProps> = ({ currentUser, onPostCreated }) => {
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);

    if (!file.type.startsWith('image/')) {
      setMediaError('Please select an image (JPG, PNG, WebP). Video upload is disabled until Storage is enabled.');
      return;
    }

    const sizeErr = validateImageFileSize(file);
    if (sizeErr) {
      setMediaError(sizeErr);
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImageFile(file, { maxDimension: 1280 });
      setImageUrl(compressed);
    } catch (err: any) {
      setMediaError(err?.message || `Could not process image (max ${formatBytes(IMAGE_HARD_MAX_BYTES)}).`);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() && !imageUrl.trim()) return;

    setIsSubmitting(true);
    setMediaError(null);
    try {
      await affilApi.createPost({
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorRole: (currentUser as any).role || currentUser.primaryRole || 'Creator',
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
      setMediaError('Failed to create post. Please try again.');
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
              {currentUser.name?.charAt(0)?.toUpperCase() || 'C'}
            </div>
          )}
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Share an update with the network…"
          className="w-full bg-transparent resize-none outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] min-h-[60px]"
        />
      </div>

      {imageUrl && (
        <div className="relative mb-3 rounded-2xl overflow-hidden border border-[var(--card-border)] max-h-64">
          <img src={imageUrl} alt="Preview" className="w-full max-h-64 object-cover" />
          <button
            type="button"
            onClick={() => setImageUrl('')}
            className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] font-semibold"
          >
            Remove
          </button>
        </div>
      )}

      {mediaError && (
        <div className="mb-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{mediaError}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompressing || isSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--card-border)] cursor-pointer disabled:opacity-50"
          >
            <ImageIcon size={18} />
            <span>{isCompressing ? 'Compressing…' : 'Image'}</span>
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">
            Images only · max {formatBytes(IMAGE_HARD_MAX_BYTES)} (auto-compressed)
          </span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || isCompressing || (!caption.trim() && !imageUrl.trim())}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-[var(--accent-amber)] text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
        >
          <Send size={14} />
          <span>{isSubmitting ? 'Posting…' : 'Post'}</span>
        </button>
      </div>
    </div>
  );
};
