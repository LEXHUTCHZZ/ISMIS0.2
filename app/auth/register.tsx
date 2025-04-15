"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "admin" | "accountsadmin">("student");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    if (!email || !username || !password || !confirmPassword || !role) {
      setError("All fields are required");
      return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      // Create user with email and password
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // Create user document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        id: user.uid,
        email,
        name: username,
        role,
      });

      // Save user credentials if remember me is checked
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberedUsername', username);
      }

      alert("Registration Successful");
      // Use replace to prevent going back to register page
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-gray-900 to-black">
      <div className="p-10 rounded-xl shadow-xl max-w-md w-full relative z-10 backdrop-blur-md bg-black bg-opacity-30">
        <h2 className="text-4xl font-extrabold text-white mb-6 text-center">Register</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
            required
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
            required
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-3 border border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-red-800 bg-white bg-opacity-80 text-gray-900 placeholder-gray-500"
            required
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
                  required
                />
                <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
              </label>
            ))}
          </div>
          <label className="flex items-center space-x-2 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="form-checkbox h-4 w-4 text-red-800 rounded focus:ring-red-800"
            />
            <span>Remember me</span>
          </label>
          <button
            type="submit"
            className="w-full bg-red-800 text-white p-3 rounded-lg hover:bg-red-700 transition-colors font-semibold"
          >
            Register
          </button>
        </form>
        {error && <p className="text-red-400 mt-4 text-center font-medium">{error}</p>}
        <p className="text-white mt-4 text-center">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-red-400 hover:underline font-semibold">
            Login here
          </Link>.
        </p>
      </div>
    </div>
  );
}