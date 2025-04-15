"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth,db } from "../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";

// Define the shape of the context
interface AuthContextType {
  user: User | null;
  loading: boolean; // Add loading state to handle async auth state
  role: string | null;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component to wrap the app
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Track loading state
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        setUser(user);
        if (user) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              setRole(userDoc.data().role);
            } else {
              setRole(null);
            }
          } catch (error) {
            console.error('Error fetching user role:', error);
            setRole(null);
          }
        } else {
          setRole(null);
        }
        setLoading(false); // Auth state resolved
      },
      (error) => {
        console.error("Auth state change error:", error);
        setLoading(false); // Ensure loading is false even on error
        setRole(null);
      }
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, role }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}