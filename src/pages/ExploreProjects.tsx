import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ProjectCard } from '../components/ProjectCard';

export const ExploreProjects: React.FC = () => {
  const { canViewExplore, canCollaborate } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewExplore) return;

    const q = query(collection(db, 'projects'), where('status', '==', 'active'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const projectData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setProjects(projectData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error on ExploreProjects snapshot:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [canViewExplore]);

  if (loading) return <div>Loading projects...</div>;

  return (
    <div className="explore-container">
      <h1>Explore Projects</h1>
      {!canCollaborate && (
        <div className="banner-info">
          You are currently in Browse Mode. Complete your profile to submit pitches or apply to projects.
        </div>
      )}
      <div className="projects-grid">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} canCollaborate={canCollaborate} />
        ))}
      </div>
    </div>
  );
};