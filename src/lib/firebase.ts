import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  deleteUser as fbDeleteUser,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  limit,
  enableNetwork,
  connectFirestoreEmulator,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import type { CreatorProfile, Project, Match } from '../types';
import type {
  WorkShowcase,
  ProjectTask,
  CreativeClub,
  ExploreCreatorItem,
  ExploreFeedResponse,
} from '../types/explore';

/** Connection request stored in Firestore */
export interface SharedPostRef {
  postId: string;
  url?: string;
  caption?: string;
  imageUrl?: string;
  authorName?: string;
  authorId?: string;
}


/** Deterministic 1:1 direct-message id for a user pair (order-independent). */
export function directPairId(userA: string, userB: string): string {
  const [a, b] = [String(userA), String(userB)].sort();
  return `dm_${a}_${b}`;
}

/** Strip internal Firestore/SDK messages from anything shown to users. */

/** Coerce Firestore Timestamp | Date | string | number to sortable ISO string */
function toSortKey(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  const any = v as { toDate?: () => Date; seconds?: number };
  if (typeof any.toDate === 'function') {
    try {
      return any.toDate().toISOString();
    } catch {
      /* fall through */
    }
  }
  if (typeof any.seconds === 'number') {
    return new Date(any.seconds * 1000).toISOString();
  }
  return String(v);
}

function toSortMs(v: unknown): number {
  const s = toSortKey(v);
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : 0;
}

export function sanitizeUserFacingError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg = String((err as any)?.message || err || '');
  const lower = msg.toLowerCase();
  if (
    lower.includes('target id already exists') ||
    lower.includes('already exists') && lower.includes('target') ||
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('failed-precondition') ||
    lower.includes('requires an index') ||
    lower.includes('firebase') ||
    lower.includes('firestore') ||
    /[a-z0-9]{20,}/i.test(msg) && lower.includes('error')
  ) {
    return fallback;
  }
  // Keep short, human messages we intentionally throw
  if (msg.length > 180) return fallback;
  return msg || fallback;
}

export interface ConnectionRequest {
  id: string;
  senderId: string;
  recipientId: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'collaborating' | 'completed';
  /** Instagram-style: share/message without prior acceptance */
  kind?: 'connection' | 'message_request' | 'post_share';
  sharedPost?: SharedPostRef;
  collaborateRequestedBy?: string[];
  feedbackGivenBy?: string[];
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  taskId?: string;
  /** Per-user unread counts on this DM (userId → count) */
  unreadCounts?: Record<string, number>;
  lastMessageAt?: string;
  lastMessageText?: string;
  pairKey?: string;
}

// Firebase config — ONLY from environment variables (.env local / Render env).
// Do not import firebase-applet-config.json.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || undefined,
};

if (typeof window !== 'undefined') {
  const required = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(
      '[Firebase] Missing environment variables:',
      missing.join(', '),
      '— add them to .env (local) or Render Environment Variables, then restart (local) or clear build cache & redeploy (Render).'
    );
  }
}

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Basic Google sign-in only (profile + email). Do NOT request gmail.send on login —
// that sensitive scope triggers Google's "app isn't verified" warning until OAuth verification.
// Request Gmail scopes only in a dedicated "Connect Gmail" flow after verification.
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory cache for OAuth access token (per Workspace security guidelines)
let cachedGmailAccessToken: string | null = null;

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function setCachedGmailAccessToken(token: string | null): void {
  cachedGmailAccessToken = token;
}

/**
 * Send authentic OTP Verification Email via Gmail API
 */
export async function sendEmailViaGmailApi(
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  customToken?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = customToken || cachedGmailAccessToken;
  if (!token) {
    return { success: false, error: 'No active Google OAuth token available for sending mail.' };
  }

  try {
    const rawMessage = [
      `To: ${recipientEmail}`,
      `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlContent,
    ].join('\r\n');

    const base64Encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Encoded }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gmail API HTTP ${res.status}`);
    }

    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    console.error('Failed to send email via Gmail API:', err);
    return { success: false, error: err.message || 'Error communicating with Gmail API' };
  }
}

// Initialize Firestore
// experimentalForceLongPolling helps avoid false "client is offline" on some localhost / proxy networks
const customDbId = (import.meta.env.VITE_FIRESTORE_DATABASE_ID as string) || undefined;
function createFirestore() {
  try {
    // Prefer initializeFirestore so we can pass settings (only works once per app)
    if (customDbId) {
      return initializeFirestore(app, customDbId as any);
    }
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    } as any);
  } catch {
    // Already initialized (HMR) — reuse existing instance
    return customDbId ? getFirestore(app, customDbId) : getFirestore(app);
  }
}
export const db = createFirestore();

/** Ensure we try the network before reads/writes (clears sticky offline state) */
async function ensureFirestoreOnline(): Promise<void> {
  try {
    await enableNetwork(db);
  } catch {
    // ignore — may already be online
  }
}

/** getDoc that prefers server; clearer errors when Firestore is unreachable */
async function getDocOnline(ref: ReturnType<typeof doc>) {
  await ensureFirestoreOnline();
  try {
    return await getDocFromServer(ref);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    // Fall back to cache/default getDoc if server path fails for non-offline reasons
    if (!msg.includes('offline') && err?.code !== 'unavailable') {
      return await getDoc(ref);
    }
    throw err;
  }
}

/**
 * Sign in with Google Popup (requests profile, email, and gmail.send scopes)
 */
export async function signInWithGoogle(fallbackEmail?: string, fallbackName?: string): Promise<{ user: Partial<FirebaseUser> & { uid: string; email: string | null; displayName: string | null; photoURL: string | null }; profile: CreatorProfile; accessToken?: string }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedGmailAccessToken = credential.accessToken;
    }
    const fbUser = result.user;
    const profile = await syncUserProfileToFirestore(fbUser);
    return { user: fbUser, profile, accessToken: credential?.accessToken || undefined };
  } catch (error: any) {
    if (
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.code === 'auth/popup-blocked'
    ) {
      console.info('[Auth] Google Sign-In popup closed or dismissed by user.');
      throw error;
    } else if (error.code === 'auth/unauthorized-domain' || error.message?.includes('unauthorized-domain')) {
      console.error('[Auth] Unauthorized domain. Add this domain in Firebase Console → Authentication → Settings → Authorized domains.');
      throw new Error(
        'This domain is not authorized for Google sign-in. Add it under Firebase Authentication → Authorized domains, then try again.'
      );
    } else {
      console.error('Google Sign In Error:', error);
      throw error;
    }
  }
}

/**
 * Sign in with Email / Password
 */
export async function signInWithEmail(email: string, pass: string): Promise<{ user: FirebaseUser; profile: CreatorProfile }> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    const profile = await syncUserProfileToFirestore(result.user);
    return { user: result.user, profile };
  } catch (error: any) {
    // If user not found, try to auto-create user for frictionless onboarding
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      try {
        const createResult = await createUserWithEmailAndPassword(auth, email, pass);
        const profile = await syncUserProfileToFirestore(createResult.user, {
          name: email.split('@')[0],
          email: email
        });
        return { user: createResult.user, profile };
      } catch (createErr) {
        throw error;
      }
    }
    throw error;
  }
}

