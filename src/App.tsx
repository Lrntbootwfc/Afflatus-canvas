/**
 * Afflatus - Human Creator Collaboration Platform
 * Clean, modern SaaS application with full Light/Dark mode and multi-page wireframe flows
 */

import React, { useState, useEffect } from 'react';
import type { CreatorProfile } from './types';
import { HeaderNav } from './components/HeaderNav';
import { LandingPage } from './components/LandingPage';
import { AuthScreen } from './components/AuthScreen';
import { ProfileSetupScreen } from './components/ProfileSetupScreen';
import { MainDashboardScreen } from './components/MainDashboardScreen';
import { ExploreScreen } from './components/explore/ExploreScreen';
import { C1AssistantDrawer } from './components/assistant/C1AssistantDrawer';
import { SettingsModal } from './components/SettingsModal';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { MessengerDrawer } from './components/messaging/MessengerDrawer';
import { ApplyJoinScreen } from './components/access/ApplyJoinScreen';
import { AdminApplicationsPanel } from './components/access/AdminApplicationsPanel';
import { isAdminEmail } from './lib/adminConfig';
import { Loader2 } from 'lucide-react';
import {
  auth,
  onAuthStateChanged,
  getProfileFromFirestore,
  syncUserProfileToFirestore,
  signOut as firebaseSignOut,
  updateProfileInFirestore,
  resolveApplicationStatus,
  subscribeToUserProfile,
} from './lib/firebase';
import { setAuth } from './lib/affilApi';
import affilApi from './lib/affilApi';

