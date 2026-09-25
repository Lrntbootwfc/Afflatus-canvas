import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAHmRtTcFIZzXEsYSHKpL4jNckRGcb5fbU",
  authDomain: "creates-b8e17.firebaseapp.com",
  projectId: "creates-b8e17",
  storageBucket: "creates-b8e17.firebasestorage.app",
  messagingSenderId: "625685398470",
  appId: "1:625685398470:web:580860e8eee59b1aaa68c7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function updateProfiles() {
  console.log('Authenticating...');
  try {
    await signInWithEmailAndPassword(auth, 'test_admin_migration@example.com', 'password123');
  } catch (err) {
    try {
      await createUserWithEmailAndPassword(auth, 'test_admin_migration@example.com', 'password123');
    } catch (createErr) {
      console.error('Failed to authenticate:', createErr);
      process.exit(1);
    }
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