/**
 * Sign Up with Email / Password
 */
export async function signUpWithEmail(email: string, pass: string, name?: string, role?: string, location?: string): Promise<{ user: FirebaseUser; profile: CreatorProfile }> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  const profile = await syncUserProfileToFirestore(result.user, {
    name: name || email.split('@')[0],
    email: email,
    primaryRole: role || 'Cinematographer',
    location: location || 'not_specified'
  });
  return { user: result.user, profile };
}

/**
 * Sign Out
 */
export async function signOut(): Promise<void> {
  setCachedGmailAccessToken(null);
  await fbSignOut(auth);
}

/**
 * Sync / Upsert a User profile in Firestore
 * Handles offline / unprovisioned database state gracefully without crashing or throwing
 */
export async function syncUserProfileToFirestore(
  fbUser: FirebaseUser,
  customData?: Partial<CreatorProfile>
): Promise<CreatorProfile> {
  const defaultUsername = fbUser.email ? fbUser.email.split('@')[0] : `creator_${Date.now()}`;

  // Minimal empty profile — NO demo rates, locations, gear, reels, or seeking roles
  const emptyProfile: CreatorProfile = {
    id: fbUser.uid,
    username: customData?.username || defaultUsername,
    email: fbUser.email || customData?.email || '',
    name: customData?.name || fbUser.displayName || defaultUsername,
    avatarUrl: customData?.avatarUrl || fbUser.photoURL || '',
    bio: customData?.bio || '',
    primaryRole: customData?.primaryRole || '',
    secondaryRoles: customData?.secondaryRoles || [],
    seekingRoles: customData?.seekingRoles || [],
    location: customData?.location || '',
    travelRadiusMiles: customData?.travelRadiusMiles ?? 0,
    dayRateUsd: customData?.dayRateUsd ?? 0,
    hourlyRateUsd: customData?.hourlyRateUsd ?? 0,
    pastBudgetTiers: customData?.pastBudgetTiers || [],
    communicationStyle: customData?.communicationStyle || 'collaborative_brainstormer',
    gearItems: customData?.gearItems || [],
    portfolios: customData?.portfolios || [],
    workLinks: customData?.workLinks || [],
    socialLinks: customData?.socialLinks || {},
    profileCompleted: customData?.profileCompleted ?? false,
    userRole: customData?.userRole || 'collaborator',
    createdAt: customData?.createdAt || new Date().toISOString(),
  };

  try {
    const userRef = doc(db, 'users', fbUser.uid);
    await ensureFirestoreOnline();
    const docSnap = await getDocOnline(userRef);

    if (docSnap.exists()) {
      // Existing profile is source of truth — never re-apply empty/demo defaults over saved fields
      const data = docSnap.data() as CreatorProfile;
      const updated: CreatorProfile = {
        ...emptyProfile,
        ...data,
        ...(customData || {}),
        id: fbUser.uid,
        // Keep auth identity in sync without wiping user-edited fields
        email: fbUser.email || data.email || emptyProfile.email,
        name: (customData?.name !== undefined ? customData.name : null) || data.name || fbUser.displayName || emptyProfile.name,
        avatarUrl:
          (customData?.avatarUrl !== undefined ? customData.avatarUrl : null) ||
          data.avatarUrl ||
          fbUser.photoURL ||
          '',
      };
      // Only write if caller provided customData (e.g. signup fields); otherwise just return stored profile
      if (customData && Object.keys(customData).length > 0) {
        await setDoc(userRef, { ...updated, updatedAt: serverTimestamp() }, { merge: true });
      }
      return updated;
    }

    // New user — create minimal doc and await write
    await setDoc(userRef, { ...emptyProfile, updatedAt: serverTimestamp() });
    return emptyProfile;
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const code = String(err?.code || '');
    console.warn('[Firestore] Profile sync failed:', code, msg);
    if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
      // Surface clearly — usually means firestore.rules not published or users create rule mismatch
      throw new Error(
        'Insufficient permission to create your profile. Publish the latest firestore.rules (users create for your own uid) and try again.'
      );
    }
    return emptyProfile;
  }
}

/**
 * Fetch profile from Firestore by user ID with offline fallback
 */
export async function getProfileFromFirestore(userId: string): Promise<CreatorProfile | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDocOnline(userRef);
    if (snap.exists()) {
      return { id: userId, ...(snap.data() as CreatorProfile) };
    }
    return null;
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    console.warn(
      '[Firestore] Profile fetch failed:',
      msg,
      msg.includes('offline')
        ? '→ Check: 1) Firestore is enabled in Firebase Console 2) Project ID / API key match 3) Network allows firestore.googleapis.com'
        : ''
    );
    return null;
  }
}

/**
 * Update profile in Firestore with offline resilience
 */
export async function updateProfileInFirestore(profile: CreatorProfile): Promise<CreatorProfile> {
  if (!profile?.id) {
    throw new Error('Profile id is required to save.');
  }
  await ensureFirestoreOnline();
  const userRef = doc(db, 'users', profile.id);
  const payload = {
    ...profile,
    id: profile.id,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(userRef, payload, { merge: true });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.includes('offline') || err?.code === 'unavailable') {
      throw new Error(
        'Firestore is offline. Enable Cloud Firestore in Firebase Console for this project, check your internet, and confirm VITE_FIREBASE_* / firebase config match project creates-b8e17.'
      );
    }
    throw err;
  }
  const snap = await getDocOnline(userRef);
  if (snap.exists()) {
    return { id: profile.id, ...(snap.data() as CreatorProfile) };
  }
  return profile;
}

/**
 * Seed initial sample creators and projects to Firestore if collections are empty
 */
export async function seedFirestoreIfEmpty(seedUsers: CreatorProfile[], seedProjects: Project[], seedMatches: Match[]) {
  try {
    const usersSnap = await Promise.race([
      getDocs(collection(db, 'users')),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore client is offline')), 2000)
      ),
    ]);
    if (usersSnap && usersSnap.empty && seedUsers.length > 0) {
      for (const u of seedUsers) {
        await setDoc(doc(db, 'users', u.id), u);
      }
      console.info('[Firestore] Seeded creators successfully');
    }

    const projectsSnap = await Promise.race([
      getDocs(collection(db, 'projects')),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore client is offline')), 2000)
      ),
    ]);
    if (projectsSnap && projectsSnap.empty && seedProjects.length > 0) {
      for (const p of seedProjects) {
        await setDoc(doc(db, 'projects', p.id), p);
      }
      console.info('[Firestore] Seeded projects successfully');
    }

    const matchesSnap = await Promise.race([
      getDocs(collection(db, 'matches')),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore client is offline')), 2000)
      ),
    ]);
    if (matchesSnap && matchesSnap.empty && seedMatches.length > 0) {
      for (const m of seedMatches) {
        await setDoc(doc(db, 'matches', m.id), m);
      }
      console.info('[Firestore] Seeded matches successfully');
    }
  } catch (err: any) {
    console.warn('[Firestore] Auto-seed skipped (offline mode):', err?.message || err);
  }
}

// ============================================================================
// EXPLORE + CONNECTIONS (Firestore source of truth — no database.json dependency)
// ============================================================================

