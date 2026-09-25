import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  Compass,
  Briefcase,
  Layers,
  Sparkles,
  Users,
  Film,
  Camera,
  Music,
  Scissors,
  Palette,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';
import type {
  ExploreFeedResponse,
  WorkShowcase,
  Project,
  ProjectTask,
  CreativeClub,
  ExploreCreatorItem,
  CreatorProfile,
} from '../../types';
import { WorkCard } from './WorkCard';
import { ProjectCard } from './ProjectCard';
import { TaskCard } from './TaskCard';
import { ClubCard } from './ClubCard';
import { CreatorCard } from './CreatorCard';
import { WorkDetailModal } from './WorkDetailModal';
import { ProjectDetailModal } from './ProjectDetailModal';
import { TaskDetailModal } from './TaskDetailModal';
import { ClubDetailModal } from './ClubDetailModal';
import { CreatorDetailModal } from './CreatorDetailModal';
import { GatedActionNoticeModal } from './GatedActionNoticeModal';
import { PublicProfileView } from './PublicProfileView';
import {
  fetchExploreFeedFromFirestore,
  createConnectionRequest,
} from '../../lib/firebase';
import { GlobalPostsFeed } from '../feed/GlobalPostsFeed';
import { CreatePostInput } from '../feed/CreatePostInput';

interface ExploreScreenProps {
  currentUser: CreatorProfile | null;
  onNavigateToOnboarding: () => void;
  onNavigateToAuth: () => void;
  onViewCreatorProfile: (creator: CreatorProfile) => void;
  onInitiateConnection: (creator: CreatorProfile, defaultMessage?: string) => void;
  initialTab?: TabType;
  initialCategory?: string;
  initialSearch?: string;
  initialEntity?: { type: 'project' | 'task' | 'creator' | 'club' | 'work'; id: string } | null;
}

type TabType = 'all' | 'projects' | 'tasks' | 'works' | 'clubs' | 'creators';

const CATEGORIES = [
  { id: 'all', label: 'All Crafts' },
  { id: 'cinematography', label: 'Cinematography' },
  { id: 'directing', label: 'Directing' },
  { id: 'production', label: 'Production' },
  { id: 'sound', label: 'Sound & Audio' },
  { id: 'editing', label: 'Editing & Color' },
  { id: 'design', label: 'Motion & Design' },
];

