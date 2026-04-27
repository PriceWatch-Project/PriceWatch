import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // Disabled in favor of SQLite
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { firebaseConfig };

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Connection test disabled for Firestore
// async function testConnection() { ... }
