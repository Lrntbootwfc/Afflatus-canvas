import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Sparkles, MessageSquare, ArrowUpRight, Star, Heart } from 'lucide-react';
import type { ExploreCreatorItem } from '../../types';
import { UserAvatar } from '../UserAvatar';
import {
  auth,
  getPortfolioItemLikeState,
  togglePortfolioItemLike,
} from '../../lib/firebase';

interface CreatorCardProps {
  creator: ExploreCreatorItem;
  onOpenDetail: (creator: ExploreCreatorItem) => void;
  onConnect?: (creator: ExploreCreatorItem) => void;
}

type ShowcaseItem = { id: string; url: string; title?: string };

function ratingFromCollaboration(cp: ExploreCreatorItem['collaborationProfile']): number | null {
  if (!cp) return null;
  const nums = Object.entries(cp)
    .filter(([k, v]) => k !== 'feedbackCount' && k !== 'confidenceScores' && typeof v === 'number')
    .map(([, v]) => v as number);
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return avg > 5 ? Math.round((avg / 2) * 10) / 10 : Math.round(avg * 10) / 10;
}

function buildShowcaseItems(creator: ExploreCreatorItem): ShowcaseItem[] {
  const items: ShowcaseItem[] = [];
  const seen = new Set<string>();
  const portfolios = (creator as any).portfolios as
    | { id?: string; rawFileUrl?: string; linkUrl?: string; title?: string }[]
    | undefined;
  if (Array.isArray(portfolios)) {
    for (const p of portfolios) {
      const url = p.rawFileUrl || p.linkUrl;
      if (!url) continue;
      const s = String(url);
      if (!(s.startsWith('http') || s.startsWith('data:'))) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      items.push({ id: String(p.id || `port_${items.length}_${creator.id}`), url: s, title: p.title });
    }
  }
  const workLinks = (creator as any).workLinks as
    | { id?: string; thumbnailUrl?: string; url?: string; title?: string }[]
    | undefined;
  if (Array.isArray(workLinks)) {
    for (const w of workLinks) {
      const url = w.thumbnailUrl || w.url;
      if (!url || !String(url).startsWith('http')) continue;
      const s = String(url);
      if (seen.has(s)) continue;
      seen.add(s);
      items.push({ id: String(w.id || `work_${items.length}_${creator.id}`), url: s, title: w.title });
    }
  }
  return items;
}