async function fetchCollectionSafe<T>(collectionName: string): Promise<T[]> {
  try {
    const snap = await Promise.race([
      getDocs(collection(db, collectionName)),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore client is offline')), 4000)
      ),
    ]);
    if (!snap) return [];
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
  } catch (err: any) {
    console.warn(`[Firestore] ${collectionName} fetch failed:`, err?.message || err);
    return [];
  }
}

/**
 * Load the Explore discovery feed from Firestore.
 * Returns empty arrays when collections are empty (no hardcoded demo mixing).
 */
export async function fetchExploreFeedFromFirestore(params?: {
  userId?: string;
  category?: string;
  search?: string;
}): Promise<ExploreFeedResponse> {
  const cat = (params?.category || 'all').toLowerCase();
  const q = (params?.search || '').trim().toLowerCase();

  const [users, projects, tasks, works, clubs] = await Promise.all([
    fetchCollectionSafe<CreatorProfile>('users'),
    fetchCollectionSafe<Project>('projects'),
    fetchCollectionSafe<ProjectTask>('tasks'),
    fetchCollectionSafe<WorkShowcase>('works'),
    fetchCollectionSafe<CreativeClub>('clubs'),
  ]);

  // Build user map for attaching creator refs (public fields only)
  const userMap = new Map(users.map((u) => [u.id, u]));
  const toPublic = (u?: CreatorProfile): CreatorProfile | undefined => {
    if (!u) return undefined;
    const { email: _e, ...rest } = u as CreatorProfile & { email?: string; passwordHash?: string };
    // Keep email off public explorer payloads where possible; directory still needs basic identity
    return { ...rest, email: u.email || '' } as CreatorProfile;
  };

  let worksOut: WorkShowcase[] = works.map((w) => ({
    ...w,
    creator: toPublic(userMap.get(w.creatorId)),
    collaborators: (w.collaboratorIds || [])
      .map((id) => toPublic(userMap.get(id)))
      .filter(Boolean) as CreatorProfile[],
  }));

  let projectsOut: Project[] = projects.map((p) => ({
    ...p,
    seeker: toPublic(userMap.get((p as any).seekerId)),
    collaborators: ((p as any).collaboratorIds || [])
      .map((id: string) => toPublic(userMap.get(id)))
      .filter(Boolean) as CreatorProfile[],
  }));

  let tasksOut: ProjectTask[] = tasks.map((t) => ({
    ...t,
    creator: toPublic(userMap.get(t.creatorId)),
  }));

  let clubsOut: CreativeClub[] = clubs.map((c) => ({
    ...c,
    leadCreator: toPublic(userMap.get(c.leadCreatorId)),
  }));

  // Category filter
  if (cat && cat !== 'all') {
    worksOut = worksOut.filter(
      (w) =>
        (w.category || '').toLowerCase() === cat ||
        (w.tags || []).some((t) => t.toLowerCase() === cat)
    );
    projectsOut = projectsOut.filter(
      (p) =>
        (p.genreTags || []).some((g) => g.toLowerCase() === cat) ||
        (p.parsedRequirements?.rolesNeeded || []).some((r) =>
          r.roleTitle.toLowerCase().includes(cat)
        )
    );
    tasksOut = tasksOut.filter(
      (t) =>
        (t.category || '').toLowerCase() === cat ||
        (t.requiredRole || '').toLowerCase().includes(cat)
    );
    clubsOut = clubsOut.filter(
      (c) =>
        (c.category || '').toLowerCase() === cat ||
        (c.tags || []).some((t) => t.toLowerCase() === cat)
    );
  }

  // Search filter
  if (q) {
    worksOut = worksOut.filter(
      (w) =>
        w.title?.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q) ||
        (w.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        w.creator?.name?.toLowerCase().includes(q)
    );
    projectsOut = projectsOut.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.rawTextBrief?.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q) ||
        (p.genreTags || []).some((g) => g.toLowerCase().includes(q)) ||
        (p as any).seeker?.name?.toLowerCase().includes(q)
    );
    tasksOut = tasksOut.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.requiredRole?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q)
    );
    clubsOut = clubsOut.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.tagline?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }

  // Creators: exclude current user; optional search
  let creatorsOut: ExploreCreatorItem[] = users
    .filter((u) => u.id !== params?.userId)
    .map((u) => {
      const publicU = toPublic(u)!;
      return {
        ...publicU,
        discoveryReason: publicU.primaryRole
          ? `Active ${publicU.primaryRole}${publicU.location ? ` · ${publicU.location}` : ''}`
          : 'Creator on Afflatus',
        relevanceScore: publicU.profileCompleted ? 0.7 : 0.4,
      };
    });

  if (cat && cat !== 'all') {
    creatorsOut = creatorsOut.filter(
      (c) =>
        c.primaryRole?.toLowerCase().includes(cat) ||
        (c.secondaryRoles || []).some((r) => r.toLowerCase().includes(cat)) ||
        (c.seekingRoles || []).some((r) => r.toLowerCase().includes(cat))
    );
  }
  if (q) {
    creatorsOut = creatorsOut.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.primaryRole?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        c.bio?.toLowerCase().includes(q)
    );
  }

  return {
    success: true,
    activeCategory: cat,
    counts: {
      works: worksOut.length,
      projects: projectsOut.length,
      tasks: tasksOut.length,
      clubs: clubsOut.length,
      creators: creatorsOut.length,
    },
    featuredWorks: worksOut,
    projects: projectsOut,
    tasks: tasksOut,
    clubs: clubsOut,
    suggestedCreators: creatorsOut,
  };
}

/**
 * Create a connection / apply request in Firestore.
 * Prevents duplicates for same sender+recipient+project/task pair.
 * Requires authenticated sender (auth.uid === senderId).
 */
