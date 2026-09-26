import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreatorProfile } from '../../types';
import { submitJoinApplication } from '../../lib/firebase';

interface ApplyJoinScreenProps {
  user: CreatorProfile;
  mode: 'apply' | 'pending' | 'rejected';
  onSubmitted: (updated: CreatorProfile) => void;
  onLogout: () => void;
}

export const ApplyJoinScreen: React.FC<ApplyJoinScreenProps> = ({
  user,
  mode,
  onSubmitted,
  onLogout,
}) => {
  const [message, setMessage] = useState(user.applicationMessage || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitJoinApplication({
        userId: user.id,
        email: user.email || '',
        name: user.name || '',
        message,
      });
      onSubmitted({
        ...user,
        applicationStatus: 'pending',
        applicationMessage: message.trim(),
        applicationSubmittedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message || 'Could not submit application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-lg sm:p-8">
        <h1 className="font-editorial text-2xl font-bold text-[var(--text-primary)]">
          {mode === 'rejected' ? 'Application not approved' : mode === 'pending' ? 'Application pending' : 'Join Afflatus'}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
          {mode === 'rejected'
            ? 'Your request to join Afflatus was not approved. You cannot access the platform at this time.'
            : mode === 'pending'
              ? 'Your application is under review by the Afflatus team. You will gain access after approval.'
              : 'Afflatus is invite-reviewed. Tell us briefly who you are and why you want to join. An admin will review your request.'}
        </p>

        {mode === 'apply' && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-[11px] font-mono text-[var(--text-muted)]">Signed in as</label>
              <p className="text-sm text-[var(--text-primary)]">{user.email || user.name}</p>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-mono text-[var(--text-muted)]">
                Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Your craft, city, and why Afflatus…"
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--text-primary)]"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="amber-pill-btn w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Submit application'}
            </button>
          </form>
        )}

        {(mode === 'pending' || mode === 'rejected') && (
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Status: <span className="font-mono font-semibold text-[var(--text-primary)]">{mode}</span>
          </p>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="mt-6 w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
