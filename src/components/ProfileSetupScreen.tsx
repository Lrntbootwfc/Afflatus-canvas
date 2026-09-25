import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Briefcase,
  Layers,
  Link as LinkIcon,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Globe,
  Youtube,
  Instagram,
  Linkedin,
  Facebook,
  Twitter,
  MapPin,
  Sparkles,
  Camera,
  Music,
  Video,
  FileText,
  AlertCircle,
  IndianRupee,
  Image as ImageIcon,
} from 'lucide-react';
import type { CreatorProfile, WorkLink, SocialLinks, PortfolioItem } from '../types';
import { UserAvatar } from './UserAvatar';
import { ImagePickerModal } from './ImagePickerModal';
import { MultiRoleSelect } from './MultiRoleSelect';
import {
  ROLE_CATEGORIES,
  ALL_ROLES,
  POPULAR_LOCATIONS,
  validateLocation,
  validateSocialUrl,
} from '../constants/roles';
import { updateProfileInFirestore } from '../lib/firebase';
import { affilApi } from '../lib/affilApi';

interface ProfileSetupScreenProps {
  initialProfile: CreatorProfile;
  onProfileSaved: (updatedProfile: CreatorProfile) => void;
  onCancel?: () => void;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  initialProfile,
  onProfileSaved,
  onCancel,
}) => {
  // Form State
  const [username, setUsername] = useState(initialProfile.username || '');
  const [fullName, setFullName] = useState(initialProfile.name || '');
  const [email, setEmail] = useState(initialProfile.email || '');
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl || '');
  const [coverImageUrl, setCoverImageUrl] = useState(initialProfile.coverImageUrl || '');
  const [offeredRoles, setOfferedRoles] = useState<string[]>(() => {
    const fromSecondary = initialProfile.secondaryRoles || [];
    const primary = initialProfile.primaryRole ? [initialProfile.primaryRole] : [];
    return Array.from(new Set([...primary, ...fromSecondary].filter(Boolean)));
  });
  const [seekingRoles, setSeekingRoles] = useState<string[]>(initialProfile.seekingRoles || []);
  const [travelPreference, setTravelPreference] = useState<string>(
    (initialProfile as any).travelPreference || 'within_city'
  );
  const [location, setLocation] = useState(initialProfile.location || '');
  const [bio, setBio] = useState(initialProfile.bio || '');
  const [yearsActive, setYearsActive] = useState(initialProfile.experience?.yearsActive || 0);
  const [projectsCompleted, setProjectsCompleted] = useState(initialProfile.experience?.projectsCompleted || 0);
  const [roleSpecificProjects, setRoleSpecificProjects] = useState(initialProfile.experience?.roleSpecificProjects || 0);
  
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>(initialProfile.portfolios || []);

  const [scenarioQ1, setScenarioQ1] = useState((initialProfile as any).collaborationScenarios?.q1 || '');
  const [scenarioQ2, setScenarioQ2] = useState((initialProfile as any).collaborationScenarios?.q2 || '');
  const [scenarioQ3, setScenarioQ3] = useState((initialProfile as any).collaborationScenarios?.q3 || '');
  const [scenarioQ4, setScenarioQ4] = useState((initialProfile as any).collaborationScenarios?.q4 || '');
  const [scenarioQ5, setScenarioQ5] = useState((initialProfile as any).collaborationScenarios?.q5 || '');

  // Work links — empty until user adds (no demo YouTube/Behance)
  const [workLinks, setWorkLinks] = useState<WorkLink[]>(
    initialProfile.workLinks && initialProfile.workLinks.length > 0
      ? initialProfile.workLinks
      : []
  );

  // Social Media Links
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    initialProfile.socialLinks || {
      linkedin: '',
      instagram: '',
      facebook: '',
      pinterest: '',
      twitter: '',
      custom: '',
    }
  );

  // Rehydrate form when profile loads from Firestore (after refresh)
  useEffect(() => {
    setUsername(initialProfile.username || '');
    setFullName(initialProfile.name || '');
    setEmail(initialProfile.email || '');
    setAvatarUrl(initialProfile.avatarUrl || '');
    setCoverImageUrl(initialProfile.coverImageUrl || '');
    const fromSecondary = initialProfile.secondaryRoles || [];
    const primary = initialProfile.primaryRole ? [initialProfile.primaryRole] : [];
    setOfferedRoles(Array.from(new Set([...primary, ...fromSecondary].filter(Boolean))));
    setSeekingRoles(initialProfile.seekingRoles || []);
    setTravelPreference((initialProfile as any).travelPreference || 'within_city');
    const sc = (initialProfile as any).collaborationScenarios || {};
    setScenarioQ1(sc.q1 || '');
    setScenarioQ2(sc.q2 || '');
    setScenarioQ3(sc.q3 || '');
    setScenarioQ4(sc.q4 || '');
    setScenarioQ5(sc.q5 || '');
    setLocation(initialProfile.location || '');
    setBio(initialProfile.bio || '');
    setYearsActive(initialProfile.experience?.yearsActive || 0);
    setProjectsCompleted(initialProfile.experience?.projectsCompleted || 0);
    setRoleSpecificProjects(initialProfile.experience?.roleSpecificProjects || 0);
    setPortfolios(initialProfile.portfolios || []);
    setWorkLinks(initialProfile.workLinks?.length ? initialProfile.workLinks : []);
    setSocialLinks(initialProfile.socialLinks || {
      linkedin: '',
      instagram: '',
      facebook: '',
      pinterest: '',
      twitter: '',
      custom: '',
    });
  }, [initialProfile.id, initialProfile.profileCompleted]);

  // Validation States
  const [locationError, setLocationError] = useState<string | null>(null);
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Image Picker Modals
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [avatarPickerTab, setAvatarPickerTab] = useState<'gallery' | 'camera' | 'url'>('gallery');
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const [coverPickerTab, setCoverPickerTab] = useState<'gallery' | 'camera' | 'url'>('gallery');
  const [isPortfolioPickerOpen, setIsPortfolioPickerOpen] = useState(false);

  // Add Work Link
  const addWorkLink = () => {
    const newLink: WorkLink = {
      id: `wl_${Date.now()}`,
      title: 'Project Link / Reel',
      url: 'https://',
      platform: 'website',
    };
    setWorkLinks([...workLinks, newLink]);
  };

  // Remove Work Link
  const removeWorkLink = (id: string) => {
    setWorkLinks(workLinks.filter((l) => l.id !== id));
  };

  // Update Work Link
  const updateWorkLink = (
    id: string,
    field: keyof WorkLink,
    value: string
  ) => {
    setWorkLinks(
      workLinks.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  // Validate Social Link on Change / Blur
  const handleSocialLinkChange = (
    platform: keyof SocialLinks,
    value: string
  ) => {
    setSocialLinks({ ...socialLinks, [platform]: value });
    if (value.trim()) {
      const result = validateSocialUrl(platform as any, value);
      if (!result.isValid && result.error) {
        setSocialErrors((prev) => ({ ...prev, [platform]: result.error! }));
      } else {
        setSocialErrors((prev) => {
          const next = { ...prev };
          delete next[platform];
          return next;
        });
      }
    } else {
      setSocialErrors((prev) => {
        const next = { ...prev };
        delete next[platform];
        return next;
      });
    }
  };

  // Validate Location on Blur
  const handleLocationBlur = () => {
    const check = validateLocation(location);
    if (!check.isValid && check.warning) {
      setLocationError(check.warning);
    } else {
      setLocationError(null);
    }
  };

  // Handle Form Submit
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!fullName.trim() || !email.trim()) {
      setSaveError('Full Name and Email are required.');
      return;
    }

    // 1. Validate Base Location
    const locCheck = validateLocation(location);
    if (!locCheck.isValid) {
      setLocationError(locCheck.warning || 'Please enter a valid base location (city, state/country).');
      setSaveError('Please enter a valid base location before saving.');
      return;
    }

    // 2. Validate Social Media Links
    const currentSocialErrors: Record<string, string> = {};
    const formattedSocials: SocialLinks = {};

    for (const [key, val] of Object.entries(socialLinks)) {
      const strVal = typeof val === 'string' ? val.trim() : '';
      if (strVal) {
        const check = validateSocialUrl(key as any, strVal);
        if (!check.isValid && check.error) {
          currentSocialErrors[key] = check.error;
        } else {
          (formattedSocials as any)[key] = check.formattedUrl;
        }
      }
    }

    if (Object.keys(currentSocialErrors).length > 0) {
      setSocialErrors(currentSocialErrors);
      setSaveError('Please ensure all social media URLs are valid before continuing.');
      return;
    }

    // 3. Validate Work Links
    for (const link of workLinks) {
      if (link.url && link.url.trim() && link.url !== 'https://') {
        const check = validateSocialUrl('workLink', link.url);
        if (!check.isValid) {
          setSaveError(`Please provide a valid URL for work link: "${link.title || 'Reel'}"`);
          return;
        }
      }
    }

    if (!offeredRoles.length) {
      setSaveError('Select at least one role you offer.');
      return;
    }

    setIsSaving(true);

    try {
      let collaborationProfile = initialProfile.collaborationProfile;
      
      if (!initialProfile.profileCompleted) {
        // Analyze collaboration scenarios using Gemini only during initial setup
        const answers = {
          scenario_q1: scenarioQ1,
          scenario_q2: scenarioQ2,
          scenario_q3: scenarioQ3,
          scenario_q4: scenarioQ4,
          scenario_q5: scenarioQ5,
        };
        
        const analysisResponse = await affilApi.analyzeCollaborationProfile(answers);
        collaborationProfile = analysisResponse.collaborationProfile;
      }

      const updatedProfile: CreatorProfile = {
        ...initialProfile,
        username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        name: fullName.trim(),
        email: email.trim(),
        primaryRole: offeredRoles[0] || '',
        secondaryRoles: offeredRoles.slice(1),
        seekingRoles,
        travelPreference,
        collaborationScenarios: {
          q1: scenarioQ1,
          q2: scenarioQ2,
          q3: scenarioQ3,
          q4: scenarioQ4,
          q5: scenarioQ5,
        },
        location: locCheck.normalized,
        bio,
        experience: {
          yearsActive: Number(yearsActive) || 0,
          projectsCompleted: Number(projectsCompleted) || 0,
          roleSpecificProjects: Number(roleSpecificProjects) || 0,
        },
        collaborationProfile,
        workLinks: workLinks.filter((wl) => wl.url.trim() && wl.url !== 'https://'),
        socialLinks: formattedSocials,
        avatarUrl: avatarUrl.trim(),
        coverImageUrl: coverImageUrl.trim(),
        portfolios,
        profileCompleted: true,
      };

      // Persist to Firestore (source of truth for user/profile data)
      const saved = await updateProfileInFirestore(updatedProfile);
      onProfileSaved(saved);
    } catch (err: any) {
      setSaveError(err.message || 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-[var(--accent-amber)] selection:text-white pb-24">
      
      {/* Top Header */}
      <div className="mb-8 text-left space-y-2">
        <div className="editorial-kicker">
          <span>ONBOARDING &amp; PROFILE SETUP</span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
          {initialProfile.profileCompleted ? 'Edit Your Creator Profile' : 'Complete Your Creator Profile'}
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          Set up your primary role, base location, work reels, social links, and collaborator roles to personalize your feed.
        </p>
      </div>

      {saveError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-8">
        
        {/* Section 0: Visual Identity (Cover Banner & Profile Photo) */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-6 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-[var(--accent-amber)]" />
              <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
                Visual Identity
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] italic hidden sm:inline">
              Click banner or avatar below to upload or change
            </span>
          </div>

          <p className="text-xs text-[var(--text-secondary)]">
            Personalize your filmmaker profile with a custom cover banner and profile picture. Click on the banner or monogram directly to capture a photo or select from your gallery.
          </p>

          {/* Interactive Live Preview Card */}
          <div className="relative rounded-2xl overflow-hidden border border-[var(--card-border)] bg-[var(--card-inner-bg)] shadow-inner">
            {/* Banner Area (Clickable to Add/Change Banner) */}
            <div 
              onClick={() => setIsCoverPickerOpen(true)}
              className="h-36 sm:h-44 w-full bg-[var(--card-border)] relative overflow-hidden flex items-center justify-center group cursor-pointer"
              title="Click to change cover banner"
            >
              {coverImageUrl ? (
                <img
                  src={coverImageUrl}
                  alt="Cover Banner Preview"
                  className="w-full h-full object-cover transition-transform group-hover:scale-102 duration-300"
                  onError={() => {}}
                />
              ) : (
                <div className="text-center p-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--card-bg)] text-[var(--text-primary)] border border-[var(--card-inner-border)] text-xs font-semibold mb-1 shadow-xs group-hover:border-[var(--accent-amber)] transition-colors">
                    <Camera className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                    <span>Add Cover Banner</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    Click to capture or select a photo from your gallery
                  </span>
                </div>
              )}
              
              {coverImageUrl && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
              )}

              {/* Quick banner change overlay buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {coverImageUrl && (
                  <button
                    type="button"
                    onClick={() => setCoverImageUrl('')}
                    className="px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-red-600/90 text-white text-[10px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1 transition-all shadow-md cursor-pointer"
                    title="Remove Cover Banner"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
                <button
                  type="button"
                  id="btn-interactive-change-banner"
                  onClick={() => setIsCoverPickerOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white text-[11px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                  <span>{coverImageUrl ? 'Change Banner' : 'Add Banner'}</span>
                </button>
              </div>
            </div>

            {/* Profile Avatar & Overlay Header */}
            <div className="px-5 pb-5 pt-0 relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-10 sm:-mt-12">
              <div className="flex items-end gap-3.5">
                {/* Clickable Avatar / Monogram */}
                <div 
                  id="btn-interactive-avatar-picker"
                  className="relative group cursor-pointer" 
                  onClick={() => setIsAvatarPickerOpen(true)}
                  title="Click to change profile picture or monogram"
                >
                  <UserAvatar
                    name={fullName || 'Creator'}
                    avatarUrl={avatarUrl}
                    size="xl"
                    className="shadow-xl ring-4 ring-[var(--card-bg)] transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-xs">
                    <Camera className="w-5 h-5 text-[var(--accent-amber)]" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Change</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] border-2 border-[var(--card-bg)] flex items-center justify-center shadow-md">
                    <Camera className="w-3 h-3" />
                  </div>
                </div>

                <div className="mb-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-editorial text-base sm:text-lg font-bold text-[var(--text-primary)] leading-tight">
                      {fullName || 'Your Creator Name'}
                    </h4>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-[10px] text-[var(--text-muted)] hover:text-red-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="Reset to letter monogram"
                      >
                        <Trash2 className="w-2.5 h-2.5" /> Monogram
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--accent-amber)] font-medium">
                    {offeredRoles[0] || 'Creator'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 font-mono">
                    <MapPin className="w-3 h-3 text-[var(--accent-amber)]" /> {location || 'Location not set'}
                  </p>
                </div>
              </div>

              <div className="sm:self-end flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--tag-bg)] text-[var(--text-secondary)] border border-[var(--tag-border)]">
                  Live Preview
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Profile Details */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-5 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--card-border)]">
            <User className="w-4 h-4 text-[var(--accent-amber)]" />
            <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
              Profile Details
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Username (Auto-filled / Editable) */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Username (Handle) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-[var(--accent-amber)] font-mono font-bold">@</span>
                <input
                  id="profile-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="aman_sharma_dp"
                  required
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-8 pr-3.5 py-2.5 text-xs font-mono text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                <input
                  id="profile-fullname-input"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aman Sharma"
                  required
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                <input
                  id="profile-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aman@cinema.io"
                  required
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>
            </div>

            {/* Roles you offer — multi-select */}
            <MultiRoleSelect
              id="profile-roles-offered"
              label="What roles do you offer?"
              hint="Select every role you can take on a production. First selected is treated as your primary role."
              selected={offeredRoles}
              onChange={setOfferedRoles}
              required
            />

            {/* Roles you seek — multi-select */}
            <MultiRoleSelect
              id="profile-roles-seeking"
              label="Who are you seeking?"
              hint="People you usually need on a project. Used to personalize discovery."
              selected={seekingRoles}
              onChange={setSeekingRoles}
            />


            {/* Base Location with Validation */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Base Location *
                </label>
                <span className="text-[10px] text-[var(--text-muted)]">
                  City, Region/State
                </span>
              </div>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                <input
                  id="profile-location-input"
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    if (locationError) setLocationError(null);
                  }}
                  onBlur={handleLocationBlur}
                  placeholder="e.g. Mumbai, Maharashtra or Bengaluru"
                  required
                  list="popular-locations-list"
                  className={`w-full bg-[var(--input-bg)] border ${
                    locationError ? 'border-red-500' : 'border-[var(--input-border)]'
                  } rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
                />
                <datalist id="popular-locations-list">
                  {POPULAR_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
              {locationError && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{locationError}</span>
                </p>
              )}
            </div>

            {/* Factual Experience */}
            <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[var(--card-border)]">
              <div className="col-span-1 sm:col-span-3">
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Factual Experience
                </label>
              </div>
              
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Years Active
                </label>
                <input
                  type="number"
                  min="0"
                  value={yearsActive}
                  onChange={(e) => setYearsActive(Number(e.target.value))}
                  placeholder="e.g. 5"
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Projects Completed
                </label>
                <input
                  type="number"
                  min="0"
                  value={projectsCompleted}
                  onChange={(e) => setProjectsCompleted(Number(e.target.value))}
                  placeholder="e.g. 20"
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Role Specific Projects
                </label>
                <input
                  type="number"
                  min="0"
                  value={roleSpecificProjects}
                  onChange={(e) => setRoleSpecificProjects(Number(e.target.value))}
                  placeholder="e.g. 15"
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                />
              </div>
            </div>

            {/* Collaboration Scenarios + Travel (behaviour + mobility) */}
            {true && (
            <div className="col-span-1 sm:col-span-2 space-y-4 pt-4 border-t border-[var(--card-border)]">
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Collaboration Scenarios
              </label>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Can you travel for work?
                </label>
                <select
                  id="profile-travel-preference"
                  value={travelPreference}
                  onChange={(e) => setTravelPreference(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                >
                  <option value="remote_only">Remote only</option>
                  <option value="within_city">Within my city</option>
                  <option value="nearby_cities">Nearby cities</option>
                  <option value="nearby_metro">Nearby metro cities</option>
                  <option value="nearby_states">Nearby states</option>
                  <option value="anywhere">Anywhere</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  1. You strongly disagree with the creative direction chosen by someone leading your project. What would you do?
                </label>
                <textarea
                  value={scenarioQ1}
                  onChange={(e) => setScenarioQ1(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none"
                  placeholder="Share your approach..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  2. Someone gives you critical feedback about your work. How do you usually respond?
                </label>
                <textarea
                  value={scenarioQ2}
                  onChange={(e) => setScenarioQ2(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none"
                  placeholder="Share your approach..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  3. Your team is behind schedule and your task is taking longer than expected. What would you do?
                </label>
                <textarea
                  value={scenarioQ3}
                  onChange={(e) => setScenarioQ3(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none"
                  placeholder="Share your approach..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  4. Which collaboration style describes you best?
                </label>
                <select
                  value={scenarioQ4}
                  onChange={(e) => setScenarioQ4(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                >
                  <option value="" disabled>Select an option...</option>
                  <option value="Prefer clear direction and execute it">Prefer clear direction and execute it</option>
                  <option value="Discuss ideas and shape the direction together">Discuss ideas and shape the direction together</option>
                  <option value="Prefer taking ownership and proposing my own direction">Prefer taking ownership and proposing my own direction</option>
                  <option value="Depends on the project">Depends on the project</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  5. What qualities do you value most in someone you collaborate with?
                </label>
                <textarea
                  value={scenarioQ5}
                  onChange={(e) => setScenarioQ5(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] resize-none"
                  placeholder="Share your thoughts..."
                />
              </div>
            </div>
            )}

          </div>
        </div>

        {/* Section 2: Portfolio & Bio Section */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-4 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--card-border)]">
            <FileText className="w-4 h-4 text-[var(--accent-amber)]" />
            <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
              Portfolio &amp; Bio ("More About You")
            </h3>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Creator Bio &amp; Technical Equipment Notes
            </label>
            <textarea
              id="profile-bio-textarea"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell directors and collaborators about your visual style, past productions, and special camera/audio gear packages..."
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl p-3.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] leading-relaxed"
            />
          </div>
        </div>

        {/* Section 2b: Portfolio Images */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-4 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[var(--accent-amber)]" />
              <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
                Portfolio Images
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsPortfolioPickerOpen(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--card-inner-bg)] hover:bg-[var(--accent-amber)]/10 text-[var(--text-primary)] border border-[var(--card-inner-border)] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
              <span>Upload Image</span>
            </button>
          </div>
          
          {portfolios.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--text-muted)]">No portfolio images uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {portfolios.map((item) => (
                <div key={item.id} className="relative group rounded-xl overflow-hidden border border-[var(--card-inner-border)] bg-[var(--card-inner-bg)]">
                  {item.rawFileUrl && (
                    <img src={item.rawFileUrl} alt="Portfolio" className="w-full h-32 object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPortfolios(portfolios.filter(p => p.id !== item.id))}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Dedicated Work Links (Clean Title without '*') */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-4 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-[var(--accent-amber)]" />
              <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
                Work Links (Reels, Case Studies, Projects)
              </h3>
            </div>
            <button
              type="button"
              onClick={addWorkLink}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--card-inner-bg)] hover:bg-[var(--accent-amber)]/10 text-[var(--text-primary)] border border-[var(--card-inner-border)] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
              <span>Add Link</span>
            </button>
          </div>

          <div className="space-y-3">
            {workLinks.map((link) => (
              <div
                key={link.id}
                className="bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] rounded-2xl p-3.5 flex flex-col sm:flex-row items-center gap-3"
              >
                <div className="w-full sm:w-1/3">
                  <input
                    type="text"
                    value={link.title}
                    onChange={(e) => updateWorkLink(link.id, 'title', e.target.value)}
                    placeholder="Project Title / Reel Name"
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                </div>

                <div className="w-full sm:w-1/4">
                  <select
                    value={link.platform}
                    onChange={(e) => updateWorkLink(link.id, 'platform', e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                    <option value="behance">Behance</option>
                    <option value="dribbble">Dribbble</option>
                    <option value="website">Custom Website</option>
                    <option value="other">Other Link</option>
                  </select>
                </div>

                <div className="w-full sm:flex-1">
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateWorkLink(link.id, 'url', e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-1.5 text-xs font-mono text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeWorkLink(link.id)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Remove link"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 5: Social Media Links Bar with Real-time Link Validation */}
        <div className="card-warm-white rounded-3xl p-6 sm:p-8 space-y-4 border border-[var(--card-border)] shadow-md">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--card-border)]">
            <Globe className="w-4 h-4 text-[var(--accent-amber)]" />
            <h3 className="font-editorial text-lg font-bold text-[var(--text-primary)]">
              Social Media Links (Validated Handles &amp; URLs)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* LinkedIn */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Linkedin className="w-3.5 h-3.5 text-[#0A66C2]" />
                <span>LinkedIn URL</span>
              </label>
              <input
                type="text"
                value={socialLinks.linkedin || ''}
                onChange={(e) => handleSocialLinkChange('linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/username"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.linkedin ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.linkedin && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.linkedin}</span>
                </p>
              )}
            </div>

            {/* Instagram */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-[#E4405F]" />
                <span>Instagram URL / Handle</span>
              </label>
              <input
                type="text"
                value={socialLinks.instagram || ''}
                onChange={(e) => handleSocialLinkChange('instagram', e.target.value)}
                placeholder="@username or https://instagram.com/handle"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.instagram ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.instagram && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.instagram}</span>
                </p>
              )}
            </div>

            {/* Facebook */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
                <span>Facebook URL / Page</span>
              </label>
              <input
                type="text"
                value={socialLinks.facebook || ''}
                onChange={(e) => handleSocialLinkChange('facebook', e.target.value)}
                placeholder="https://facebook.com/page"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.facebook ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.facebook && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.facebook}</span>
                </p>
              )}
            </div>

            {/* Pinterest */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="font-bold text-[#E60023]">P</span>
                <span>Pinterest / Moodboards</span>
              </label>
              <input
                type="text"
                value={socialLinks.pinterest || ''}
                onChange={(e) => handleSocialLinkChange('pinterest', e.target.value)}
                placeholder="https://pinterest.com/moodboard"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.pinterest ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.pinterest && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.pinterest}</span>
                </p>
              )}
            </div>

            {/* Twitter / X */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Twitter className="w-3.5 h-3.5 text-[#1DA1F2]" />
                <span>X / Twitter</span>
              </label>
              <input
                type="text"
                value={socialLinks.twitter || ''}
                onChange={(e) => handleSocialLinkChange('twitter', e.target.value)}
                placeholder="https://x.com/handle"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.twitter ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.twitter && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.twitter}</span>
                </p>
              )}
            </div>

            {/* Custom Website */}
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                <span>Custom Portfolio Website</span>
              </label>
              <input
                type="text"
                value={socialLinks.custom || ''}
                onChange={(e) => handleSocialLinkChange('custom', e.target.value)}
                placeholder="https://myportfoliosite.com"
                className={`w-full bg-[var(--input-bg)] border ${
                  socialErrors.custom ? 'border-red-500' : 'border-[var(--input-border)]'
                } rounded-2xl px-3.5 py-2 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
              />
              {socialErrors.custom && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{socialErrors.custom}</span>
                </p>
              )}
            </div>

          </div>
        </div>

        {/* Form Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-6 py-3 rounded-full text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] border border-[var(--card-inner-border)] transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            id="btn-save-profile-continue"
            disabled={isSaving}
            className="amber-pill-btn w-full sm:w-auto px-8 py-3.5 rounded-full text-xs font-bold shadow-lg hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            {isSaving ? (
              <span className="animate-pulse">Saving Profile...</span>
            ) : (
              <>
                <span>[ Save Profile &amp; Continue ]</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </form>

      {/* Profile Picture Image Picker (Camera & Gallery) */}
      <ImagePickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        title="Choose Profile Picture"
        subtitle="Take a photo with camera, upload from gallery, or use letter monogram"
        currentImageUrl={avatarUrl}
        userName={fullName || 'Creator'}
        isBanner={false}
        initialTab={avatarPickerTab}
        onImageSelected={(url) => setAvatarUrl(url)}
      />

      {/* Cover Banner Image Picker (Camera & Gallery) */}
      <ImagePickerModal
        isOpen={isCoverPickerOpen}
        onClose={() => setIsCoverPickerOpen(false)}
        title="Choose Dashboard Cover Banner"
        subtitle="Capture or select a panoramic banner image for your creator profile"
        currentImageUrl={coverImageUrl}
        userName={fullName || 'Creator'}
        isBanner={true}
        initialTab={coverPickerTab}
        onImageSelected={(url) => setCoverImageUrl(url)}
      />

      {/* Portfolio Image Picker */}
      <ImagePickerModal
        isOpen={isPortfolioPickerOpen}
        onClose={() => setIsPortfolioPickerOpen(false)}
        title="Upload Portfolio Image"
        subtitle="Add a high-quality image of your work"
        currentImageUrl=""
        userName={fullName || 'Creator'}
        isBanner={false}
        initialTab="gallery"
        onImageSelected={(url) => {
          if (url) {
            setPortfolios([
              ...portfolios,
              {
                id: Date.now().toString(),
                title: 'Portfolio Image',
                mediaType: 'image',
                rawFileUrl: url,
                tags: [],
              }
            ]);
          }
          setIsPortfolioPickerOpen(false);
        }}
      />

    </div>
  );
};
