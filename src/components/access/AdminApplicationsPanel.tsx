import React, { useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import type { CreatorProfile } from '../../types';
import {
  listPendingApplications,
  reviewJoinApplication,
} from '../../lib/firebase';

interface AdminApplicationsPanelProps {
  admin: CreatorProfile;
  onClose: () => void;
}

export const AdminApplicationsPanel: React.FC<AdminApplicationsPanelProps> = ({ admin, onClose }) => {
  const [items, setItems] = useState<
    Array<{ userId: string; email: string; name: string; message: string; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPendingApplications();
      setItems(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (userId: string, decision: 'approved' | 'rejected') => {
    setActing(userId);
    setError(null);
    try {
      await reviewJoinApplication({
        applicantUserId: userId,
        decision,
        adminUserId: admin.id,
        adminEmail: admin.email || '',
      });
      setItems((prev) => prev.filter((i) => i.userId !== userId));
    } catch (err: any) {
      setError(err?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <h2 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Pending applications</h2>
          <button type="button" onClick={onClose} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-amber)]" />
            </div>
          )}
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          {!loading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">No pending applications</p>
          )}
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.userId}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card-inner-bg)]/40 p-3"
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.name || 'Applicant'}</p>
                <p className="text-[11px] font-mono text-[var(--text-muted)]">{item.email}</p>
                {item.message && (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {item.message}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">{item.createdAt}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={acting === item.userId}
                    onClick={() => decide(item.userId, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600/90 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={acting === item.userId}
                    onClick={() => decide(item.userId, 'rejected')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/40 py-1.5 text-xs font-bold text-red-500 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
