import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // Add Firestore import

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: "AIzaSyA_39wjVGlUAqqpUECUvGC1rurUAf-RZP0",
  authDomain: "isims-d5fd2.firebaseapp.com",
  projectId: "isims-d5fd2",
  storageBucket: "isims-d5fd2.firebasestorage.app",
  messagingSenderId: "612188262488",
  appId: "1:612188262488:web:d44397f7fe0196f78cfa2d",
  measurementId: "G-K1V232FL9Q",
};

// Initialize Firebase app (only if not already initialized)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore and export it
export const db = getFirestore(app);