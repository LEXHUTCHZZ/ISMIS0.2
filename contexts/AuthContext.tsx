"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth,db } from "../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

// Define the shape of the context
interface AuthContextType {
  user: User | null;
  loading: boolean; // Add loading state to handle async auth state
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component to wrap the app
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Track loading state

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
        setLoading(false); // Auth state resolved
      },
      (error) => {
        console.error("Auth state change error:", error);
        setLoading(false); // Ensure loading is false even on error
      }
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
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