export const CreatorCard: React.FC<CreatorCardProps> = ({ creator, onOpenDetail, onConnect }) => {
  const available =
    !creator.availability ||
    creator.availability.status === 'available' ||
    (creator.availability as any).isAvailable === true;

  const rating = ratingFromCollaboration(creator.collaborationProfile);
  const feedbackCount = Number(creator.collaborationProfile?.feedbackCount) || 0;
  const secondary = (creator.secondaryRoles || []).filter(Boolean).slice(0, 4);
  const showcase = useMemo(() => buildShowcaseItems(creator), [creator]);
  const locationLabel = creator.location || (creator as any).city || '';
  const myUid = auth.currentUser?.uid || '';
  const [likeMap, setLikeMap] = useState<Record<string, { likedBy: string[]; busy?: boolean }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { likedBy: string[] }> = {};
      await Promise.all(
        showcase.map(async (item) => {
          const state = await getPortfolioItemLikeState(item.id);
          next[item.id] = { likedBy: state?.likedBy || [] };
        })
      );
      if (!cancelled) setLikeMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [showcase]);

  const handleLikeItem = async (e: React.MouseEvent, item: ShowcaseItem) => {
    e.stopPropagation();
    if (!myUid) return;
    setLikeMap((prev) => ({
      ...prev,
      [item.id]: { likedBy: prev[item.id]?.likedBy || [], busy: true },
    }));
    try {
      const result = await togglePortfolioItemLike({
        itemId: item.id,
        creatorId: creator.id,
        userId: myUid,
      });
      setLikeMap((prev) => ({
        ...prev,
        [item.id]: { likedBy: result.likedBy, busy: false },
      }));
    } catch {
      setLikeMap((prev) => ({
        ...prev,
        [item.id]: { ...(prev[item.id] || { likedBy: [] }), busy: false },
      }));
    }
  };

  return (
    <article
      id={`creator-card-${creator.id}`}
      className="w-full overflow-hidden rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm transition-shadow duration-300 hover:shadow-md"
    >
      <div className="flex w-full flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-stretch md:gap-6">
        {/* LEFT ~30%: details then Profile + Collaborate at bottom */}
        <div className="flex w-full flex-col md:w-[30%] md:min-w-[220px] md:max-w-[300px] md:shrink-0">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => onOpenDetail(creator)} className="shrink-0 cursor-pointer">
              <div className="overflow-hidden rounded-full ring-2 ring-[var(--card-border)]/60 shadow-sm">
                <UserAvatar name={creator.name} avatarUrl={creator.avatarUrl} size="lg" />
              </div>
            </button>
            <div className="min-w-0 flex-1 pt-0.5">
              <button
                type="button"
                onClick={() => onOpenDetail(creator)}
                className="block max-w-full truncate text-left font-editorial text-lg font-bold text-[var(--text-primary)] hover:text-[var(--accent-amber)] cursor-pointer"
              >
                {creator.name}
              </button>
              {creator.username && (
                <p className="truncate text-[11px] font-mono text-[var(--text-muted)]">@{creator.username}</p>
              )}
              <span
                className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono ${
                  available
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'
                    : 'border-[var(--card-border)] text-[var(--text-muted)]'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'}`} />
                {available ? 'Available' : 'Busy'}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[var(--accent-amber)]/35 bg-[var(--accent-amber)]/10 px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-[var(--accent-amber)]">
              {creator.primaryRole || 'Creator'}
            </span>
            {secondary.map((role) => (
              <span
                key={role}
                className="rounded-full border border-[var(--card-border)] px-2.5 py-0.5 text-[10px] font-mono text-[var(--text-secondary)]"
              >
                {role}
              </span>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-secondary)]">
            {rating != null && (
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--accent-amber)]">
                <Star className="h-3.5 w-3.5 fill-[var(--accent-amber)]" />
                {rating.toFixed(1)}
                {feedbackCount > 0 && (
                  <span className="font-normal text-[var(--text-muted)]">({feedbackCount})</span>
                )}
              </span>
            )}
            {locationLabel && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <span className="truncate">{locationLabel}</span>
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {creator.bio || 'Creative professional open to collaboration.'}
          </p>

          {creator.discoveryReason && (
            <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-[var(--card-inner-bg)]/70 px-2.5 py-1.5 text-[10px] text-[var(--text-secondary)]">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-amber)]" />
              <span className="line-clamp-2 leading-snug">{creator.discoveryReason}</span>
            </div>
          )}

          {/* Profile + Collaborate — left bottom, after all basic details */}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <button
              type="button"
              id={`view-profile-btn-${creator.id}`}
              onClick={() => onOpenDetail(creator)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-2 text-[11px] font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--card-inner-bg)]"
            >
              Profile
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            {onConnect && (
              <button
                type="button"
                id={`connect-creator-btn-${creator.id}`}
                onClick={() => onConnect(creator)}
                className="amber-pill-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold shadow-sm"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Collaborate
              </button>
            )}
          </div>
        </div>

        {/* RIGHT ~70% showcase */}
        <div className="min-w-0 flex-1 md:w-[70%]">
          {showcase.length > 0 ? (
            <div
              className="flex h-full gap-3 overflow-x-auto pb-1 scroll-smooth"
              style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
            >
              {showcase.map((item) => {
                const likedBy = likeMap[item.id]?.likedBy || [];
                const liked = myUid ? likedBy.includes(myUid) : false;
                const busy = likeMap[item.id]?.busy;
                return (
                  <div
                    key={item.id}
                    className="relative flex h-[200px] w-[min(100%,280px)] shrink-0 snap-start items-center justify-center overflow-hidden rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card-inner-bg)] p-3 shadow-sm sm:h-[220px] md:h-full md:min-h-[220px] md:w-[calc((100%-1.5rem)/3)] md:max-w-[calc((100%-1.5rem)/3)]"
                  >
                    <img
                      src={item.url}
                      alt={item.title || 'Portfolio'}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={(e) => handleLikeItem(e, item)}
                      disabled={!myUid || busy}
                      className={`absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-mono shadow-sm backdrop-blur-md transition-colors ${
                        liked
                          ? 'border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]'
                          : 'border-[var(--card-border)] bg-[var(--card-bg)]/90 text-[var(--text-muted)] hover:text-[var(--accent-amber)]'
                      }`}
                      aria-label={liked ? 'Unlike' : 'Like'}
                    >
                      <Heart size={12} className={liked ? 'fill-current' : ''} />
                      <span>{likedBy.length || ''}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center rounded-2xl bg-[var(--card-inner-bg)]/40 md:h-full md:min-h-[200px]">
              <p className="text-[11px] text-[var(--text-muted)]">No portfolio images yet</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
