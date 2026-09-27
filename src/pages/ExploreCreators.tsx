import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { CreatorCard } from '../components/CreatorCard';

export const ExploreCreators: React.FC = () => {
  const { canViewExplore, canCollaborate } = useAuth();
  const [creators, setCreators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewExplore) return;

    const q = query(collection(db, 'users'), where('status', '==', 'APPROVED'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const creatorData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setCreators(creatorData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error on ExploreCreators snapshot:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [canViewExplore]);

  if (loading) return <div>Loading creators...</div>;

  return (
    <div className="explore-container">
      <h1>Explore Creators</h1>
      {!canCollaborate && (
        <div className="banner-info">
          You are currently in Browse Mode. Complete your profile to initiate collaborations.
        </div>
      )}
      <div className="creators-grid">
        {creators.map((creator) => (
          <CreatorCard key={creator.id} creator={creator} canCollaborate={canCollaborate} />
        ))}
      </div>
    </div>
  );
};