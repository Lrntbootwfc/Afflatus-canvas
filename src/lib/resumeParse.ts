/**
 * Client-side resume text extraction for profile autofill.
 * Supports .txt / .md fully; PDF can be added later via backend.
 */

export type ResumeExtract = {
  name?: string;
  email?: string;
  bio?: string;
  primaryRole?: string;
  secondaryRoles?: string[];
  socialLinks?: {
    linkedin?: string;
    instagram?: string;
    twitter?: string;
    facebook?: string;
    pinterest?: string;
    custom?: string;
  };
};

const ROLE_HINTS = [
  'cinematographer',
  'director of photography',
  'director',
  'editor',
  'video editor',
  'producer',
  'writer',
  'screenwriter',
  'sound designer',
  'sound recordist',
  'gaffer',
  'colorist',
  'photographer',
  'actor',
  'content creator',
  'camera operator',
  '1st ac',
  'first assistant camera',
  'production designer',
  'drone operator',
];

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t && t.length >= 2 && t.length <= 80 && !t.includes('@') && !/^https?:/i.test(t)) {
      // Prefer lines that look like names (2–4 words, mostly letters)
      const words = t.split(/\s+/);
      if (words.length >= 1 && words.length <= 5 && /^[\p{L}\s.'’-]+$/u.test(t)) {
        return t;
      }
    }
  }
  return '';
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  return Array.from(text.matchAll(re)).map((m) => m[0].replace(/[.,;]+$/, ''));
}

function pickSocial(urls: string[]): ResumeExtract['socialLinks'] {
  const out: NonNullable<ResumeExtract['socialLinks']> = {};
  for (const u of urls) {
    const lower = u.toLowerCase();
    if (lower.includes('linkedin.com') && !out.linkedin) out.linkedin = u;
    else if (lower.includes('instagram.com') && !out.instagram) out.instagram = u;
    else if ((lower.includes('twitter.com') || lower.includes('x.com')) && !out.twitter) out.twitter = u;
    else if (lower.includes('facebook.com') && !out.facebook) out.facebook = u;
    else if (lower.includes('pinterest.com') && !out.pinterest) out.pinterest = u;
    else if (!out.custom && (lower.includes('behance') || lower.includes('vimeo') || lower.includes('youtube') || lower.includes('portfolio'))) {
      out.custom = u;
    }
  }
  return out;
}

function extractRoles(text: string): { primary?: string; secondary: string[] } {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const hint of ROLE_HINTS) {
    if (lower.includes(hint)) {
      // Title-case the hint for display
      const label = hint
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (!found.includes(label)) found.push(label);
    }
  }
  return { primary: found[0], secondary: found.slice(1, 5) };
}

/**
 * Parse plain-text resume content into profile fields.
 * Caller must let the user review/edit before save.
 */
export function parseResumeText(text: string): ResumeExtract {
  const trimmed = (text || '').trim();
  if (!trimmed) return {};

  const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const urls = extractUrls(trimmed);
  const socialLinks = pickSocial(urls);
  const { primary, secondary } = extractRoles(trimmed);
  const name = firstNonEmptyLine(trimmed);
  // Bio: first ~600 chars of cleaned text (skip pure name line if matched)
  let bioBody = trimmed.replace(/\s+/g, ' ');
  if (name && bioBody.startsWith(name)) {
    bioBody = bioBody.slice(name.length).trim();
  }
  const bio = bioBody.slice(0, 600);

  return {
    name: name || undefined,
    email: emailMatch?.[0],
    bio: bio || undefined,
    primaryRole: primary,
    secondaryRoles: secondary.length ? secondary : undefined,
    socialLinks: Object.keys(socialLinks || {}).length ? socialLinks : undefined,
  };
}
