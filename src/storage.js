import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, hasFirebaseConfig } from './firebase';

const SESSION_KEY = 'teachForIndiaSession';

const defaultAdmin = {
  id: 'admin-1',
  name: 'Teach For India Admin',
  email: 'admin@teachforindia.org',
  password: 'teachforindia2026',
  role: 'admin',
};

const requireFirebase = () => {
  if (!hasFirebaseConfig || !db) {
    throw new Error('Firebase is not configured. Add your VITE_FIREBASE_* keys to run live storage.');
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
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? '',
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? '',
  };
};

const saveSession = (user) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
};

const findUserByEmail = async (email) => {
  requireFirebase();
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(query(usersRef, where('email', '==', email.toLowerCase())));
  return snapshot.empty ? null : snapshot.docs[0].data();
};

const ensureAdminUser = async () => {
  requireFirebase();
  await setDoc(
    doc(db, 'users', defaultAdmin.id),
    {
      ...defaultAdmin,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const initializeStorage = async () => {
  requireFirebase();
  await ensureAdminUser();
};

export const signupUser = async ({ name, email, password }) => {
  requireFirebase();
  const normalizedEmail = email.toLowerCase();
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error('An account with this email already exists.');
  }

  const nextUser = {
    id: `user-${Date.now()}`,
    name,
    email: normalizedEmail,
    password,
    role: 'volunteer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'users', nextUser.id), {
    ...nextUser,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  saveSession(nextUser);
  return nextUser;
};

export const loginUser = async ({ email, password }) => {
  requireFirebase();
  const normalizedEmail = email.toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user || user.password !== password) {
    throw new Error('Invalid email or password.');
  }

  const sessionUser = {
    ...user,
    createdAt: user.createdAt?.toDate ? user.createdAt.toDate().toISOString() : user.createdAt,
    updatedAt: user.updatedAt?.toDate ? user.updatedAt.toDate().toISOString() : user.updatedAt,
  };

  saveSession(sessionUser);
  return sessionUser;
};

export const logoutUser = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const getSessionUser = () => safeParse(localStorage.getItem(SESSION_KEY), null);

export const getRegistrationForUser = async (userId) => {
  requireFirebase();
  const registrationDoc = await getDoc(doc(db, 'registrations', userId));
  return registrationDoc.exists() ? serialiseRegistration(registrationDoc) : null;
};

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

export const getAllRegistrations = async () => {
  requireFirebase();
  const snapshot = await getDocs(collection(db, 'registrations'));
  return snapshot.docs.map(serialiseRegistration);
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

export const adminCredentials = {
  email: defaultAdmin.email,
  password: defaultAdmin.password,
};

export const persistenceMode = hasFirebaseConfig ? 'firebase' : 'unconfigured';
export const isLiveStorageEnabled = hasFirebaseConfig;