export async function createConnectionRequest(params: {
  senderId: string;
  recipientId: string;
  message: string;
  projectId?: string;
  taskId?: string;
  kind?: 'connection' | 'message_request' | 'post_share';
  sharedPost?: SharedPostRef;
}): Promise<{ connection: ConnectionRequest; alreadyExists: boolean }> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('You must be signed in as the sender to create a connection request.');
  }
  // Always use Firebase Auth uid as sender — never trust a stale profile id alone
  const senderId = current.uid;
  if (senderId !== params.senderId) {
    console.warn('[createConnectionRequest] senderId mismatch; using auth.uid', {
      provided: params.senderId,
      authUid: senderId,
    });
  }
  if (senderId === params.recipientId) {
    throw new Error('You cannot connect with yourself.');
  }
  params = { ...params, senderId };

  // Application + profile gates (cannot be bypassed client-side alone)
  try {
    const senderSnap = await getDoc(doc(db, 'users', senderId));
    const senderData = senderSnap.exists() ? senderSnap.data() : null;
    const appStatus = resolveApplicationStatus(senderData as any);
    if (appStatus !== 'approved') {
      throw new Error('Your Afflatus application must be approved before collaborating.');
    }
    if (!senderData?.profileCompleted) {
      throw new Error(
        'Complete your profile before sending collaboration proposals. Add your roles, location, and required details in Profile Setup.'
      );
    }
  } catch (e: any) {
    if (
      e?.message?.includes('Complete your profile') ||
      e?.message?.includes('application must be approved')
    )
      throw e;
    console.warn('[createConnectionRequest] profile check failed:', e?.message || e);
  }

  // --- One pair of users → at most one direct connection/DM ---
  const pairKey = [senderId, params.recipientId].sort().join('_');
  const pairId = `dm_${pairKey}`;

  // Prefer deterministic doc id
  const pairRef = doc(db, 'connections', pairId);
  const pairSnap = await getDoc(pairRef);
  if (pairSnap.exists()) {
    const existing = { id: pairSnap.id, ...pairSnap.data() } as ConnectionRequest;
    return { connection: existing, alreadyExists: true };
  }

  // Also scan legacy random ids for same pair (either direction)
  const [asSender, asRecipient] = await Promise.all([
    getDocs(query(collection(db, 'connections'), where('senderId', '==', senderId))),
    getDocs(query(collection(db, 'connections'), where('recipientId', '==', senderId))),
  ]);
  const legacy = [...asSender.docs, ...asRecipient.docs]
    .map((d) => ({ id: d.id, ...d.data() } as ConnectionRequest))
    .find((c) => {
      const other = c.senderId === senderId ? c.recipientId : c.senderId;
      return other === params.recipientId;
    });
  if (legacy) {
    return { connection: legacy, alreadyExists: true };
  }

  const id = pairId;
  const connection: ConnectionRequest = {
    id,
    senderId,
    recipientId: params.recipientId,
    message: params.message || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    pairKey,
    unreadCounts: { [senderId]: 0, [params.recipientId]: 0 },
  };
  // Firestore rejects `undefined` field values — only include optional fields when set
  if (params.projectId) connection.projectId = params.projectId;
  if (params.taskId) connection.taskId = params.taskId;
  if (params.kind) connection.kind = params.kind;
  if (params.sharedPost) connection.sharedPost = params.sharedPost;

  const payload: Record<string, unknown> = {
    id: connection.id,
    senderId: connection.senderId,
    recipientId: connection.recipientId,
    message: connection.message,
    status: connection.status,
    createdAt: connection.createdAt,
    pairKey,
    unreadCounts: connection.unreadCounts,
    createdAtTs: serverTimestamp(),
  };
  if (connection.projectId) payload.projectId = connection.projectId;
  if (connection.taskId) payload.taskId = connection.taskId;
  if (connection.kind) payload.kind = connection.kind;
  if (connection.sharedPost) payload.sharedPost = connection.sharedPost;

  try {
    await setDoc(pairRef, payload);
  } catch (err: any) {
    // Race: another client created the same pair — reuse
    const again = await getDoc(pairRef);
    if (again.exists()) {
      return { connection: { id: again.id, ...again.data() } as ConnectionRequest, alreadyExists: true };
    }
    throw err;
  }

  try {
    await createNotification({
      userId: params.recipientId,
      type: 'connection_request',
      title: params.kind === 'post_share' || params.kind === 'message_request'
        ? 'Message request'
        : 'New connection request',
      body: params.kind === 'post_share'
        ? (params.message?.slice(0, 120) || 'Shared a post with you')
        : (params.message?.slice(0, 120) || 'Someone wants to connect with you.'),
      relatedId: id,
      fromUserId: senderId,
    });
  } catch {
    /* non-blocking */
  }

  return { connection, alreadyExists: false };
}


/**
 * List connections involving the given user (as sender or recipient).
 * Uses filtered queries so Firestore rules can authorize participant-only reads.
 */
export async function getConnectionsForUser(userId: string): Promise<ConnectionRequest[]> {
  const runQuery = async (): Promise<ConnectionRequest[]> => {
    const asSender = await getDocs(query(collection(db, 'connections'), where('senderId', '==', userId)));
    const asRecipient = await getDocs(query(collection(db, 'connections'), where('recipientId', '==', userId)));
    const byId = new Map<string, ConnectionRequest>();
    for (const d of [...asSender.docs, ...asRecipient.docs]) {
      byId.set(d.id, { id: d.id, ...d.data() } as ConnectionRequest);
    }
    // Deduplicate 1:1 pairs (legacy random ids + dm_* ids for same people)
    const statusRank: Record<string, number> = {
      collaborating: 4,
      accepted: 3,
      completed: 2,
      pending: 1,
      declined: 0,
    };
    const byPair = new Map<string, ConnectionRequest>();
    for (const c of byId.values()) {
      const other = c.senderId === userId ? c.recipientId : c.senderId;
      const key = [userId, other].sort().join('_');
      const prev = byPair.get(key);
      if (!prev) {
        byPair.set(key, c);
        continue;
      }
      const rNew = statusRank[c.status] ?? 0;
      const rOld = statusRank[prev.status] ?? 0;
      if (rNew > rOld) byPair.set(key, c);
      else if (rNew === rOld && toSortMs(c.createdAt) > toSortMs(prev.createdAt)) byPair.set(key, c);
      // Prefer deterministic dm_ id when ranks equal
      else if (rNew === rOld && c.id.startsWith('dm_') && !prev.id.startsWith('dm_')) byPair.set(key, c);
    }
    return Array.from(byPair.values()).sort((a, b) =>
      toSortMs(b.lastMessageAt || b.updatedAt || b.createdAt) -
      toSortMs(a.lastMessageAt || a.updatedAt || a.createdAt)
    );
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runQuery();
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Internal SDK conflict — never surface to UI
      if (msg.toLowerCase().includes('target id already exists') && attempt < 2) {
        console.warn(`[Firestore] getConnectionsForUser: query target conflict, retry ${attempt + 1}/3`);
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      console.warn('[Firestore] getConnectionsForUser failed:', msg);
      return [];
    }
  }
  return [];
}

/**
 * Accept or decline a connection. Only the recipient may update status.
 */
export async function respondToConnection(
  connectionId: string,
  status: 'accepted' | 'declined',
  actingUserId: string
): Promise<ConnectionRequest> {
  const current = auth.currentUser;
  if (!current || current.uid !== actingUserId) {
    throw new Error('You must be signed in to respond to a connection.');
  }

  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Connection request not found.');
  }
  const data = snap.data() as ConnectionRequest;
  if (data.recipientId !== actingUserId) {
    throw new Error('Only the recipient can accept or decline this request.');
  }

  // Idempotent: already handled → return as-is (no second notification / side effects)
  if (data.status === 'accepted' || data.status === 'collaborating' || data.status === 'completed') {
    if (status === 'accepted' || status === 'declined') {
      return { ...data, id: connectionId };
    }
  }
  if (data.status === 'declined' && status === 'declined') {
    return { ...data, id: connectionId };
  }
  if (data.status === 'declined' && status === 'accepted') {
    throw new Error('This request was already declined.');
  }

  const updated: ConnectionRequest = {
    ...data,
    id: connectionId,
    status,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  if (status === 'accepted') {
    try {
      await createNotification({
        userId: data.senderId,
        type: 'connection_accepted',
        title: 'Connection accepted',
        body: 'Your connection request was accepted. You can now message each other.',
        relatedId: connectionId,
        fromUserId: actingUserId,
      });
    } catch {
      /* non-blocking */
    }
  }
  return updated;
}

