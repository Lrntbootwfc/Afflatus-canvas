/**
 * Authorized Afflatus admin emails.
 * Add additional Gmail addresses to this array to grant admin access.
 * Also update firestore.rules isAdmin() email list to match.
 */
export const AFFLATUS_ADMIN_EMAILS: string[] = [
  'divyasharmagdscoist@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const n = email.trim().toLowerCase();
  return AFFLATUS_ADMIN_EMAILS.some((e) => e.trim().toLowerCase() === n);
}