export default function App() {
  // Screen Router: 'landing' | 'auth' | 'onboarding' | 'dashboard' | 'explore'
  const [currentScreen, setCurrentScreen] = useState<
    'landing' | 'auth' | 'onboarding' | 'dashboard' | 'explore' | 'apply' | 'pending' | 'rejected'
  >('landing');
  const [adminAppsOpen, setAdminAppsOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<CreatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemesOpen, setIsThemesOpen] = useState<boolean>(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState<boolean>(false);
  const [isMessengerOpen, setIsMessengerOpen] = useState<boolean>(false);
  const [messengerConnectionId, setMessengerConnectionId] = useState<string | null>(null);
  const [deepLinkPostId, setDeepLinkPostId] = useState<string | null>(null);
  const [deepLinkPost, setDeepLinkPost] = useState<any>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);


  // Cross-screen navigation params (e.g. from C1 Copilot to Explore)
  const [exploreNavParams, setExploreNavParams] = useState<{
    tab?: 'all' | 'projects' | 'tasks' | 'works' | 'clubs' | 'creators';
    category?: string;
    search?: string;
    entity?: { type: 'project' | 'task' | 'creator' | 'club' | 'work'; id: string } | null;
  }>({});


  const routeAfterAuth = (profile: CreatorProfile) => {
    const appStatus = resolveApplicationStatus(profile);
    if (appStatus === 'rejected') {
      setCurrentScreen('rejected');
      return;
    }
    if (appStatus === 'pending') {
      // Not applied yet vs waiting for admin
      if (profile.applicationStatus === 'pending' || profile.applicationSubmittedAt) {
        setCurrentScreen('pending');
      } else {
        setCurrentScreen('apply');
      }
      return;
    }
    // APPROVED: Explore/dashboard visible even if basic profile incomplete.
    // Interaction (messages, collaborate, etc.) stays gated by profileCompleted.
    if (!profile.profileCompleted) {
      setCurrentScreen('onboarding');
      return;
    }
    setCurrentScreen('dashboard');
  };

  const isApproved = (u: CreatorProfile | null) =>
    !!u && resolveApplicationStatus(u) === 'approved';
  const canInteract = (u: CreatorProfile | null) =>
    isApproved(u) && !!u?.profileCompleted;

  // Restore session from Firebase Auth + Firestore (source of truth for profiles)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          setAuth(null);
          setCurrentUser(null);
          setCurrentScreen('landing');
          setIsLoading(false);
          return;
        }

        // Prefer Firestore profile; create/sync baseline if missing
        let profile = await getProfileFromFirestore(fbUser.uid);
        if (!profile) {
          profile = await syncUserProfileToFirestore(fbUser);
        }

        // Wire Main Backend identity (x-user-id + optional Firebase token)
        try {
          const token = await fbUser.getIdToken();
          setAuth(profile.id || fbUser.uid, token);
        } catch {
          setAuth(profile.id || fbUser.uid);
        }

        setCurrentUser(profile);
        routeAfterAuth(profile);
      } catch (err) {
        console.error('Session restore from Firestore failed:', err);
        setAuth(null);
        setCurrentUser(null);
        setCurrentScreen('landing');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);


  // Live profile updates (application approval while waiting on pending screen)
  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = subscribeToUserProfile(currentUser.id, (profile) => {
      if (!profile) return;
      setCurrentUser((prev) => {
        const next = { ...(prev || {}), ...profile, id: profile.id };
        return next as CreatorProfile;
      });
      // Re-route when status changes (e.g. pending → approved)
      const st = resolveApplicationStatus(profile);
      setCurrentScreen((prevScreen) => {
        if (st === 'approved') {
          if (prevScreen === 'pending' || prevScreen === 'apply' || prevScreen === 'rejected') {
            return profile.profileCompleted ? 'dashboard' : 'onboarding';
          }
          return prevScreen;
        }
        if (st === 'rejected' && prevScreen !== 'rejected') return 'rejected';
        if (st === 'pending') {
          if (profile.applicationStatus === 'pending' || profile.applicationSubmittedAt) {
            if (prevScreen === 'dashboard' || prevScreen === 'explore' || prevScreen === 'onboarding') {
              return 'pending';
            }
          }
        }
        return prevScreen;
      });
    });
    return unsub;
  }, [currentUser?.id]);

  // Public post deep link: /?post=POST_ID
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const postId = params.get('post');
      if (postId) {
        setDeepLinkPostId(postId);
        // Preserve post id across auth in sessionStorage
        sessionStorage.setItem('afflatus_pending_post', postId);
      } else {
        const pending = sessionStorage.getItem('afflatus_pending_post');
        if (pending) setDeepLinkPostId(pending);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!deepLinkPostId) return;
    let cancelled = false;
    (async () => {
      setDeepLinkLoading(true);
      setDeepLinkError(null);
      setDeepLinkPost(null);
      try {
        const res = await affilApi.getPost(deepLinkPostId);
        if (cancelled) return;
        if (res?.post) {
          setDeepLinkPost(res.post);
          sessionStorage.removeItem('afflatus_pending_post');
        } else {
          setDeepLinkError('Post not found or no longer available.');
          sessionStorage.removeItem('afflatus_pending_post');
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.response?.status === 404
          ? 'This post was deleted or does not exist.'
          : (err?.message || 'Could not load this post.');
        setDeepLinkError(msg);
        sessionStorage.removeItem('afflatus_pending_post');
      } finally {
        if (!cancelled) setDeepLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deepLinkPostId]);

  const closeDeepLinkPost = () => {
    setDeepLinkPostId(null);
    setDeepLinkPost(null);
    setDeepLinkError(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('post');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch { /* ignore */ }
  };


  // Keep Main Backend auth header in sync
  useEffect(() => {
    if (!currentUser?.id) {
      setAuth(null);
      return;
    }
    const fbUser = auth.currentUser;
    if (fbUser) {
      fbUser
        .getIdToken()
        .then((token) => setAuth(currentUser.id, token))
        .catch(() => setAuth(currentUser.id));
    } else {
      setAuth(currentUser.id);
    }
  }, [currentUser?.id]);

  // Handle Login / Signup Success (profile already written to Firestore by auth helpers)
  const handleAuthSuccess = (profile: CreatorProfile, isNewSignup: boolean) => {
    setCurrentUser(profile);
    setAuth(profile.id);

    routeAfterAuth(profile);
  };

  // Handle Profile Saved — persist to Firestore + Main Backend profile model
  const handleProfileSaved = async (updatedProfile: CreatorProfile) => {
    const saved = await updateProfileInFirestore({
      ...updatedProfile,
      profileCompleted: true,
    });
    setCurrentUser(saved);
    setAuth(saved.id);
    // Sync dimensions to Main Backend (professions, location, etc.)
    try {
      const { default: affilApi } = await import('./lib/affilApi');
      await affilApi.updateMyProfile({
        name: saved.name,
        bio: saved.bio,
        location: saved.location,
        primaryRole: saved.primaryRole,
        secondaryRoles: saved.secondaryRoles,
        professions: [
          saved.primaryRole,
          ...(saved.secondaryRoles || []),
        ].filter(Boolean),
        seekingRoles: saved.seekingRoles,
        travelPreference: (saved as any).travelPreference,
        profileCompleted: true,
      });
    } catch (err) {
      console.warn('[App] Main Backend profile sync skipped:', err);
    }
    // Only unlock full platform when application is approved
    if (resolveApplicationStatus(saved) === 'approved') {
      setCurrentScreen('dashboard');
    } else {
      routeAfterAuth(saved);
    }
  };

  // Handle Logout — clear Firebase Auth session + Main Backend identity
  const handleLogout = async () => {
    try {
      await firebaseSignOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    setAuth(null);
    setCurrentUser(null);
    setCurrentScreen('landing');
  };

  // After successful account deletion
  const handleAccountDeleted = () => {
    setCurrentUser(null);
    setIsSettingsOpen(false);
    setCurrentScreen('landing');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center text-[var(--text-primary)] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#E58B13]" />
        <p className="text-xs text-[var(--text-secondary)] font-medium tracking-wide">
          Loading Afflatus...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans flex flex-col antialiased selection:bg-[#E58B13]/30 selection:text-[var(--text-primary)]">
      
      {/* 1. Header Bar (Present across screens with Theme Switcher, Brand, & Profile Dropdown) */}
      <HeaderNav
        currentScreen={currentScreen}
        onNavigate={(screen) => {
          if (!currentUser) {
            if (screen === 'auth' || screen === 'landing') setCurrentScreen(screen);
            return;
          }
          const st = resolveApplicationStatus(currentUser);
          if (st !== 'approved') {
            // Not applied / pending / rejected — no platform screens
            if (st === 'rejected') setCurrentScreen('rejected');
            else if (currentUser.applicationStatus === 'pending' || currentUser.applicationSubmittedAt) {
              setCurrentScreen('pending');
            } else setCurrentScreen('apply');
            return;
          }
          // Approved: explore/dashboard/onboarding allowed even if profile incomplete
          setCurrentScreen(screen as any);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenThemes={() => setIsThemesOpen(true)}
        onOpenAssistant={() => {
          if (canInteract(currentUser)) setIsAssistantOpen(true);
          else if (isApproved(currentUser) && !currentUser?.profileCompleted) {
            setCurrentScreen('onboarding');
          }
        }}
        onOpenMessenger={(connectionId) => {
          if (!canInteract(currentUser)) {
            if (isApproved(currentUser) && !currentUser?.profileCompleted) {
              setCurrentScreen('onboarding');
            }
            return;
          }
          setMessengerConnectionId(connectionId || null);
          setIsMessengerOpen(true);
        }}
      />

      
      {currentUser && isApproved(currentUser) && !currentUser.profileCompleted &&
        (currentScreen === 'explore' || currentScreen === 'dashboard') && (
        <div className="border-b border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 px-4 py-2.5 text-center">
          <p className="text-xs text-[var(--text-primary)]">
            Your application is approved. Complete your basic profile to message, collaborate, and post.
            <button
              type="button"
              className="ml-2 font-bold text-[var(--accent-amber)] underline"
              onClick={() => setCurrentScreen('onboarding')}
            >
              Continue profile setup
            </button>
          </p>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1">
        
        {/* Screen 1: LANDING PAGE */}
        {currentScreen === 'landing' && (
          <LandingPage
            currentUser={currentUser}
            onGetStarted={() => {
              if (!currentUser) {
                setCurrentScreen('auth');
                return;
              }
              const st = resolveApplicationStatus(currentUser);
              if (st === 'rejected') setCurrentScreen('rejected');
              else if (st === 'pending') {
                if (currentUser.applicationStatus === 'pending' || currentUser.applicationSubmittedAt) {
                  setCurrentScreen('pending');
                } else setCurrentScreen('apply');
              } else if (!currentUser.profileCompleted) {
                setCurrentScreen('onboarding');
              } else {
                setCurrentScreen('dashboard');
              }
            }}
            onExploreDemo={() => {
              // Explore only after approval (or public demo if you keep guest — require approved)
              if (currentUser && isApproved(currentUser)) {
                setCurrentScreen('explore');
              } else if (currentUser) {
                routeAfterAuth(currentUser);
              } else {
                setCurrentScreen('auth');
              }
            }}
            onUpdateProfile={() => {
              setCurrentScreen('onboarding');
            }}
          />
        )}

        {/* Screen 2: LOGIN / SIGNUP PAGE (Dual Authentication Flow) */}
        {currentScreen === 'auth' && (
          <AuthScreen
            onLoginSuccess={handleAuthSuccess}
            onBackToLanding={() => setCurrentScreen('landing')}
          />
        )}

        {/* Screen 3: ONBOARDING / PROFILE SETUP PAGE ("Making Profile") */}
        {(currentScreen === 'apply' || currentScreen === 'pending' || currentScreen === 'rejected') && currentUser && (
          <ApplyJoinScreen
            user={currentUser}
            mode={currentScreen === 'apply' ? 'apply' : currentScreen === 'pending' ? 'pending' : 'rejected'}
            onSubmitted={(updated) => {
              setCurrentUser(updated);
              setCurrentScreen('pending');
            }}
            onLogout={handleLogout}
          />
        )}

        {currentScreen === 'onboarding' && currentUser && resolveApplicationStatus(currentUser) === 'approved' && (
          <ProfileSetupScreen
            initialProfile={currentUser}
            onProfileSaved={handleProfileSaved}
            onCancel={() => {
              if (currentUser.profileCompleted) {
                setCurrentScreen('dashboard');
              } else if (isApproved(currentUser)) {
                // Approved but incomplete: can browse Explore, not full interact
                setCurrentScreen('explore');
              } else {
                setCurrentScreen('landing');
              }
            }}
          />
        )}

        {/* Screen 4: MAIN DASHBOARD (User App View - Relevant People / Matches Feed) */}
        {currentScreen === 'dashboard' && currentUser && isApproved(currentUser) && (
          <MainDashboardScreen
            currentUser={currentUser}
            onEditProfile={() => setCurrentScreen('onboarding')}
            onUpdateCurrentUser={handleProfileSaved}
            onNavigateToExplore={(tab, category, search, entity) => {
              setExploreNavParams({
                tab: tab || 'creators',
                category,
                search,
                entity: entity || null,
              });
              setCurrentScreen('explore');
            }}
          />
        )}

        {/* Screen 5: EXPLORE CORE (Dedicated work, project, task, and guild discovery) */}
        {currentScreen === 'explore' && currentUser && isApproved(currentUser) && (
          <ExploreScreen
            onOpenMessenger={(connectionId) => {
              setMessengerConnectionId(connectionId || null);
              if (canInteract(currentUser)) setIsMessengerOpen(true);
            }}
            currentUser={currentUser}
            onNavigateToOnboarding={() => {
              if (currentUser) {
                setCurrentScreen('onboarding');
              } else {
                setCurrentScreen('auth');
              }
            }}
            onNavigateToAuth={() => setCurrentScreen('auth')}
            onViewCreatorProfile={() => {
              // Viewed directly inside Explore via CreatorDetailModal
            }}
            onInitiateConnection={(_creator, _defaultMsg) => {
              // Stay in discovery context; UI provides in-place confirmation feedback
            }}
            initialTab={exploreNavParams.tab}
            initialCategory={exploreNavParams.category}
            initialSearch={exploreNavParams.search}
            initialEntity={exploreNavParams.entity}
          />
        )}

      </main>

      {/* Persistent C1 AI Assistant (Accessible Across All Screens) */}
      <C1AssistantDrawer
        currentUser={currentUser}
        isOpen={isAssistantOpen}
        onOpen={() => setIsAssistantOpen(true)}
        onClose={() => setIsAssistantOpen(false)}
        onNavigateToExplore={(tab, category, search) => {
          setExploreNavParams({ tab, category, search, entity: null });
          setCurrentScreen('explore');
        }}
        onSelectCreator={(creator) => {
          setExploreNavParams({ tab: 'creators', search: creator.name, entity: { type: 'creator', id: creator.id } });
          setCurrentScreen('explore');
        }}
        onSelectProject={(projectId) => {
          setExploreNavParams({ tab: 'projects', entity: { type: 'project', id: projectId } });
          setCurrentScreen('explore');
        }}
        onSelectTask={(taskId) => {
          setExploreNavParams({ tab: 'tasks', entity: { type: 'task', id: taskId } });
          setCurrentScreen('explore');
        }}
      />

      {/* Admin applications (admin email only) */}
      {adminAppsOpen && currentUser && isAdminEmail(currentUser.email) && (
        <AdminApplicationsPanel
          admin={currentUser}
          onClose={() => setAdminAppsOpen(false)}
        />
      )}
      {currentUser && isAdminEmail(currentUser.email) && currentScreen === 'dashboard' && (
        <button
          type="button"
          onClick={() => setAdminAppsOpen(true)}
          className="fixed bottom-4 left-4 z-40 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-[10px] font-mono font-semibold text-[var(--text-muted)] shadow-md hover:text-[var(--text-primary)]"
        >
          Admin · Applications
        </button>
      )}

      {/* Settings Modal */}
      {currentUser && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentUser={currentUser}
          onOpenThemes={() => setIsThemesOpen(true)}
          onAccountDeleted={handleAccountDeleted}
        />
      )}

      {/* Dedicated Themes Studio Modal */}
      <ThemeSelectorModal
        isOpen={isThemesOpen}
        onClose={() => setIsThemesOpen(false)}
      />

      {/* Public / shared post deep link modal — works logged-in or out */}
      {deepLinkPostId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDeepLinkPost} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Shared Post</h3>
              <button type="button" onClick={closeDeepLinkPost} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">Close</button>
            </div>
            {deepLinkLoading && (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" /></div>
            )}
            {deepLinkError && (
              <p className="text-sm text-red-500 py-8 text-center">{deepLinkError}</p>
            )}
            {deepLinkPost && !deepLinkLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{deepLinkPost.authorName || 'Creator'}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{deepLinkPost.authorRole || ''}</p>
                  </div>
                </div>
                {deepLinkPost.caption && (
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{deepLinkPost.caption}</p>
                )}
                {deepLinkPost.imageUrl && (
                  <img src={deepLinkPost.imageUrl} alt="" className="w-full rounded-2xl border border-[var(--card-border)] max-h-96 object-contain bg-[var(--app-bg)]" />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messenger (post-connection real-time chat) */}
      {currentUser && canInteract(currentUser) && (
        <MessengerDrawer
          isOpen={isMessengerOpen}
          onClose={() => {
            setIsMessengerOpen(false);
            setMessengerConnectionId(null);
          }}
          currentUser={currentUser}
          initialConnectionId={messengerConnectionId}
          onNavigateToProfile={(creatorId) => {
            setExploreNavParams({ tab: 'creators', search: '', entity: { type: 'creator', id: creatorId } });
            setCurrentScreen('explore');
            setIsMessengerOpen(false);
          }}
        />
      )}

    </div>
  );
}
