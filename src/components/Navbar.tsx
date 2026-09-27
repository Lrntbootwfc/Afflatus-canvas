import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, profile, canViewExplore, canCollaborate } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Afflatus</Link>
      </div>

      <div className="navbar-menu">
        <Link to="/about">About Platform</Link>

        {canViewExplore && (
          <>
            <Link to="/explore/creators">Explore Creators</Link>
            <Link to="/explore/projects">Explore Projects</Link>
          </>
        )}

        {canViewExplore && !canCollaborate && (
          <div className="profile-warning-badge">
            <Link to="/complete-profile">Complete Profile to Collaborate</Link>
          </div>
        )}

        {user ? (
          <Link to="/profile">My Profile</Link>
        ) : (
          <Link to="/login">Sign In</Link>
        )}
      </div>
    </nav>
  );
};