/**
 * Request or upgrade a connection to collaboration status.
 */
export async function toggleCollaborationStatus(
  connectionId: string,
  actingUserId: string
): Promise<ConnectionRequest> {
  const current = auth.currentUser;
  if (!current || current.uid !== actingUserId) {
    throw new Error('You must be signed in to request collaboration.');
  }

  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Connection not found.');
  const data = snap.data() as ConnectionRequest;
  if (data.senderId !== actingUserId && data.recipientId !== actingUserId) {
    throw new Error('You are not part of this connection.');
  }

  const requested = new Set(data.collaborateRequestedBy || []);
  requested.add(actingUserId);
  const list = Array.from(requested);
  const both = list.length >= 2;
  const nextStatus = both ? 'collaborating' : data.status === 'pending' ? 'accepted' : data.status;

  await updateDoc(ref, {
    collaborateRequestedBy: list,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });

  const peerId = data.senderId === actingUserId ? data.recipientId : data.senderId;
  try {
    await createNotification({
      userId: peerId,
      type: 'connection_accepted',
      title: both ? 'Collaboration started' : 'Collaboration requested',
      body: both
        ? 'You are now collaborating on Afflatus.'
        : 'Your connection partner requested to collaborate.',
      relatedId: connectionId,
      fromUserId: actingUserId,
    });
  } catch {
    /* non-blocking */
  }

  return {
    ...data,
    id: connectionId,
    collaborateRequestedBy: list,
    status: nextStatus as ConnectionRequest['status'],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Submit feedback for a creator and update their collaboration profile.
 * Routes through the backend API since Firestore rules prevent writing to another user's doc.
 */
export async function submitCollaborationFeedback(
  targetUserId: string,
  ratings: Record<string, number>
): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error('You must be signed in to submit feedback.');

  const res = await fetch(`/api/feedback/${targetUserId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': current.uid,
    },
    body: JSON.stringify({ ratings }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to submit feedback.');
  }
}

/**
 * Create or update a project owned by the current user (seekerId must match auth.uid).
 */
export async function saveProjectToFirestore(project: Project & { seekerId: string }): Promise<Project> {
  const current = auth.currentUser;
  if (!current || current.uid !== project.seekerId) {
    throw new Error('You can only create or edit your own projects.');
  }
  const id = project.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const payload = { ...project, id, updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'projects', id), payload, { merge: true });
  return { ...project, id };
}

/**
 * Create or update a work showcase owned by the current user.
 */

/** Works owned by a creator (persistent source for profile counts/list). */
export async function getUserWorksFromFirestore(creatorId: string): Promise<WorkShowcase[]> {
  if (!creatorId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'works'), where('creatorId', '==', creatorId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkShowcase));
  } catch (e) {
    console.warn('[Firestore] getUserWorksFromFirestore failed', e);
    return [];
  }
}

export async function saveWorkToFirestore(work: WorkShowcase): Promise<WorkShowcase> {
  const current = auth.currentUser;
  if (!current || current.uid !== work.creatorId) {
    throw new Error('You can only create or edit your own work showcases.');
  }
  const id = work.id || `work_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const isNew = !work.id;
  const payload = { ...work, id, updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'works', id), payload, { merge: true });
  if (isNew) {
    try {
      const userRef = doc(db, 'users', work.creatorId);
      const snap = await getDoc(userRef);
      const prev = snap.exists() ? Number((snap.data() as any)?.worksCount) || 0 : 0;
      await setDoc(userRef, { worksCount: prev + 1, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('[works] worksCount increment failed', e);
    }
  }
  return { ...work, id };
}

/** Delete a work showcase and decrement worksCount on the user profile. */
export async function deleteWorkFromFirestore(workId: string, creatorId: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== creatorId) {
    throw new Error('You can only delete your own work showcases.');
  }
  await deleteDoc(doc(db, 'works', workId));
  try {
    const userRef = doc(db, 'users', creatorId);
    const snap = await getDoc(userRef);
    const prev = snap.exists() ? Number((snap.data() as any)?.worksCount) || 0 : 0;
    await setDoc(userRef, { worksCount: Math.max(0, prev - 1), updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[works] worksCount decrement failed', e);
  }
}

/**
 * Create or update a task owned by the current user.
 */
export async function saveTaskToFirestore(task: ProjectTask): Promise<ProjectTask> {
  const current = auth.currentUser;
  if (!current || current.uid !== task.creatorId) {
    throw new Error('You can only create or edit your own tasks.');
  }
  const id = task.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const payload = { ...task, id, updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'tasks', id), payload, { merge: true });
  return { ...task, id };
}


// ============================================================================
// MESSENGER + NOTIFICATIONS (Firestore real-time)
// ============================================================================

export interface ChatMessage {
  id: string;
  connectionId: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  read: boolean;
  sharedPost?: SharedPostRef;
}

export type NotificationType = 'connection_request' | 'connection_accepted' | 'message';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedId?: string;
  fromUserId?: string;
  read: boolean;
  createdAt: string;
}

async function createNotification(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean }) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload: AppNotification = {
    id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    relatedId: n.relatedId,
    fromUserId: n.fromUserId,
    read: n.read ?? false,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'notifications', id), {
      ...payload,
      createdAtTs: serverTimestamp(),
    });
  } catch (err: any) {
    console.warn('[Firestore] createNotification failed:', err?.message || err);
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('permission') || err?.code === 'permission-denied') {
      throw err;
    }
  }
  return payload;
}

/** Patch createConnectionRequest to also notify recipient — called from UI after create */
export async function notifyConnectionRequest(params: {
  recipientId: string;
  senderId: string;
  senderName?: string;
  connectionId: string;
}) {
  await createNotification({
    userId: params.recipientId,
    type: 'connection_request',
    title: 'New connection request',
    body: `${params.senderName || 'A creator'} wants to connect with you.`,
    relatedId: params.connectionId,
    fromUserId: params.senderId,
  });
}

export async function notifyConnectionAccepted(params: {
  senderId: string;
  recipientId: string;
  recipientName?: string;
  connectionId: string;
}) {
  await createNotification({
    userId: params.senderId,
    type: 'connection_accepted',
    title: 'Connection accepted',
    body: `${params.recipientName || 'A creator'} accepted your connection request.`,
    relatedId: params.connectionId,
    fromUserId: params.recipientId,
  });
}

/**
 * Send a message on an accepted connection. Creates notification for recipient.
 * Increments per-conversation unread for the recipient (persisted on connection).
 */
