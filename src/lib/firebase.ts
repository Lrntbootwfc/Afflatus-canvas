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
    console.warn('[Firestore] Profile sync failed:', err?.message || err);
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

  // Profile-completion gate (cannot be bypassed by calling this helper directly)
  try {
    const senderSnap = await getDoc(doc(db, 'users', senderId));
    const senderData = senderSnap.exists() ? senderSnap.data() : null;
    if (!senderData?.profileCompleted) {
      throw new Error(
        'Complete your profile before sending collaboration proposals. Add your roles, location, and required details in Profile Setup.'
      );
    }
  } catch (e: any) {
    if (e?.message?.includes('Complete your profile')) throw e;
    console.warn('[createConnectionRequest] profile check failed:', e?.message || e);
  }

  // Duplicate check
  const senderDocs = await getDocs(query(collection(db, 'connections'), where('senderId', '==', senderId)));
  const dup = senderDocs.docs.map(d => d.data() as ConnectionRequest).find((c) => {
    if (c.recipientId !== params.recipientId) return false;
    if (params.taskId && c.taskId === params.taskId) return true;
    if (params.projectId && c.projectId === params.projectId) return true;
    if (!params.taskId && !params.projectId) return true;
    return false;
  });
  if (dup) {
    return { connection: dup, alreadyExists: true };
  }

  const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const connection: ConnectionRequest = {
    id,
    senderId: params.senderId,
    recipientId: params.recipientId,
    message: params.message || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
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
    createdAtTs: serverTimestamp(),
  };
  if (connection.projectId) payload.projectId = connection.projectId;
  if (connection.taskId) payload.taskId = connection.taskId;
  if (connection.kind) payload.kind = connection.kind;
  if (connection.sharedPost) payload.sharedPost = connection.sharedPost;

  await setDoc(doc(db, 'connections', id), payload);

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
      fromUserId: params.senderId,
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
    const map = new Map<string, ConnectionRequest>();
    for (const d of [...asSender.docs, ...asRecipient.docs]) {
      map.set(d.id, { id: d.id, ...d.data() } as ConnectionRequest);
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runQuery();
    } catch (err: any) {
      const msg = String(err?.message || '');
      // "Target ID already exists" = Firestore SDK conflict from concurrent queries
      if (msg.includes('Target ID already exists') && attempt < 2) {
        console.warn(`[Firestore] getConnectionsForUser: query target conflict, retry ${attempt + 1}/3`);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
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

  const res = await fetch(`/api/temporary-chat/${connectionId}/collaborate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': actingUserId
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to toggle collaboration');
  }

  const data = await res.json();
  return data.connection;
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
 */
export async function sendMessage(params: {
  connectionId: string;
  senderId: string;
  recipientId: string;
  text: string;
  senderName?: string;
}): Promise<ChatMessage> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.senderId) {
    throw new Error('You must be signed in to send messages.');
  }
  const trimmed = params.text.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');

  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const message: ChatMessage = {
    id,
    connectionId: params.connectionId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    text: trimmed,
    createdAt: new Date().toISOString(),
    read: false,
  };
  await setDoc(doc(db, 'messages', id), {
    ...message,
    createdAtTs: serverTimestamp(),
  });

  await createNotification({
    userId: params.recipientId,
    type: 'message',
    title: 'New message',
    body: `${params.senderName || 'Someone'}: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}`,
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
  const q = query(
    collection(db, 'messages'),
    where('connectionId', '==', connectionId),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
      onChange(msgs);
    },
    (err) => {
      console.warn('[Firestore] messages subscription error:', err);
      // Fallback without orderBy if index missing
      const q2 = query(collection(db, 'messages'), where('connectionId', '==', connectionId), limit(200));
      return onSnapshot(q2, (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        onChange(msgs);
      }, (e2) => onError?.(e2 as Error));
    }
  );
}

/**
 * Subscribe to notifications for a user (real-time).
 */
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
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onChange(items);
    },
    (err) => {
      console.warn('[Firestore] notifications subscription error:', err);
      onError?.(err as Error);
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

export async function markMessagesRead(connectionId: string, readerId: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || current.uid !== readerId) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'messages'),
        where('connectionId', '==', connectionId),
        where('recipientId', '==', readerId),
        where('read', '==', false)
      )
    );
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
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
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
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
