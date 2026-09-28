/**
 * Basic profile-completion percentage (not progressive 5-Q sets).
 * Based on persisted profile fields only.
 */

export type ProfileCompletionInput = {
  name?: string;
  primaryRole?: string;
  location?: string;
  bio?: string;
  avatarUrl?: string;
  portfolios?: unknown[];
  workLinks?: unknown[];
  socialLinks?: Record<string, string | undefined> | null;
  collaborationScenarios?: {
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    q5?: string;
  } | null;
  profileCompleted?: boolean;
};

export type ProfileCompletionResult = {
  percent: number;
  completed: number;
  total: number;
  checks: { id: string; label: string; done: boolean }[];
};

function hasText(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasPortfolioOrLink(p: ProfileCompletionInput): boolean {
  if (Array.isArray(p.portfolios) && p.portfolios.length > 0) return true;
  if (Array.isArray(p.workLinks) && p.workLinks.length > 0) return true;
  return false;
}

function hasSocial(p: ProfileCompletionInput): boolean {
  const s = p.socialLinks;
  if (!s || typeof s !== 'object') return false;
  return Object.values(s).some((v) => hasText(v));
}

function initialQuestionsDone(p: ProfileCompletionInput): boolean {
  const sc = p.collaborationScenarios;
  if (!sc) return false;
  // Require at least 3 of 5 answered to count toward basic completion
  const answered = [sc.q1, sc.q2, sc.q3, sc.q4, sc.q5].filter(hasText).length;
  return answered >= 3;
}

/**
 * Compute basic profile completion from persisted profile data.
 * Does NOT include later progressive 5-question sets.
 */
export function computeProfileCompletion(profile: ProfileCompletionInput | null | undefined): ProfileCompletionResult {
  const p = profile || {};
  const checks: ProfileCompletionResult['checks'] = [
    { id: 'name', label: 'Name', done: hasText(p.name) },
    { id: 'primaryRole', label: 'Primary role', done: hasText(p.primaryRole) },
    { id: 'location', label: 'Location', done: hasText(p.location) },
    { id: 'portfolio', label: 'At least one portfolio/work item or link', done: hasPortfolioOrLink(p) },
    { id: 'bio', label: 'Bio', done: hasText(p.bio) },
    { id: 'avatar', label: 'Profile photo', done: hasText(p.avatarUrl) },
    { id: 'socials', label: 'Social link (optional boost)', done: hasSocial(p) },
    { id: 'initialQuestions', label: 'Initial collaboration questions', done: initialQuestionsDone(p) },
  ];

  // Weighted: social is optional (still counted if present, but base total excludes it for "required")
  // Simple equal weight over core fields; social is included so filling it raises % slightly.
  const completed = checks.filter((c) => c.done).length;
  const total = checks.length;
  const percent = Math.round((completed / total) * 100);
  return { percent, completed, total, checks };
}

/** Derive public works count from portfolios + optional showcase works length. */
export function deriveWorksCount(profile: {
  portfolios?: unknown[];
  worksCount?: number;
}, showcaseWorksLength = 0): number {
  const portfolioLen = Array.isArray(profile.portfolios) ? profile.portfolios.length : 0;
  // Prefer max of persisted worksCount and live lengths so display never under-counts
  const persisted = typeof profile.worksCount === 'number' ? profile.worksCount : 0;
  return Math.max(portfolioLen + showcaseWorksLength, persisted, portfolioLen, showcaseWorksLength);
}
