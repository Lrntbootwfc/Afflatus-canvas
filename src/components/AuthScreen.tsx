import React, { useState } from 'react';
import {
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import type { CreatorProfile } from '../types';
import { ROLE_CATEGORIES } from '../constants/roles';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resendVerificationEmail,
} from '../lib/firebase';
import { POPULAR_LOCATIONS, validateLocation } from '../constants/roles';
import { MapPin } from 'lucide-react';
import { resolveApiBase as resolveAuthApiBase } from '../lib/affilApi';

interface AuthScreenProps {
  onLoginSuccess: (profile: CreatorProfile, isNewSignup: boolean) => void;
  onBackToLanding: () => void;
}




export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  onBackToLanding,
}) => {
  // Mode: 'login' | 'signup' | 'email_verify_pending'
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'email_verify_pending'>('login');

  // Login Tab: 'email' | 'username'
  const [loginMethod, setLoginMethod] = useState<'email' | 'username'>('email');

  // Form Fields
  const [identifier, setIdentifier] = useState(''); // Email or Username
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup Specific Fields
  const [fullName, setFullName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupRole, setSignupRole] = useState('Cinematographer');
  const [signupLocation, setSignupLocation] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);

  // Email pending verification
  const [activeOtpEmail, setActiveOtpEmail] = useState('');
  const [receivedOtpNotice, setReceivedOtpNotice] = useState<string | null>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Submit Login Form — Firebase Auth + Firestore profile (source of truth)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMessage(`Please enter your ${loginMethod === 'username' ? 'username' : 'email address'}.`);
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Username login is not supported by Firebase email/password; require email
      const email = identifier.includes('@')
        ? identifier.trim().toLowerCase()
        : `${identifier.trim().toLowerCase().replace(/^@/, '')}@afflatus.local`;

      if (loginMethod === 'username' && !identifier.includes('@')) {
        // Username-only accounts must resolve to a real Firebase email session.
        // Never call onLoginSuccess with a server profile without Firebase Auth.
        const res = await fetch(`${resolveAuthApiBase()}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailOrUsername: identifier,
            password,
            loginType: loginMethod,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to authenticate');
        const resolvedEmail = data.fullProfile?.email;
        if (!resolvedEmail || !String(resolvedEmail).includes('@') || String(resolvedEmail).endsWith('@afflatus.local')) {
          throw new Error(
            'This account cannot sign in with username only. Use the email associated with your account, or continue with Google.'
          );
        }
        const { profile } = await signInWithEmail(resolvedEmail, password);
        onLoginSuccess(profile, false);
        return;
      }

      const { profile } = await signInWithEmail(email, password);
      onLoginSuccess(profile, false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Signup: Firebase Auth create + sendEmailVerification
  const handleEmailPasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!signupUsername.trim() || signupUsername.trim().length < 3) {
      setErrorMessage('Username is required (at least 3 characters).');
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setErrorMessage('A valid email address is required.');
      return;
    }
    if (!password) {
      setErrorMessage('Password is required.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (!signupRole.trim()) {
      setErrorMessage('Please select your primary role.');
      return;
    }
    if (!signupLocation.trim()) {
      setLocationError('Base location is required.');
      setErrorMessage('Please fill in all required fields.');
      return;
    }
    if (!validateLocation(signupLocation)) {
      setLocationError('Please enter a valid base location (e.g., "Los Angeles, CA" or "London, UK")');
      return;
    }
    setLocationError(null);
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const email = signupEmail.trim().toLowerCase();
      const { verificationEmailSent } = await signUpWithEmail(
        email,
        password,
        fullName.trim(),
        signupRole,
        signupLocation,
        signupUsername.trim().replace(/^@/, '')
      );
      setActiveOtpEmail(email);
      setReceivedOtpNotice(null);
      if (!verificationEmailSent) {
        setErrorMessage(
          'Account created but the verification email could not be sent. Try "Resend verification email" below, or check Firebase Auth email settings.'
        );
      } else {
        setSuccessNotice(
          `Account created. We sent a verification link to ${email}. Open the link, then sign in here.`
        );
      }
      setAuthMode('email_verify_pending');
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrorMessage('This email is already registered. Please sign in, or verify your email if you have not yet.');
      } else if (code === 'auth/invalid-email') {
        setErrorMessage('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setErrorMessage('Password is too weak. Use at least 6 characters.');
      } else {
        setErrorMessage(err.message || 'Signup failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // After signup: user must open Firebase link, then sign in
  const handleGoToLoginAfterVerify = () => {
    setAuthMode('login');
    setIdentifier(activeOtpEmail || signupEmail);
    setErrorMessage(null);
    setSuccessNotice('After clicking the link in your email, sign in with the same email and password.');
  };

  const handleResendVerification = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Must be signed in briefly to resend — sign in without assert then send then sign out
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth, resendVerificationEmail, signOut } = await import('../lib/firebase');
      const cred = await signInWithEmailAndPassword(auth, activeOtpEmail || signupEmail.trim().toLowerCase(), password);
      if (cred.user.emailVerified) {
        await signOut();
        setSuccessNotice('Your email is already verified. Please sign in.');
        setAuthMode('login');
        return;
      }
      await resendVerificationEmail();
      await signOut();
      setSuccessNotice('Verification email resent. Check inbox and spam.');
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Could not resend verification email. Try signing up again or use Google sign-in.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Real Google / Gmail Authentication via Firebase Auth + Firestore profile
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const inputEmail = identifier?.includes('@') ? identifier.trim() : (signupEmail?.includes('@') ? signupEmail.trim() : undefined);
      const inputName = fullName?.trim() || undefined;
      // signInWithGoogle already upserts the profile into Firestore
      const { profile: fbProfile } = await signInWithGoogle(inputEmail, inputName);
      const isNew = !fbProfile.profileCompleted;
      onLoginSuccess(fbProfile, isNew);
    } catch (err: any) {
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request' ||
        err.message?.includes('popup-closed-by-user')
      ) {
        console.info('[Auth] Google Sign-In dismissed by user.');
        setErrorMessage(null);
      } else {
        console.error('Google Sign In Error:', err);
        setErrorMessage(err.message || 'Google authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-10 selection:bg-[var(--accent-amber)] selection:text-[var(--text-primary)]">
      <div className="max-w-md w-full space-y-6">
        
        {/* Card Container */}
        <div className="card-warm-white rounded-3xl p-7 sm:p-8 shadow-2xl relative border border-[var(--card-border)]">
          
          {/* Top Mode Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="editorial-kicker justify-center">
              <span>
                {authMode === 'login'
                  ? 'WELCOME BACK'
                  : authMode === 'email_verify_pending'
                  ? 'VERIFY YOUR EMAIL'
                  : 'JOIN THE NETWORK'}
              </span>
            </div>
            <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              {authMode === 'login'
                ? 'Sign in to Afflatus'
                : authMode === 'email_verify_pending'
                ? 'Verify your email'
                : 'Create Your Profile'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {authMode === 'login'
                ? 'Access your matches, direct proposals, and project blueprints.'
                : authMode === 'email_verify_pending'
                ? `We sent a verification link to ${activeOtpEmail}`
                : 'Build your verified creator card and find tailored collaborators.'}
            </p>
          </div>

          {/* Success Banner */}
          {successNotice && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 mb-4 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 mb-4 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. DUAL LOGIN FLOW */}
          {authMode === 'login' && (
            <div className="space-y-5">
              
              {/* Dynamic Tab Switcher: [ Login with Email ] | [ Login with Username ] */}
              <div className="bg-[var(--card-inner-bg)] p-1 rounded-2xl border border-[var(--card-inner-border)] flex items-center">
                <button
                  type="button"
                  id="tab-login-email"
                  onClick={() => {
                    setLoginMethod('email');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    loginMethod === 'email'
                      ? 'bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Login with Email</span>
                </button>

                <button
                  type="button"
                  id="tab-login-username"
                  onClick={() => {
                    setLoginMethod('username');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    loginMethod === 'username'
                      ? 'bg-[var(--accent-amber)] text-[var(--nav-item-active-text,#181614)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Login with Username</span>
                </button>
              </div>

              {/* Login Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    {loginMethod === 'username' ? 'Creator Username' : 'Email Address'}
                  </label>
                  <div className="relative">
                    {loginMethod === 'username' ? (
                      <span className="absolute left-3.5 top-2.5 text-xs text-[var(--text-muted)] font-mono font-bold">@</span>
                    ) : (
                      <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                    )}
                    <input
                      id="input-login-identifier"
                      type={loginMethod === 'username' ? 'text' : 'email'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={loginMethod === 'username' ? 'e.g. aman_sharma_dp' : 'name@cinema.io'}
                      required
                      className={`w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl ${
                        loginMethod === 'username' ? 'pl-8' : 'pl-10'
                      } pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] transition-colors`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Password *
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                    <input
                      id="input-login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-10 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-submit-login"
                  disabled={isLoading}
                  className="amber-pill-btn w-full py-3 rounded-full text-xs font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-[var(--nav-item-active-text,#181614)]"
                >
                  {isLoading ? (
                    <span className="animate-pulse">Authenticating...</span>
                  ) : (
                    <>
                      <span>[ Login ]</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* 2. SIGNUP FLOW (Firebase email verification link) */}
          {authMode === 'signup' && (
            <form onSubmit={handleEmailPasswordSignup} className="space-y-4">
              
              <div className="p-3 bg-[color-mix(in_srgb,var(--accent-amber)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent-amber)_30%,transparent)] rounded-2xl text-[11px] text-[var(--text-primary)] flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
                <span>
                  <strong>Email verification:</strong> After you create an account, we send a verification <strong>link</strong> to your inbox. Open the link, then sign in.
                </span>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                  <input
                    id="input-signup-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (!signupUsername) {
                        setSignupUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                      }
                    }}
                    placeholder="e.g. Maya Chen"
                    required
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                </div>
              </div>

              {/* Unique Username Input Field */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Create Unique Username *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-[var(--accent-amber)] font-mono font-bold">@</span>
                  <input
                    id="input-signup-username"
                    type="text"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="maya_chen_films"
                    required
                    minLength={3}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-8 pr-3.5 py-2.5 text-xs font-mono text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
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
                    id="input-signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="maya@visions.net"
                    required
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                </div>
              </div>

              {/* Comprehensive Categorized Role Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Primary Role / What You Offer *
                </label>
                <select
                  id="select-signup-role"
                  value={signupRole}
                  onChange={(e) => setSignupRole(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                >
                  {ROLE_CATEGORIES.map((cat) => (
                    <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                      {cat.roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Base Location */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Base Location *
                  </label>
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                  <input
                    id="input-signup-location"
                    type="text"
                    list="signup-locations-list"
                    value={signupLocation}
                    onChange={(e) => {
                      setSignupLocation(e.target.value);
                      setLocationError(null);
                    }}
                    placeholder="e.g. Los Angeles, CA"
                    required
                    className={`w-full bg-[var(--input-bg)] border ${locationError ? 'border-red-500' : 'border-[var(--input-border)]'} rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]`}
                  />
                  <datalist id="signup-locations-list">
                    {POPULAR_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
                {locationError && (
                  <p className="text-red-500 text-[10px] mt-1">{locationError}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Set Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                  <input
                    id="input-signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl pl-10 pr-10 py-2.5 text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent-amber)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Create account */}
              <button
                type="submit"
                id="btn-submit-signup"
                disabled={isLoading}
                className="amber-pill-btn w-full py-3 rounded-full text-xs font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-[var(--nav-item-active-text,#181614)]"
              >
                {isLoading ? (
                  <span className="animate-pulse">Creating account...</span>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>[ Create account ]</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 3. EMAIL VERIFICATION PENDING */}
          {authMode === 'email_verify_pending' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-inner-bg)] text-xs text-[var(--text-secondary)] space-y-2">
                <p className="font-semibold text-[var(--text-primary)]">Verify your email</p>
                <p>
                  We created your account and sent a verification <strong>link</strong> to{' '}
                  <span className="font-mono text-[var(--text-primary)]">{activeOtpEmail || signupEmail}</span>.
                </p>
                <p>
                  Open the email (check spam), click the link, then come back and sign in with the same email and password.
                </p>
              </div>
              <button
                type="button"
                id="btn-go-login-after-verify"
                onClick={handleGoToLoginAfterVerify}
                disabled={isLoading}
                className="amber-pill-btn w-full py-3 rounded-full text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                I verified — go to Sign in
              </button>
              <button
                type="button"
                id="btn-resend-verification"
                onClick={handleResendVerification}
                disabled={isLoading}
                className="w-full py-2.5 rounded-full text-xs font-semibold border border-[var(--card-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {isLoading ? 'Please wait…' : 'Resend verification email'}
              </button>
            </div>
          )}

          {/* 4. Google + mode switch (hidden while waiting for email verification) */}
          {authMode !== 'email_verify_pending' && (
            <>
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--card-border)]" />
                </div>
                <span className="relative px-3 bg-[var(--card-bg)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  OR CONTINUE WITH
                </span>
              </div>

              {/* Google / Gmail 1-Click Button */}
              <button
                type="button"
                id="btn-auth-google"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 rounded-full bg-[var(--card-inner-bg)] hover:bg-[var(--tag-bg)] text-[var(--text-primary)] border border-[var(--card-inner-border)] text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Toggle between Login and Signup */}
              <div className="mt-6 text-center pt-2">
                <button
                  type="button"
                  id="btn-toggle-auth-mode"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'signup' : 'login');
                    setErrorMessage(null);
                    setSuccessNotice(null);
                  }}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-amber)] transition-colors cursor-pointer"
                >
                  {authMode === 'login'
                    ? "Don't have a profile yet? Create an Account"
                    : 'Already have an account? Sign in here'}
                </button>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
};
