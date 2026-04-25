import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, githubProvider, hasFirebaseConfig } from './firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY = 'teachForIndiaSession';

// The admin account that is bootstrapped on first launch.
// Credentials are shown on the login card for demo purposes.
const defaultAdmin = {
  email: 'admin@teachforindia.org',
  password: 'teachforindia2026',
  name: 'Teach For India Admin',
  role: 'admin',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const requireFirebase = () => {
  if (!hasFirebaseConfig || !db || !auth) {
    throw new Error(
      'Firebase is not configured. Add your VITE_FIREBASE_* keys to .env.local to use live storage.',
    );
  }
};

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const serialiseRegistration = (snapshot) => {
  const data = snapshot.data();
  return {
    ...data,
    userId: snapshot.id,
    updatedAt: data.updatedAt?.toDate
      ? data.updatedAt.toDate().toISOString()
      : (data.updatedAt ?? ''),
    createdAt: data.createdAt?.toDate
      ? data.createdAt.toDate().toISOString()
      : (data.createdAt ?? ''),
  };
};

const saveSession = (user) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Creates the admin Firebase Auth account and Firestore profile on first boot.
 * Silently ignores "email-already-in-use" so subsequent boots are safe.
 */
const ensureAdminUser = async () => {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      defaultAdmin.email,
      defaultAdmin.password,
    );
    // Write admin profile to Firestore (role = 'admin')
    await setDoc(
      doc(db, 'users', credential.user.uid),
      {
        id: credential.user.uid,
        name: defaultAdmin.name,
        email: defaultAdmin.email,
        role: 'admin',
        provider: 'email',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    // Admin already exists — this is expected after the first run
    if (error.code !== 'auth/email-already-in-use') {
      console.warn('Admin bootstrap warning:', error.message);
    }
  }
};

/**
 * Initialises Firebase storage. Soft-fails so the app always renders.
 */
export const initializeStorage = async () => {
  if (!hasFirebaseConfig || !db || !auth) {
    // Firebase not configured — app will run in read-only / demo mode
    return;
  }
  await ensureAdminUser();
};

// ─── Auth — Email / Password ──────────────────────────────────────────────────

/**
 * Creates a new volunteer account using Firebase Authentication.
 * Stores the user profile (without password) in Firestore.
 */
export const signupUser = async ({ name, email, password }) => {
  requireFirebase();

  // Create Firebase Auth account
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;

  // Attach display name to the Auth profile
  await updateProfile(firebaseUser, { displayName: name });

  const sessionUser = {
    id: firebaseUser.uid,
    name,
    email: firebaseUser.email,
    role: 'volunteer',
    provider: 'email',
    photoURL: null,
  };

  // Store profile in Firestore (no password field ever)
  await setDoc(
    doc(db, 'users', firebaseUser.uid),
    {
      ...sessionUser,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  saveSession(sessionUser);
  return sessionUser;
};

/**
 * Signs in an existing user (volunteer or admin) via Firebase Authentication.
 * Reads the role from the Firestore user profile.
 */
export const loginUser = async ({ email, password }) => {
  requireFirebase();

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;

  // Fetch role from Firestore
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(
    query(usersRef, where('email', '==', firebaseUser.email.toLowerCase())),
  );

  const profile = snapshot.empty ? null : snapshot.docs[0].data();
  const role = profile?.role ?? 'volunteer';
  const name = profile?.name ?? firebaseUser.displayName ?? firebaseUser.email;

  const sessionUser = {
    id: firebaseUser.uid,
    name,
    email: firebaseUser.email,
    role,
    provider: 'email',
    photoURL: firebaseUser.photoURL || null,
  };

  saveSession(sessionUser);
  return sessionUser;
};

// ─── Auth — Google ─────────────────────────────────────────────────────────────

/**
 * Opens a Google sign-in popup and upserts the volunteer profile in Firestore.
 */
export const signInWithGoogle = async () => {
  if (!hasFirebaseConfig || !auth || !googleProvider) {
    throw new Error(
      'Firebase is not configured. Add your VITE_FIREBASE_* keys to use Google Sign-In.',
    );
  }

  const result = await signInWithPopup(auth, googleProvider);
  const firebaseUser = result.user;

  const sessionUser = {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email,
    email: firebaseUser.email,
    role: 'volunteer',
    provider: 'google',
    photoURL: firebaseUser.photoURL || null,
  };

  // Upsert profile in Firestore — never overwrites role if already set
  await setDoc(
    doc(db, 'users', firebaseUser.uid),
    {
      ...sessionUser,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  saveSession(sessionUser);
  return sessionUser;
};

// ─── Auth — Github ─────────────────────────────────────────────────────────────

/**
 * Opens a Github sign-in popup and upserts the volunteer profile in Firestore.
 */
export const signInWithGithub = async () => {
  if (!hasFirebaseConfig || !auth || !githubProvider) {
    throw new Error(
      'Firebase is not configured. Add your VITE_FIREBASE_* keys to use Github Sign-In.',
    );
  }

  const result = await signInWithPopup(auth, githubProvider);
  const firebaseUser = result.user;

  const sessionUser = {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email,
    email: firebaseUser.email,
    role: 'volunteer',
    provider: 'github',
    photoURL: firebaseUser.photoURL || null,
  };

  await setDoc(
    doc(db, 'users', firebaseUser.uid),
    {
      ...sessionUser,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  saveSession(sessionUser);
  return sessionUser;
};

// ─── Session ──────────────────────────────────────────────────────────────────

export const logoutUser = async () => {
  localStorage.removeItem(SESSION_KEY);
  if (auth) {
    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out errors (e.g. already signed out)
    }
  }
};

export const getSessionUser = () => safeParse(localStorage.getItem(SESSION_KEY), null);

// ─── Registrations ────────────────────────────────────────────────────────────

export const saveRegistration = async (formData, user) => {
  requireFirebase();
  const nextRecord = {
    ...formData,
    userId: user.id,
    volunteerName: formData.name,
    volunteerEmail: formData.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'registrations', user.id), nextRecord, { merge: true });
  return {
    ...formData,
    userId: user.id,
    volunteerName: formData.name,
    volunteerEmail: formData.email,
    updatedAt: new Date().toISOString(),
  };
};

export const subscribeToRegistrations = (callback) => {
  requireFirebase();
  return onSnapshot(collection(db, 'registrations'), (snapshot) => {
    callback(snapshot.docs.map(serialiseRegistration));
  });
};

export const subscribeToRegistrationForUser = (userId, callback) => {
  requireFirebase();
  return onSnapshot(doc(db, 'registrations', userId), (snapshot) => {
    callback(snapshot.exists() ? serialiseRegistration(snapshot) : null);
  });
};

// ─── Exports for UI ───────────────────────────────────────────────────────────

export const adminCredentials = {
  email: defaultAdmin.email,
  password: defaultAdmin.password,
};

export const persistenceMode = hasFirebaseConfig ? 'firebase' : 'unconfigured';
export const isLiveStorageEnabled = hasFirebaseConfig;
