import React, { useState } from 'react';
import { X, Star, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CreatorProfile } from '../../types';

interface FeedbackModalProps {
  creator: CreatorProfile;
  currentUser: CreatorProfile;
  onClose: () => void;
  onSubmit: (ratings: Record<string, number>) => Promise<void>;
}

const TRAITS = [
  'creativity',
  'communication',
  'flexibility',
  'reliability',
  'teamwork',
  'feedback_openness',
  'leadership',
  'technical_proficiency'
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ creator, currentUser, onClose, onSubmit }) => {
  const [ratings, setRatings] = useState<Record<string, number>>(
    TRAITS.reduce((acc, trait) => ({ ...acc, [trait]: 5 }), {})
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await onSubmit(ratings);
      setFeedback({ type: 'success', message: 'Feedback submitted successfully.' });
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit feedback.' });
      setIsSubmitting(false);
    }
  };

  const handleRatingChange = (trait: string, val: number) => {
    setRatings(prev => ({ ...prev, [trait]: val }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card-warm-white w-full max-w-lg rounded-3xl border border-[var(--card-border)] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)] shrink-0">
          <div>
            <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
              Leave Feedback for {creator.name}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Rate your collaboration experience on a scale of 1-10
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                  : 'bg-red-500/10 text-red-500 border border-red-500/30'
              }`}
            >
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {feedback.message}
            </div>
          )}

          <div className="space-y-4">
            {TRAITS.map(trait => (
              <div key={trait} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--text-primary)] capitalize">
                    {trait.replace('_', ' ')}
                  </label>
                  <span className="text-xs font-mono font-bold text-[var(--accent-amber)] bg-[var(--card-inner-bg)] px-2 py-0.5 rounded-md border border-[var(--card-inner-border)]">
                    {ratings[trait]} / 10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={ratings[trait]}
                  onChange={(e) => handleRatingChange(trait, parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-[var(--card-inner-bg)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-amber)]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-[var(--card-border)] shrink-0 flex items-center justify-end gap-3 bg-[var(--card-inner-bg)]/30 rounded-b-3xl">
          <button
            onClick={onClose}
            disabled={isSubmitting || feedback?.type === 'success'}
            className="px-4 py-2 rounded-full text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || feedback?.type === 'success'}
            className="px-6 py-2.5 rounded-full text-xs font-bold bg-[var(--accent-amber)] hover:opacity-90 text-[#181614] shadow-md inline-flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Submit Feedback</span>
          </button>
        </div>
      </div>
    </div>
  );
};
