import React, { useEffect, useState } from 'react';
import { Plus, X, Briefcase, MapPin, Trash2, Check } from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import affilApi from '../../lib/affilApi';
import { createConnectionRequest } from '../../lib/firebase';
import type { CreatorProfile } from '../../types';

interface ProjectListing {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string | null;
  title: string;
  description?: string;
  requiredRoles: string[];
  location?: string;
  createdAt: string;
}

interface ExploreProjectListingsProps {
  currentUser: CreatorProfile | null;
  isCreateModalOpen: boolean;
  onCloseCreateModal: () => void;
  onViewAuthor?: (authorId: string) => void;
}

export const ExploreProjectListings: React.FC<ExploreProjectListingsProps> = ({
  currentUser,
  isCreateModalOpen,
  onCloseCreateModal,
  onViewAuthor,
}) => {
  const [listings, setListings] = useState<ProjectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerHasRole, setViewerHasRole] = useState(true);
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchListings = async () => {
    try {
      setLoading(true);
      const data = await affilApi.getProjectListings();
      setListings(data.listings || []);
      setViewerHasRole(data.viewerHasRole !== false);
    } catch (err) {
      console.error('Failed to fetch project listings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const addRole = () => {
    const r = roleDraft.trim();
    if (!r || roles.includes(r)) return;
    setRoles([...roles, r]);
    setRoleDraft('');
  };

  const removeRole = (r: string) => setRoles(roles.filter((x) => x !== r));

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setRoleDraft('');
    setRoles([]);
  };

  const handleCreate = async () => {
    if (!title.trim() || roles.length === 0) return;
    setSubmitting(true);
    try {
      await affilApi.createProjectListing({
        title: title.trim(),
        description: description.trim(),
        requiredRoles: roles,
        location: location.trim(),
      });
      resetForm();
      onCloseCreateModal();
      await fetchListings();
      setToast('Project posted!');
    } catch (err: any) {
      setToast(err?.response?.data?.error || 'Could not post project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInterested = async (listing: ProjectListing) => {
    if (!currentUser) return;
    try {
      await createConnectionRequest({
        senderId: currentUser.id,
        recipientId: listing.ownerId,
        projectId: listing.id,
        message: `Interested in your project "${listing.title}" — I can help with: ${listing.requiredRoles.join(', ')}.`,
        kind: 'connection',
      });
      setInterestedIds((prev) => new Set(prev).add(listing.id));
      setToast('Interest sent — they can now reach out to you.');
    } catch (err: any) {
      setToast(err?.message || 'Could not send interest');
    }
  };

  const handleDelete = async (listing: ProjectListing) => {
    if (!window.confirm('Delete this project listing?')) return;
    try {
      await affilApi.deleteProjectListing(listing.id);
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
    } catch (err: any) {
      setToast(err?.response?.data?.error || 'Could not delete');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-amber)] border-t-transparent" />
        <p className="font-mono text-xs text-[var(--text-muted)]">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {!viewerHasRole && (
        <div className="mb-4 p-3 rounded-2xl bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-xs text-[var(--text-secondary)]">
          Set a primary role on your profile to see projects that need people like you.
        </div>
      )}

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center space-y-3 py-20 text-center">
          <Briefcase className="w-8 h-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] max-w-sm">
            No projects currently need your role. Check back later, or post your own project to find collaborators.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((listing) => {
            const isOwner = currentUser?.id === listing.ownerId;
            const isInterested = interestedIds.has(listing.id);
            return (
              <div
                key={listing.id}
                className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <UserAvatar
                    name={listing.ownerName}
                    avatarUrl={listing.ownerAvatar}
                    size="sm"
                    onClick={() => onViewAuthor?.(listing.ownerId)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{listing.ownerName}</p>
                    {listing.location && (
                      <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" /> {listing.location}
                      </p>
                    )}
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleDelete(listing)}
                      className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                      title="Delete listing"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{listing.title}</h3>
                  {listing.description && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-3">{listing.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {listing.requiredRoles.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] text-[var(--text-secondary)]"
                    >
                      {r}
                    </span>
                  ))}
                </div>

                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => handleInterested(listing)}
                    disabled={isInterested}
                    className="mt-auto w-full flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide py-2 rounded-full bg-[var(--accent-amber)] text-[var(--btn-on-accent,#14100C)] disabled:opacity-60 cursor-pointer"
                  >
                    {isInterested ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Interest Sent
                      </>
                    ) : (
                      "I'm Interested"
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card-warm-white w-full max-w-lg rounded-3xl border border-[var(--card-border)] shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Post a Project</h3>
              <button type="button" onClick={onCloseCreateModal} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title (e.g. Short Film Shoot — 3 Days)"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-4 py-2.5 text-sm text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's the project about?"
                rows={3}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-4 py-2.5 text-sm text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none"
              />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-4 py-2.5 text-sm text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
              />

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Roles Needed
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRole();
                      }
                    }}
                    placeholder="e.g. Cinematographer"
                    className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-4 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    className="px-3 rounded-2xl bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] text-[var(--text-primary)] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {roles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {roles.map((r) => (
                      <span
                        key={r}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--accent-amber)]/15 border border-[var(--accent-amber)]/30 text-[var(--text-primary)]"
                      >
                        {r}
                        <button type="button" onClick={() => removeRole(r)} className="hover:text-red-500 cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                  Only creators whose role matches one of these will see this project.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
              <button type="button" onClick={onCloseCreateModal} className="px-4 py-2 rounded-full text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!title.trim() || roles.length === 0 || submitting}
                className="px-5 py-2 rounded-full text-xs font-bold bg-[var(--accent-amber)] text-[var(--btn-on-accent,#14100C)] shadow-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Posting…' : 'Post Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-[var(--card-inner-bg)] border border-[var(--card-border)] shadow-2xl rounded-2xl px-4 py-3">
            <span className="text-xs font-bold text-[var(--text-primary)]">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
};
