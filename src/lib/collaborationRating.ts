/**
 * Collaboration profile display + confidence helpers.
 * Trait scores are a blend of:
 *  1) Initial scenario Q analysis (profile setup)
 *  2) Progressive behavioural Q merge
 *  3) Peer feedback (Bayesian update on server)
 * confidenceScores: per-trait 0–1 from analysis/progressive; boosted by peer reviews.
 */

export const COLLAB_TRAIT_KEYS = [
  'creativity',
  'communication',
  'flexibility',
  'reliability',
  'teamwork',
  'feedback_openness',
  'leadership',
  'technical_proficiency',
] as const;

export type CollabTraitKey = (typeof COLLAB_TRAIT_KEYS)[number];

const META_KEYS = new Set([
  'feedbackCount',
  'confidenceScores',
  'progressiveSignalsUpdatedAt',
  'updatedAt',
  'source',
]);

export type CollaborationProfileLike = Record<string, unknown> & {
  feedbackCount?: number;
  confidenceScores?: Record<string, number>;
  progressiveSignalsUpdatedAt?: string;
};

/** Only numeric trait dimensions (never confidenceScores object / meta). */
export function getTraitEntries(
  cp: CollaborationProfileLike | null | undefined
): { key: string; score: number }[] {
  if (!cp || typeof cp !== 'object') return [];
  const out: { key: string; score: number }[] = [];
  for (const key of COLLAB_TRAIT_KEYS) {
    const v = Number((cp as any)[key]);
    if (Number.isFinite(v)) out.push({ key, score: v });
  }
  // Any extra numeric dims (except meta)
  for (const [k, v] of Object.entries(cp)) {
    if (META_KEYS.has(k) || COLLAB_TRAIT_KEYS.includes(k as CollabTraitKey)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ key: k, score: v });
  }
  return out;
}

/**
 * Overall confidence 0–100 for display.
 * - Mean of per-trait confidenceScores (AI / progressive), default 0.25 if missing
 * - + peer review boost (up to +40 as feedbackCount grows)
 * - + progressive boost if progressiveSignalsUpdatedAt set
 */
export function computeOverallConfidencePercent(
  cp: CollaborationProfileLike | null | undefined
): number {
  if (!cp) return 0;
  const conf = cp.confidenceScores && typeof cp.confidenceScores === 'object' ? cp.confidenceScores : {};
  const confVals = COLLAB_TRAIT_KEYS.map((k) => Number(conf[k])).filter(
    (n) => Number.isFinite(n) && n >= 0
  );
  let base = confVals.length
    ? confVals.reduce((a, b) => a + b, 0) / confVals.length
    : 0.25;
  base = Math.max(0, Math.min(1, base));

  const reviews = Number(cp.feedbackCount) || 0;
  // Each review adds confidence; caps at +0.4
  const peerBoost = Math.min(0.4, reviews * 0.12);

  const progressiveBoost = cp.progressiveSignalsUpdatedAt ? 0.08 : 0;

  const total = Math.max(0, Math.min(1, base * 0.7 + peerBoost + progressiveBoost + base * 0.3));
  return Math.round(total * 100);
}

/** True when scores look like untouched neutral defaults and no peer/progressive signal. */
export function isNeutralPlaceholder(
  cp: CollaborationProfileLike | null | undefined
): boolean {
  if (!cp) return true;
  const reviews = Number(cp.feedbackCount) || 0;
  if (reviews > 0) return false;
  if (cp.progressiveSignalsUpdatedAt) return false;
  const traits = getTraitEntries(cp);
  if (!traits.length) return true;
  return traits.every((t) => Math.abs(t.score - 5) < 0.05);
}

export function ratingSectionTitle(cp: CollaborationProfileLike | null | undefined): string {
  const reviews = Number(cp?.feedbackCount) || 0;
  if (reviews > 0) return 'Collaboration ratings';
  return 'Collaboration signals';
}

export function ratingSectionSubtitle(cp: CollaborationProfileLike | null | undefined): string {
  const reviews = Number(cp?.feedbackCount) || 0;
  const hasProgressive = Boolean(cp?.progressiveSignalsUpdatedAt);
  const parts: string[] = [];
  parts.push('profile scenario answers');
  if (hasProgressive) parts.push('behavioural questions');
  if (reviews > 0) parts.push(`${reviews} peer review${reviews === 1 ? '' : 's'}`);
  return `Based on ${parts.join(' · ')}`;
}