export async function sendMessage(params: {
  connectionId: string;
  senderId: string;
  recipientId: string;
  text: string;
  senderName?: string;
  sharedPost?: SharedPostRef;
}): Promise<ChatMessage> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.senderId) {
    throw new Error('You must be signed in to send messages.');
  }
  const trimmed = (params.text || '').trim();
  if (!trimmed && !params.sharedPost) throw new Error('Message cannot be empty.');

  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const message: ChatMessage = {
    id,
    connectionId: params.connectionId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    text: trimmed || (params.sharedPost ? 'Shared a post' : ''),
    createdAt: new Date().toISOString(),
    read: false,
  };
  if (params.sharedPost) (message as any).sharedPost = params.sharedPost;

  const payload: Record<string, unknown> = {
    id: message.id,
    connectionId: message.connectionId,
    senderId: message.senderId,
    recipientId: message.recipientId,
    text: message.text,
    createdAt: message.createdAt,
    read: false,
    createdAtTs: serverTimestamp(),
  };
  if (params.sharedPost) payload.sharedPost = params.sharedPost;
  await setDoc(doc(db, 'messages', id), payload);

  // Per-chat unread on connection doc (not a global counter)
  try {
    const connRef = doc(db, 'connections', params.connectionId);
    const connSnap = await getDoc(connRef);
    if (connSnap.exists()) {
      const prev = ((connSnap.data() as ConnectionRequest).unreadCounts || {}) as Record<string, number>;
      const nextUnread = {
        ...prev,
        [params.recipientId]: (Number(prev[params.recipientId]) || 0) + 1,
        [params.senderId]: Number(prev[params.senderId]) || 0,
      };
      await updateDoc(connRef, {
        unreadCounts: nextUnread,
        lastMessageAt: message.createdAt,
        lastMessageText: message.text.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[messages] unreadCounts update failed', e);
  }

  await createNotification({
    userId: params.recipientId,
    type: 'message',
    title: 'New message',
    body: `${params.senderName || 'Someone'}: ${message.text.slice(0, 80)}${message.text.length > 80 ? '…' : ''}`,
    relatedId: params.connectionId,
    fromUserId: params.senderId,
  });

  return message;
}

/**
 * Subscribe to messages for a connection (real-time).
 */
export function subscribeToMessages(
  connectionId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // Single-field query only — no composite index required.
  // Sort by createdAt on the client (handles string | Timestamp).
  const q = query(
    collection(db, 'messages'),
    where('connectionId', '==', connectionId),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            createdAt:
              typeof data.createdAt === 'string'
                ? data.createdAt
                : toSortKey(data.createdAt || data.createdAtTs),
          } as ChatMessage;
        })
        .sort((a, b) => toSortMs(a.createdAt) - toSortMs(b.createdAt));
      onChange(msgs);
    },
    (err) => {
      const msg = String((err as any)?.message || err);
      console.warn('[Firestore] messages subscription error:', msg);
      if (!msg.toLowerCase().includes('target id already exists')) {
        onError?.(err as Error);
      }
    }
  );
}

export function subscribeToNotifications(
  userId: string,
  onChange: (items: AppNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // Avoid composite index requirement: filter only, sort client-side
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => toSortMs(b.createdAt) - toSortMs(a.createdAt));
      onChange(items);
    },
    (err) => {
      const msg = String((err as any)?.message || err);
      console.warn('[Firestore] notifications subscription error:', msg);
      if (!msg.toLowerCase().includes('target id already exists')) {
        onError?.(err as Error);
      }
    }
  );
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== userId) return;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err: any) {
    console.warn('[Firestore] markNotificationRead:', err?.message || err);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== userId) return;
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false)));
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
  } catch (err: any) {
    console.warn('[Firestore] markAllNotificationsRead:', err?.message || err);
  }
}


/**
 * Real-time listener for the current user's connections (sidebar + unreadCounts).
 * Deduplicates 1:1 pairs the same way as getConnectionsForUser.
 */
export function subscribeToUserConnections(
  userId: string,
  onChange: (list: ConnectionRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // Poll instead of dual onSnapshot queries — avoids "Target ID already exists"
  // while still updating unreadCounts / list without a full page refresh.
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    try {
      const list = await getConnectionsForUser(userId);
      if (!cancelled) onChange(list);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes('target id already exists')) return;
      console.warn('[Firestore] connections poll:', msg);
      if (!cancelled) onError?.(err as Error);
    }
  };
  tick();
  const interval = setInterval(tick, 2000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

export async function markMessagesRead(connectionId: string, readerId: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== readerId) return;
  try {
    // Single-field query (no composite index); filter unread for this reader client-side
    const snap = await getDocs(
      query(collection(db, 'messages'), where('connectionId', '==', connectionId), limit(200))
    );
    const unread = snap.docs.filter((d) => {
      const data = d.data() as any;
      return data.recipientId === readerId && data.read === false;
    });
    if (unread.length) {
      await Promise.all(unread.map((d) => updateDoc(d.ref, { read: true })));
    }
    // Clear per-conversation unread for this reader (idempotent)
    const connRef = doc(db, 'connections', connectionId);
    const connSnap = await getDoc(connRef);
    if (connSnap.exists()) {
      const prev = ((connSnap.data() as ConnectionRequest).unreadCounts || {}) as Record<string, number>;
      if ((Number(prev[readerId]) || 0) !== 0) {
        await updateDoc(connRef, {
          unreadCounts: { ...prev, [readerId]: 0 },
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err: any) {
    console.warn('[Firestore] markMessagesRead:', err?.message || err);
  }
}


/**
 * Securely delete the current user's Firestore profile data and Firebase Auth account.
 * Only the authenticated owner can delete their own account (prevents cross-user deletion).
 */
export async function deleteAccountAndData(): Promise<void> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('No authenticated user. Please sign in again to delete your account.');
  }

  const uid = current.uid;

  // 1. Delete Firestore-owned user document (rules enforce auth.uid == userId)
  try {
    const userRef = doc(db, 'users', uid);
    await deleteDoc(userRef);
  } catch (err: any) {
    // Proceed to Auth deletion even if doc is already missing
    console.warn('[Firestore] Profile document delete:', err?.message || err);
  }

  // 2. Delete Firebase Authentication account
  await fbDeleteUser(current);

  // 3. Clear local session state
  setCachedGmailAccessToken(null);
  try {
    await fbSignOut(auth);
  } catch {
    // already deleted / signed out
  }
}



/** ---------- AI Match conversation persistence (per-user) ---------- */
export interface AiMatchStoredMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: unknown[];
  requirements?: unknown;
  createdAt?: string;
}

export interface AiMatchConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

function aiMatchConvCol(userId: string) {
  return collection(db, 'users', userId, 'aiMatchConversations');
}

export async function listAiMatchConversations(userId: string): Promise<AiMatchConversationMeta[]> {
  const current = auth.currentUser;
  if (!current) return [];
  // Always scope to Auth UID (rules require request.auth.uid == userId)
  const uid = current.uid;
  try {
    const snap = await getDocs(query(aiMatchConvCol(uid), orderBy('updatedAt', 'desc')));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'Conversation',
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
        messageCount: Array.isArray(data.messages) ? data.messages.length : data.messageCount,
      };
    });
  } catch (err: any) {
    // Fallback without orderBy (missing index)
    try {
      const snap2 = await getDocs(aiMatchConvCol(uid));
      return snap2.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || 'Conversation',
            createdAt: data.createdAt || '',
            updatedAt: data.updatedAt || '',
            messageCount: Array.isArray(data.messages) ? data.messages.length : data.messageCount,
          };
        })
        .sort((a, b) => toSortMs(b.updatedAt) - toSortMs(a.updatedAt));
    } catch (err2: any) {
      console.warn('[AI Match] list conversations:', err2?.message || err?.message || err);
      return [];
    }
  }
}

