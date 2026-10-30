// Run with: node --env-file=.env update_firestore_profiles.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const MIGRATION_EMAIL = process.env.MIGRATION_ADMIN_EMAIL;
const MIGRATION_PASSWORD = process.env.MIGRATION_ADMIN_PASSWORD;

if (!MIGRATION_EMAIL || !MIGRATION_PASSWORD) {
  console.error(
    'Set MIGRATION_ADMIN_EMAIL and MIGRATION_ADMIN_PASSWORD (an existing Firebase Auth admin account) before running this script.'
  );
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function updateProfiles() {
  console.log('Authenticating...');
  try {
    await signInWithEmailAndPassword(auth, MIGRATION_EMAIL, MIGRATION_PASSWORD);
  } catch (err) {
    console.error('Failed to authenticate:', err);
    process.exit(1);
  }

  console.log('Fetching users from Firestore...');
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  console.log(`Found ${snapshot.size} users.`);
  
  let updatedCount = 0;
  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    
    // Generate some random but realistic scores if they don't have them
    const generateScore = () => Math.floor(Math.random() * 4) + 6; // 6 to 9
    
    const collaborationProfile = data.collaborationProfile || {
      creativity: generateScore(),
      communication: generateScore(),
      flexibility: generateScore(),
      reliability: generateScore(),
      teamwork: generateScore(),
      feedback_openness: generateScore(),
      leadership: Math.floor(Math.random() * 5) + 5, // 5 to 9
      technical_proficiency: generateScore() + 1 > 10 ? 10 : generateScore() + 1
    };
    
    const experience = data.experience || {
      yearsActive: Math.floor(Math.random() * 10) + 1,
      projectsCompleted: Math.floor(Math.random() * 30) + 5
    };
    
    try {
      await updateDoc(doc(db, 'users', userDoc.id), {
        collaborationProfile,
        experience
      });
      console.log(`Updated user: ${data.username || userDoc.id}`);
      updatedCount++;
    } catch (err) {
      console.error(`Failed to update ${userDoc.id}:`, err);
    }
  }
  
  console.log(`Successfully updated ${updatedCount} users.`);
  process.exit(0);
}

updateProfiles().catch(console.error);
