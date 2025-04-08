"use client";

import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";

export default function Navbar() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/auth/login");
  };

  return (
    <nav className="bg-red-900 text-pink-200 p-4 flex justify-between">
      <div>
        <a href="/dashboard" className="text-lg font-bold">ISMIS</a>
      </div>
      <div>
        <button onClick={handleLogout} className="hover:underline">
          Logout
        </button>
      </div>
    </nav>
  );
}