export async function createAiMatchConversation(userId: string, title?: string): Promise<AiMatchConversationMeta> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const uid = current.uid;
  const id = `aim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const meta = { title: title || 'New conversation', createdAt: now, updatedAt: now, messages: [] as AiMatchStoredMessage[] };
  await setDoc(doc(db, 'users', uid, 'aiMatchConversations', id), meta);
  return { id, title: meta.title, createdAt: now, updatedAt: now, messageCount: 0 };
}

export async function getAiMatchConversation(
  userId: string,
  conversationId: string
): Promise<{ id: string; title: string; messages: AiMatchStoredMessage[] } | null> {
  const current = auth.currentUser;
  if (!current) return null;
  const uid = current.uid;
  const snap = await getDoc(doc(db, 'users', uid, 'aiMatchConversations', conversationId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    title: data.title || 'Conversation',
    messages: Array.isArray(data.messages) ? data.messages : [],
    sessionLocation: data.sessionLocation || null,
  };
}

export async function saveAiMatchConversation(
  userId: string,
  conversationId: string,
  messages: AiMatchStoredMessage[],
  title?: string,
  sessionLocation?: string | null
): Promise<void> {
  const current = auth.currentUser;
  if (!current) return;
  const uid = current.uid;
  const now = new Date().toISOString();
  const derivedTitle =
    title ||
    messages.find((m) => m.role === 'user')?.content?.slice(0, 48) ||
    'Conversation';
  const stripUndef = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(stripUndef).filter((x) => x !== undefined);
    if (typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        out[k] = stripUndef(v);
      }
      return out;
    }
    return obj;
  };

  const payload: Record<string, unknown> = {
    title: derivedTitle.length >= 48 ? derivedTitle + '…' : derivedTitle,
    updatedAt: now,
    messageCount: messages.length,
    messages: messages.map((m) => {
      const entry: Record<string, unknown> = {
        role: m.role,
        content: m.content || '',
        createdAt: m.createdAt || now,
      };
      if (Array.isArray(m.results) && m.results.length) {
        entry.results = m.results.slice(0, 10).map((r: any) =>
          stripUndef({
            id: r?.id || '',
            name: r?.name || '',
            primaryRole: r?.primaryRole || '',
            secondaryRoles: Array.isArray(r?.secondaryRoles) ? r.secondaryRoles : [],
            relevanceScore: typeof r?.relevanceScore === 'number' ? r.relevanceScore : 0,
            discoveryReason: r?.discoveryReason || '',
            avatarUrl: r?.avatarUrl || '',
            location: r?.location || '',
          })
        );
      }
      if (m.requirements != null) {
        entry.requirements = stripUndef(m.requirements);
      }
      return entry;
    }),
  };
  if (sessionLocation) {
    payload.sessionLocation = sessionLocation;
  }
  await setDoc(
    doc(db, 'users', uid, 'aiMatchConversations', conversationId),
    stripUndef(payload),
    { merge: true }
  );
}

/** Overall rating 1–5 from collaborationProfile traits; null if no feedback */
export function computeOverallRating(profile: {
  collaborationProfile?: Record<string, number> | null;
}): { rating: number; reviewCount: number } | null {
  const cp = profile?.collaborationProfile;
  if (!cp) return null;
  const count = Number(cp.feedbackCount) || 0;
  if (count <= 0) return null;
  const traitKeys = [
    'reliability',
    'communication',
    'teamwork',
    'creativity',
    'flexibility',
    'feedback_openness',
    'leadership',
    'technical_proficiency',
  ];
  const vals = traitKeys.map((k) => Number(cp[k])).filter((n) => !Number.isNaN(n) && n > 0);
  if (!vals.length) return null;
  // traits stored 0–10 → display 1–5 stars
  const avg10 = vals.reduce((a, b) => a + b, 0) / vals.length;
  const rating = Math.round((avg10 / 2) * 10) / 10; // one decimal
  return { rating: Math.min(5, Math.max(1, rating)), reviewCount: count };
}

/** Share post payload for messenger (in-app) */
export function buildPostShareText(post: { id: string; caption?: string; authorName?: string }): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const link = `${base}/?post=${encodeURIComponent(post.id)}`;
  const cap = (post.caption || '').slice(0, 120);
  return `Shared a post${post.authorName ? ` by ${post.authorName}` : ''}${cap ? `: "${cap}"` : ''}\n${link}`;
}

export function getPostShareUrl(postId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/?post=${encodeURIComponent(postId)}`;
}


