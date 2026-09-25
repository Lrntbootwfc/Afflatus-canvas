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
import { Loader2 } from 'lucide-react';
import {
  auth,
  onAuthStateChanged,
  getProfileFromFirestore,
  syncUserProfileToFirestore,
  signOut as firebaseSignOut,
  updateProfileInFirestore,
} from './lib/firebase';
import { setAuth } from './lib/affilApi';
import affilApi from './lib/affilApi';

export default function App() {
  // Screen Router: 'landing' | 'auth' | 'onboarding' | 'dashboard' | 'explore'
  const [currentScreen, setCurrentScreen] = useState<
    'landing' | 'auth' | 'onboarding' | 'dashboard' | 'explore'
  >('landing');

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
        if (profile.profileCompleted) {
          setCurrentScreen('dashboard');
        } else {
          setCurrentScreen('onboarding');
        }
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

    if (isNewSignup || !profile.profileCompleted) {
      setCurrentScreen('onboarding');
    } else {
      setCurrentScreen('dashboard');
    }
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
    setCurrentScreen('dashboard');
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
        onNavigate={(screen) => setCurrentScreen(screen)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenThemes={() => setIsThemesOpen(true)}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        onOpenMessenger={(connectionId) => {
          setMessengerConnectionId(connectionId || null);
          setIsMessengerOpen(true);
        }}
      />

      {/* Main View Router */}
      <main className="flex-1">
        
        {/* Screen 1: LANDING PAGE */}
        {currentScreen === 'landing' && (
          <LandingPage
            currentUser={currentUser}
            onGetStarted={() => {
              if (currentUser) {
                setCurrentScreen('onboarding');
              } else {
                setCurrentScreen('auth');
              }
            }}
            onExploreDemo={() => {
              setCurrentScreen('explore');
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
        {currentScreen === 'onboarding' && currentUser && (
          <ProfileSetupScreen
            initialProfile={currentUser}
            onProfileSaved={handleProfileSaved}
            onCancel={() => {
              if (currentUser.profileCompleted) {
                setCurrentScreen('dashboard');
              } else {
                setCurrentScreen('landing');
              }
            }}
          />
        )}

        {/* Screen 4: MAIN DASHBOARD (User App View - Relevant People / Matches Feed) */}
        {currentScreen === 'dashboard' && currentUser && (
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
        {currentScreen === 'explore' && (
          <ExploreScreen
            onOpenMessenger={(connectionId) => {
              setMessengerConnectionId(connectionId || null);
              setIsMessengerOpen(true);
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
      {currentUser && (
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
