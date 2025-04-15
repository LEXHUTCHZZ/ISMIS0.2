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
    let isMounted = true;

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!isMounted) return;

        try {
          if (user) {
            // Get user document
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData && userData.role) {
                setUser(user);
                setRole(userData.role);
              } else {
                console.error('Invalid user data structure');
                setUser(null);
                setRole(null);
              }
            } else {
              console.error('User document does not exist');
              setUser(null);
              setRole(null);
            }
          } else {
            setUser(null);
            setRole(null);
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
          setUser(null);
          setRole(null);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      },
      (error) => {
        if (isMounted) {
          console.error('Auth state change error:', error);
          setUser(null);
          setRole(null);
          setLoading(false);
        }
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