/** Lightweight creator search for Share to Afflatus (name/username/role). */
export async function searchCreatorsByName(queryText: string, limitCount = 20): Promise<CreatorProfile[]> {
  const q = (queryText || '').trim().toLowerCase();
  if (!q || q.length < 1) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(80)));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CreatorProfile));
    return all
      .filter((u) => {
        const blob = `${u.name || ''} ${u.username || ''} ${u.primaryRole || ''}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, limitCount);
  } catch (err: any) {
    console.warn('[searchCreatorsByName]', err?.message || err);
    return [];
  }
}

/** Find existing connection between two users (any status). */
export async function findConnectionBetween(userA: string, userB: string): Promise<ConnectionRequest | null> {
  try {
    const list = await getConnectionsForUser(userA);
    return (
      list.find(
        (c) =>
          (c.senderId === userA && c.recipientId === userB) ||
          (c.senderId === userB && c.recipientId === userA)
      ) || null
    );
  } catch {
    return null;
  }
}

/** Re-export auth state listener for session restore */

/** ---------- Portfolio item likes (per showcase image/item) ---------- */
export interface PortfolioItemLikeState {
  itemId: string;
  creatorId: string;
  likedBy: string[];
}

export async function getPortfolioItemLikeState(itemId: string): Promise<PortfolioItemLikeState | null> {
  if (!itemId) return null;
  try {
    const snap = await getDoc(doc(db, 'portfolioLikes', itemId));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return {
      itemId,
      creatorId: data.creatorId || '',
      likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
    };
  } catch (e) {
    console.warn('[portfolioLikes] get failed', e);
    return null;
  }
}

/**
 * Toggle like on a specific portfolio/showcase item.
 * Persisted in Firestore collection portfolioLikes/{itemId}.
 */
export async function togglePortfolioItemLike(params: {
  itemId: string;
  creatorId: string;
  userId: string;
}): Promise<{ liked: boolean; likedBy: string[] }> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.userId) {
    throw new Error('You must be signed in to like portfolio items.');
  }
  const ref = doc(db, 'portfolioLikes', params.itemId);
  const snap = await getDoc(ref);
  let likedBy: string[] = snap.exists()
    ? Array.isArray((snap.data() as any).likedBy)
      ? [...(snap.data() as any).likedBy]
      : []
    : [];
  const has = likedBy.includes(params.userId);
  if (has) {
    likedBy = likedBy.filter((id) => id !== params.userId);
  } else {
    likedBy.push(params.userId);
  }
  await setDoc(
    ref,
    {
      itemId: params.itemId,
      creatorId: params.creatorId,
      likedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { liked: !has, likedBy };
}


/** ---------- Join Afflatus application / admin approval ---------- */

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Resolve effective application status for access control.
 * Legacy accounts (no applicationStatus) with completed profile or a real role → approved.
 */
export function resolveApplicationStatus(profile: {
  applicationStatus?: string | null;
  profileCompleted?: boolean;
  primaryRole?: string;
  name?: string;
  createdAt?: string;
  applicationSubmittedAt?: string;
} | null): ApplicationStatus {
  if (!profile) return 'pending';
  const s = String(profile.applicationStatus || '').toLowerCase().trim();
  if (s === 'approved' || s === 'rejected' || s === 'pending') {
    return s as ApplicationStatus;
  }
  const role = String(profile.primaryRole || '').trim();
  if (profile.profileCompleted === true) return 'approved';
  if (role && role.toLowerCase() !== 'creator') return 'approved';
  return 'pending';
}

/** Live user doc updates (e.g. admin approved while applicant waits). */
export function subscribeToUserProfile(
  userId: string,
  onChange: (profile: CreatorProfile | null) => void
): () => void {
  if (!userId) {
    onChange(null);
    return () => {};
  }
  const ref = doc(db, 'users', userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: userId, ...(snap.data() as CreatorProfile) });
    },
    (err) => {
      console.warn('[subscribeToUserProfile]', err);
    }
  );
}

/**
 * Persist join application in Firestore (source of truth: applications/{uid}).
 * Also mirrors status onto users/{uid} for routing gates.
 */
export async function submitJoinApplication(params: {
  userId: string;
  email: string;
  name: string;
  message?: string;
}): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.userId) {
    throw new Error('You must be signed in to apply.');
  }
  const now = new Date().toISOString();
  const message = (params.message || '').trim().slice(0, 2000);
  const appRef = doc(db, 'applications', current.uid);
  // Rules require: doc id == auth.uid, data.userId == auth.uid, status == 'pending'
  const appPayload = {
    userId: current.uid,
    email: (params.email || current.email || '').trim() || (current.email || ''),
    name: (params.name || current.displayName || '').trim() || 'Applicant',
    message,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(appRef, appPayload, { merge: true });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    console.error('[submitJoinApplication] applications write failed', err);
    throw new Error(
      msg.toLowerCase().includes('permission')
        ? 'Insufficient permission to submit application. Publish the latest firestore.rules and try again.'
        : msg || 'Failed to submit application.'
    );
  }

  // Verify persistence (source of truth)
  try {
    const verify = await getDoc(appRef);
    if (!verify.exists() || (verify.data() as any)?.status !== 'pending') {
      throw new Error('Application was not saved as pending. Check Firestore rules and network.');
    }
  } catch (err: any) {
    if (String(err?.message || '').includes('not saved')) throw err;
    console.warn('[submitJoinApplication] verify read failed', err);
  }

  try {
    await setDoc(
      doc(db, 'users', current.uid),
      {
        applicationStatus: 'pending',
        applicationMessage: message,
        applicationSubmittedAt: now,
        email: appPayload.email,
        name: appPayload.name || undefined,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.error('[submitJoinApplication] users mirror failed', err);
    throw new Error(
      String(err?.message || '').toLowerCase().includes('permission')
        ? 'Insufficient permission to update your profile application status. Publish firestore.rules.'
        : String(err?.message || 'Failed to update profile application status.')
    );
  }
}

export async function listPendingApplications(): Promise<
  Array<{
    userId: string;
    email: string;
    name: string;
    message: string;
    status: string;
    createdAt: string;
  }>
> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');

  // Prefer filtered query; fall back to full collection scan filtered client-side
  // (still requires admin list rule).
  let docs: Array<{ id: string; data: () => any }> = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'applications'), where('status', '==', 'pending'), limit(100))
    );
    docs = snap.docs as any;
  } catch (err: any) {
    console.warn('[listPendingApplications] filtered query failed, trying full collection', err);
    try {
      const snap = await getDocs(collection(db, 'applications'));
      docs = snap.docs as any;
    } catch (err2: any) {
      const msg = String(err2?.message || err2 || '');
      throw new Error(
        msg.toLowerCase().includes('permission')
          ? 'Insufficient permission to list applications. Sign in as an authorized admin and publish firestore.rules with isAdmin().'
          : msg || 'Failed to list applications.'
      );
    }
  }

  return docs
    .map((d) => {
      const data = d.data() as any;
      return {
        userId: d.id,
        email: data.email || '',
        name: data.name || '',
        message: data.message || '',
        status: String(data.status || ''),
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : toSortKey(data.createdAt),
      };
    })
    .filter((row) => row.status.toLowerCase() === 'pending')
    .sort((a, b) => toSortMs(b.createdAt) - toSortMs(a.createdAt));
}

export async function reviewJoinApplication(params: {
  applicantUserId: string;
  decision: 'approved' | 'rejected';
  adminUserId: string;
  adminEmail: string;
}): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.adminUserId) {
    throw new Error('Not authorized.');
  }
  if (params.decision !== 'approved' && params.decision !== 'rejected') {
    throw new Error('Invalid decision.');
  }

  const now = new Date().toISOString();
  const appRef = doc(db, 'applications', params.applicantUserId);

  try {
    await setDoc(
      appRef,
      {
        status: params.decision,
        reviewedAt: now,
        reviewedBy: params.adminEmail,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (err: any) {
    console.error('[reviewJoinApplication] applications update failed', err);
    throw new Error(
      String(err?.message || '').toLowerCase().includes('permission')
        ? 'Insufficient permission to review applications. Your account must be listed as admin in firestore.rules and adminConfig.ts.'
        : String(err?.message || 'Failed to update application.')
    );
  }

  try {
    await setDoc(
      doc(db, 'users', params.applicantUserId),
      {
        applicationStatus: params.decision,
        applicationReviewedAt: now,
        applicationReviewedBy: params.adminEmail,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.error('[reviewJoinApplication] users update failed', err);
    throw new Error(
      String(err?.message || '').toLowerCase().includes('permission')
        ? 'Insufficient permission to update applicant user status. Admin must be allowed to update users in firestore.rules.'
        : String(err?.message || 'Failed to update applicant status.')
    );
  }

  // Persistent alert for applicant (existing notifications collection)
  const notif = await createNotification({
    userId: params.applicantUserId,
    type: params.decision === 'approved' ? 'connection_accepted' : 'message',
    title: params.decision === 'approved' ? 'Application approved' : 'Application rejected',
    body:
      params.decision === 'approved'
        ? 'Welcome to Afflatus. Complete your profile setup to unlock full platform interactions. Explore is available for browsing.'
        : 'Your Afflatus application was not approved at this time.',
    relatedId: params.applicantUserId,
    fromUserId: params.adminUserId,
  });
  if (!notif?.id) {
    console.warn('[reviewJoinApplication] notification may not have persisted');
  }
}

export { onAuthStateChanged };


export async function renameAiMatchConversation(
  userId: string,
  conversationId: string,
  title: string
): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const uid = current.uid;
  const clean = (title || '').trim().slice(0, 80) || 'Conversation';
  await setDoc(
    doc(db, 'users', uid, 'aiMatchConversations', conversationId),
    { title: clean, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function deleteAiMatchConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const uid = current.uid;
  await deleteDoc(doc(db, 'users', uid, 'aiMatchConversations', conversationId));
}