export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  currentUser,
  onNavigateToOnboarding,
  onNavigateToAuth,
  onViewCreatorProfile,
  onInitiateConnection,
  initialTab,
  initialCategory,
  initialSearch,
  initialEntity,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'creators');
  const [mainTab, setMainTab] = useState<'explore' | 'feed'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch || '');
  const [feedData, setFeedData] = useState<ExploreFeedResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Post creation modal
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [feedRefreshTrigger, setFeedRefreshTrigger] = useState(0);

  // Selected modals
  const [selectedWork, setSelectedWork] = useState<WorkShowcase | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [selectedClub, setSelectedClub] = useState<CreativeClub | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | ExploreCreatorItem | null>(null);

  // Public Profile View state (full screen / view state)
  const [viewingPublicProfileCreatorId, setViewingPublicProfileCreatorId] = useState<string | null>(null);
  const [viewingPublicProfileCreator, setViewingPublicProfileCreator] = useState<CreatorProfile | null>(null);

  // Gated action modal
  const [gatedModalOpen, setGatedModalOpen] = useState(false);
  const [gatedActionTitle, setGatedActionTitle] = useState('Collaborate & Connect');

  // Interactive feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const sendConnectionToBackend = async (
    recipientId: string,
    recipientName: string,
    message: string,
    projectId?: string,
    taskId?: string
  ) => {
    if (!currentUser?.id) {
      setToastMessage('Please sign in to send a connection request.');
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }
    try {
      const { alreadyExists } = await createConnectionRequest({
        senderId: currentUser.id,
        recipientId,
        message,
        projectId,
        taskId,
      });
      if (alreadyExists) {
        setToastMessage(`You already sent a proposal to ${recipientName} for this opportunity.`);
      } else {
        setToastMessage(`Connection proposal successfully sent to ${recipientName}!`);
      }
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.error('Failed to persist connection:', err);
      setToastMessage(err?.message || 'Network error submitting proposal.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  // Load feed from Firestore (source of truth — no demo/seed mixing)
  const fetchFeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExploreFeedFromFirestore({
        userId: currentUser?.id,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchQuery.trim() || undefined,
      });
      setFeedData(data);
    } catch (err) {
      console.error('[ExploreScreen] Error fetching feed from Firestore:', err);
      setError('Unable to load discovery feed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [selectedCategory, currentUser?.id]);

  // Synchronize initial navigation from C1 Assistant or external routes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    if (initialCategory) setSelectedCategory(initialCategory);
    if (initialSearch !== undefined) setSearchQuery(initialSearch);
  }, [initialTab, initialCategory, initialSearch]);

  useEffect(() => {
    if (initialEntity && feedData) {
      if (initialEntity.type === 'task') {
        const found = feedData.tasks?.find((t) => t.id === initialEntity.id);
        if (found) setSelectedTask(found);
      } else if (initialEntity.type === 'project') {
        const found = feedData.projects?.find((p) => p.id === initialEntity.id);
        if (found) setSelectedProject(found);
      } else if (initialEntity.type === 'creator') {
        const found = feedData.suggestedCreators?.find((c) => c.id === initialEntity.id);
        if (found) setSelectedCreator(found);
      } else if (initialEntity.type === 'club') {
        const found = feedData.clubs?.find((c) => c.id === initialEntity.id);
        if (found) setSelectedClub(found);
      } else if (initialEntity.type === 'work') {
        const found = feedData.featuredWorks?.find((w) => w.id === initialEntity.id);
        if (found) setSelectedWork(found);
      }
    }
  }, [initialEntity, feedData]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFeed();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Check if current user profile is complete
  const isProfileComplete = useMemo(() => {
    if (!currentUser) return false;
    return !!currentUser.profileCompleted;
  }, [currentUser]);

  // Gatekeeper for restricted actions
  const handleGatedAction = (actionTitle: string, callback: () => void) => {
    if (!currentUser) {
      setGatedActionTitle(actionTitle);
      setGatedModalOpen(true);
      return;
    }
    if (!isProfileComplete) {
      setGatedActionTitle(actionTitle);
      setGatedModalOpen(true);
      return;
    }
    callback();
  };

  // View creator profile handler
  const handleViewCreator = (creator: CreatorProfile | ExploreCreatorItem) => {
    setViewingPublicProfileCreatorId(creator.id);
    setViewingPublicProfileCreator(creator as CreatorProfile);
    setSelectedWork(null);
    setSelectedProject(null);
    setSelectedTask(null);
    setSelectedClub(null);
    setSelectedCreator(null);
    if (onViewCreatorProfile) {
      onViewCreatorProfile(creator as CreatorProfile);
    }
  };

  // Connection handler from creator card
  const handleConnectCreator = (creator: ExploreCreatorItem) => {
    handleGatedAction(`Connect with ${creator.name}`, async () => {
      const msg = `Hi ${creator.name}, I discovered your profile on Explore and would love to connect regarding upcoming productions.`;
      await sendConnectionToBackend(creator.id, creator.name, msg);
      onInitiateConnection(creator, msg);
    });
  };

  // Project Lead connection handler
  const handleConnectProjectLead = (seeker: CreatorProfile, defaultMessage?: string) => {
    handleGatedAction(`Connect with ${seeker.name}`, async () => {
      const msg = defaultMessage || `Hi ${seeker.name}, I saw your project brief on Explore and would like to collaborate.`;
      await sendConnectionToBackend(seeker.id, seeker.name, msg, selectedProject?.id);
      onInitiateConnection(seeker, msg);
    });
  };

  // Task application handler
  const handleApplyTask = (task: ProjectTask) => {
    handleGatedAction(`Apply for ${task.title}`, async () => {
      const recipientId = task.creatorId || task.creator?.id;
      const recipientName = task.creator?.name || 'the project lead';
      if (recipientId) {
        const msg = `Hi ${recipientName}, I would like to apply for the "${task.title}" position on "${task.projectTitle}". Let's discuss availability and rates.`;
        await sendConnectionToBackend(recipientId, recipientName, msg, task.projectId, task.id);
        setSelectedTask(null);
      }
    });
  };
  const isAllEmpty = useMemo(() => {
    if (!feedData) return false;
    return (
      feedData.projects.length === 0 &&
      feedData.tasks.length === 0 &&
      feedData.featuredWorks.length === 0 &&
      feedData.clubs.length === 0 &&
      feedData.suggestedCreators.length === 0
    );
  }, [feedData]);

  if (viewingPublicProfileCreatorId) {
    return (
      <div className="w-full min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
        <PublicProfileView
          creatorId={viewingPublicProfileCreatorId}
          initialCreator={viewingPublicProfileCreator}
          currentUser={currentUser}
          onBack={() => {
            setViewingPublicProfileCreatorId(null);
            setViewingPublicProfileCreator(null);
          }}
          onViewWorkDetail={(work) => setSelectedWork(work)}
          onViewProjectDetail={(project) => setSelectedProject(project)}
          isProfileComplete={isProfileComplete}
          onOpenGatedNotice={(action) => {
            setGatedActionTitle(action);
            setGatedModalOpen(true);
          }}
        />

        {/* Modals from Public Profile */}
        <WorkDetailModal
          work={selectedWork}
          onClose={() => setSelectedWork(null)}
          onViewCreator={handleViewCreator}
          onSelectProject={(proj) => {
            setSelectedWork(null);
            setSelectedProject(proj);
          }}
        />

        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          currentUser={currentUser}
          onViewCreator={handleViewCreator}
          onConnectWithLead={handleConnectProjectLead}
          onSelectTask={(task) => {
            setSelectedProject(null);
            setSelectedTask(task);
          }}
        />

        <GatedActionNoticeModal
          isOpen={gatedModalOpen}
          onClose={() => setGatedModalOpen(false)}
          onCompleteProfile={onNavigateToOnboarding}
          onLogin={onNavigateToAuth}
          actionTitle={gatedActionTitle}
        />
      </div>
    );
  }


  const renderEmptyState = (entityTitle: string) => (
    <div className="card-warm-white p-10 sm:p-14 rounded-3xl border border-[var(--card-border)] text-center space-y-4 my-4">
      <div className="w-12 h-12 rounded-full bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] flex items-center justify-center mx-auto text-[var(--accent-amber)]">
        <Search className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
          No {entityTitle} Found
        </h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
          {searchQuery
            ? `No matching records found for "${searchQuery}"${selectedCategory !== 'all' ? ` in ${selectedCategory}` : ''}. Try broadening your search or resetting filters.`
            : `No ${entityTitle.toLowerCase()} currently available${selectedCategory !== 'all' ? ` in the ${selectedCategory} category` : ''}.`}
        </p>
      </div>
      {(searchQuery || selectedCategory !== 'all') && (
        <div className="pt-2 flex items-center justify-center">
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="px-5 py-2.5 rounded-full text-xs font-bold bg-[var(--accent-amber)] hover:opacity-90 text-[var(--nav-item-active-text,#181614)] shadow-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Search &amp; Filters</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-200">
      {/* 1. Editorial Header Banner with Discovery Radar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[var(--card-border)]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--accent-amber)]">
              Production Registry &amp; Creative Discovery
            </span>
          </div>

          <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] tracking-tight">
            Explore Work &amp; Craft
          </h1>

          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Discover active film campaigns, production briefs, open crew opportunities, creative
            guilds, and verified talent across Indian cinema and digital media.
          </p>
        </div>

        {/* User Stats Counter Bar */}
        {currentUser && (
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-[var(--card-inner-bg)]/80 border border-[var(--card-border)] text-xs shrink-0 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center gap-2">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">My Collaborations</span>
              <span className="font-mono font-bold text-sm text-[var(--accent-amber)]">{currentUser.collaborationCount || 0}</span>
            </div>
          </div>
        )}

        {/* Profile Status Banner for Incomplete users */}
        {currentUser && !isProfileComplete && (
          <div className="p-3.5 rounded-2xl bg-[var(--card-inner-bg)] border border-[var(--accent-amber)]/30 flex items-center gap-3 shrink-0">
            <ShieldCheck className="w-5 h-5 text-[var(--accent-amber)] shrink-0" />
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">Explorer Mode Active</p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Browse freely. Complete profile anytime to submit proposals.
              </p>
            </div>
            <button
              onClick={onNavigateToOnboarding}
              className="amber-pill-btn px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Complete
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-4 mb-6">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMainTab('explore')}
            className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${
              mainTab === 'explore'
                ? 'bg-[var(--text-primary)] text-[var(--card-bg)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Explore Creators
          </button>
          <button
            onClick={() => setMainTab('feed')}
            className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${
              mainTab === 'feed'
                ? 'bg-[var(--text-primary)] text-[var(--card-bg)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Explore Projects
          </button>
        </div>

        {currentUser && mainTab === 'feed' && (
          <button
            onClick={() => setIsCreatePostModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-amber)] hover:bg-[#e69c1e] text-black font-bold rounded-full transition-colors text-sm shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Create Post</span>
          </button>
        )}
      </div>

      {/* 3. Search Toolbar (only for 'explore' tab) */}
      {mainTab === 'explore' && (
      <>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              id="explore-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search briefs, roles, camera gear, film styles, skills, or creators..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-amber)] transition-all shadow-sm"
            />
          </div>

          <button
            onClick={fetchFeed}
            disabled={loading}
            className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-amber)] transition-all shrink-0 cursor-pointer shadow-sm"
            title="Refresh Feed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4. Content Grid or Loading State */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-amber)] border-t-transparent animate-spin" />
          <p className="text-xs text-[var(--text-muted)] font-mono">Curating discovery feed...</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-3xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center space-y-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">{error}</p>
          <button
            onClick={fetchFeed}
            className="amber-pill-btn px-4 py-2 rounded-full text-xs font-bold cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {/* ALL VIEW SECTIONS */}
          {activeTab === 'all' && feedData && (
            <>
              {isAllEmpty && renderEmptyState('Opportunities or Creative Works')}

              {/* Section 1: Active Projects */}
              {feedData.projects.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-editorial text-xl font-bold text-[var(--text-primary)]">
                        Production Briefs &amp; Projects
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        Campaigns actively assembling crew and gear packages
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('projects')}
                      className="text-xs font-semibold text-[var(--accent-amber)] hover:underline cursor-pointer"
                    >
                      View All ({feedData.projects.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {feedData.projects.slice(0, 3).map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpenDetail={setSelectedProject}
                        onViewCreator={handleViewCreator}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Section 2: Open Roles / Tasks */}
              {feedData.tasks.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-500">Live Production Calls</span>
                      </div>
                      <h2 className="font-editorial text-2xl font-bold text-[var(--text-primary)]">
                        Open Crew Callouts &amp; Roles
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        Targeted crew positions with transparent day rates and verified production escrows
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('tasks')}
                      className="text-xs font-mono font-bold text-[var(--accent-amber)] hover:underline cursor-pointer"
                    >
                      View All ({feedData.tasks.length}) &rarr;
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {feedData.tasks.slice(0, 4).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onOpenDetail={setSelectedTask}
                        onViewCreator={handleViewCreator}
                        onApplyOrConnect={handleApplyTask}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Section 3: Work Showcases (Work -> People Discovery) */}
              {feedData.featuredWorks.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-editorial text-xl font-bold text-[var(--text-primary)]">
                        Featured Works &amp; Case Studies
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        Explore finished cinematography, audio reels, and directorial cuts
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('works')}
                      className="text-xs font-semibold text-[var(--accent-amber)] hover:underline cursor-pointer"
                    >
                      View All ({feedData.featuredWorks.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {feedData.featuredWorks.slice(0, 3).map((work) => (
                      <WorkCard
                        key={work.id}
                        work={work}
                        onOpenDetail={setSelectedWork}
                        onViewCreator={handleViewCreator}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Section 4: Creative Guilds / Clubs */}
              {feedData.clubs.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-editorial text-xl font-bold text-[var(--text-primary)]">
                        Creative Guilds &amp; Collectives
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        Specialized discipline communities sharing knowledge and gear
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('clubs')}
                      className="text-xs font-semibold text-[var(--accent-amber)] hover:underline cursor-pointer"
                    >
                      View All ({feedData.clubs.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {feedData.clubs.slice(0, 3).map((club) => (
                      <ClubCard
                        key={club.id}
                        club={club}
                        onOpenDetail={setSelectedClub}
                        onViewCreator={handleViewCreator}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Section 5: Suggested Talent with Deterministic Scoring */}
              {feedData.suggestedCreators.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-editorial text-xl font-bold text-[var(--text-primary)]">
                        Collaborators &amp; Craft Masters
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        Ranked by craft complementarity, seeking preferences, and location
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('creators')}
                      className="text-xs font-semibold text-[var(--accent-amber)] hover:underline cursor-pointer"
                    >
                      View All ({feedData.suggestedCreators.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {feedData.suggestedCreators.slice(0, 3).map((creator) => (
                      <CreatorCard
                        key={creator.id}
                        creator={creator}
                        onOpenDetail={handleViewCreator}
                        onConnect={handleConnectCreator}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* TAB: PROJECTS ONLY */}
          {activeTab === 'projects' && feedData && (
            feedData.projects.length === 0 ? (
              renderEmptyState('Projects')
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedData.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpenDetail={setSelectedProject}
                    onViewCreator={handleViewCreator}
                  />
                ))}
              </div>
            )
          )}

          {/* TAB: TASKS ONLY */}
          {activeTab === 'tasks' && feedData && (
            feedData.tasks.length === 0 ? (
              renderEmptyState('Opportunities')
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {feedData.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenDetail={setSelectedTask}
                    onViewCreator={handleViewCreator}
                    onApplyOrConnect={handleApplyTask}
                  />
                ))}
              </div>
            )
          )}

          {/* TAB: WORKS ONLY */}
          {activeTab === 'works' && feedData && (
            feedData.featuredWorks.length === 0 ? (
              renderEmptyState('Work Showcases')
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedData.featuredWorks.map((work) => (
                  <WorkCard
                    key={work.id}
                    work={work}
                    onOpenDetail={setSelectedWork}
                    onViewCreator={handleViewCreator}
                  />
                ))}
              </div>
            )
          )}

          {/* TAB: CLUBS ONLY */}
          {activeTab === 'clubs' && feedData && (
            feedData.clubs.length === 0 ? (
              renderEmptyState('Guilds & Clubs')
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedData.clubs.map((club) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    onOpenDetail={setSelectedClub}
                    onViewCreator={handleViewCreator}
                  />
                ))}
              </div>
            )
          )}

          {/* TAB: CREATORS ONLY */}
          {activeTab === 'creators' && feedData && (
            feedData.suggestedCreators.length === 0 ? (
              renderEmptyState('Collaborators')
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedData.suggestedCreators.map((creator) => (
                  <CreatorCard
                    key={creator.id}
                    creator={creator}
                    onOpenDetail={handleViewCreator}
                    onConnect={handleConnectCreator}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}
      </>
      )}

      {/* Global Posts Feed */}
      {mainTab === 'feed' && (
        <GlobalPostsFeed currentUser={currentUser} refreshTrigger={feedRefreshTrigger} />
      )}

      {/* 5. Detail Modals */}
      <WorkDetailModal
        work={selectedWork}
        onClose={() => setSelectedWork(null)}
        onViewCreator={handleViewCreator}
        onSelectProject={(proj) => {
          setSelectedWork(null);
          setSelectedProject(proj);
        }}
        onSelectTask={(task) => {
          setSelectedWork(null);
          setSelectedTask(task);
        }}
        onSelectClub={(club) => {
          setSelectedWork(null);
          setSelectedClub(club);
        }}
      />

      <ProjectDetailModal
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        currentUser={currentUser}
        onViewCreator={handleViewCreator}
        onConnectWithLead={handleConnectProjectLead}
        onSelectTask={(task) => {
          setSelectedProject(null);
          setSelectedTask(task);
        }}
        onSelectClub={(club) => {
          setSelectedProject(null);
          setSelectedClub(club);
        }}
      />

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        currentUser={currentUser}
        onViewCreator={handleViewCreator}
        onApplyOrConnect={handleApplyTask}
        onSelectProject={(proj) => {
          setSelectedTask(null);
          setSelectedProject(proj);
        }}
      />

      <ClubDetailModal
        club={selectedClub}
        onClose={() => setSelectedClub(null)}
        currentUser={currentUser}
        onViewCreator={handleViewCreator}
        onSelectProject={(proj) => {
          setSelectedClub(null);
          setSelectedProject(proj);
        }}
        onSelectTask={(task) => {
          setSelectedClub(null);
          setSelectedTask(task);
        }}
      />

      {/* Creator Detail Profile Modal */}
      <CreatorDetailModal
        creator={selectedCreator}
        onClose={() => setSelectedCreator(null)}
        currentUser={currentUser}
        onConnect={(creator) => {
          setSelectedCreator(null);
          handleConnectCreator(creator as ExploreCreatorItem);
        }}
      />

      {/* 6. Gated Action Notification Modal */}
      <GatedActionNoticeModal
        isOpen={gatedModalOpen}
        onClose={() => setGatedModalOpen(false)}
        onCompleteProfile={currentUser ? onNavigateToOnboarding : onNavigateToAuth}
        actionTitle={gatedActionTitle}
        isLoggedIn={!!currentUser}
      />

      {/* 7. Connection Confirmation Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="card-warm-white p-4 rounded-2xl shadow-2xl border border-[var(--accent-amber)]/40 flex items-center gap-3 bg-[var(--card-bg)]">
            <div className="w-8 h-8 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">
                {/error|failed|must be signed|sign in|Network/i.test(toastMessage || '')
                  ? 'Could not send proposal'
                  : 'Collaboration Proposal Sent'}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* 8. Create Post Modal */}
      {isCreatePostModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--app-bg)] w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative border border-[var(--card-border)]">
            <button 
              onClick={() => setIsCreatePostModalOpen(false)}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors z-10"
            >
              <X size={20} />
            </button>
            <div className="p-6 pb-2 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
              <h2 className="text-xl font-bold font-editorial">Create New Post</h2>
            </div>
            <div className="p-6 bg-[var(--app-bg)]">
              <CreatePostInput 
                currentUser={currentUser} 
                onPostCreated={() => {
                  setIsCreatePostModalOpen(false);
                  setFeedRefreshTrigger(prev => prev + 1);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
