import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  requireExploreAccess?: boolean;
  requireCollaborationAccess?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requireExploreAccess = false,
  requireCollaborationAccess = false,
}) => {
  const { user, loading, canViewExplore, canCollaborate } = useAuth();

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireExploreAccess && !canViewExplore) {
    return <Navigate to="/application-status" replace />;
  }

  if (requireCollaborationAccess && !canCollaborate) {
    return <Navigate to="/complete-profile" replace />;
  }

  return <Outlet />;
};