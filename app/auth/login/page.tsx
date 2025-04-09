"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Define the UserData interface for type safety
interface UserData {
  name: string;
  role: "student" | "teacher" | "admin" | "accountsadmin";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "admin" | "accountsadmin">("student");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const router = useRouter();

  // Show the login form and remove the video after exactly 60 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowVideo(false);
      setShowForm(true);
    }, 60000); // Updated to 60 seconds

    return () => clearTimeout(timeout);
  }, []);

  const handleSkip = () => {
    setShowVideo(false);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError("Username is required");
      return;
    }

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password); // Fixed: Use modular Firebase SDK
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data() as UserData | undefined;

      if (!userDoc.exists() || userData?.name !== username || userData?.role !== role) {
        setError("Username or role does not match registered data");
        return;
      }

      router.push("/dashboard"); // Fixed: Use router.push instead of window.location.href
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-gray-900 to-black">
      {showVideo && (
        <video
          autoPlay
          loop={false}
          className="absolute inset-0 w-full h-full object-cover z-0"
          src="/background-video.mp4"
        />
      )}
      {!showForm && (
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 bg-red-800 text-white px-4 py-2 rounded-lg z-20 hover:bg-red-700 transition-colors"
        >
          Skip
        </button>
      )}
      <div
        className={`p-10 rounded-xl shadow-xl max-w-md w-full relative z-10 transition-all duration-700 transform backdrop-blur-md bg-black bg-opacity-30 ${
          showForm
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-10 pointer-events-none"
        }`}
      >
        <h2 className="text-4xl font-extrabold text-white mb-6 text-center">Login</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
          />
          <div>
            <p className="text-white font-semibold mb-2">Select Role:</p>
            {["student", "teacher", "admin", "accountsadmin"].map((r) => (
              <label key={r} className="flex items-center space-x-2 text-white">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r as "student" | "teacher" | "admin" | "accountsadmin")}
                />
                <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="w-full bg-red-800 text-white p-3 rounded-lg hover:bg-red-700 transition-colors font-semibold"
          >
            Login
          </button>
        </form>
        {error && <p className="text-red-400 mt-4 text-center font-medium">{error}</p>}
        <p className="text-white mt-4 text-center">
          If you don’t have an account,{" "}
          <Link href="/auth/register" className="text-red-400 hover:underline font-semibold">
            register here
          </Link>.
        </p>
      </div>
    </div>
  );
}