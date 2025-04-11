"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { StudentData, User } from "../../models";

export default function Profile() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [profilePicture, setProfilePicture] = useState<string>("");
  const [idNumber, setIdNumber] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [homeAddress, setHomeAddress] = useState<string>("");
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Fetch user data
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const data = userDoc.exists() ? (userDoc.data() as User) : null;
        if (data) {
          setUserData(data);
          setUserRole(data.role);
          setProfilePicture(data.profilePicture || "");
        }

        // Fetch student-specific data if the user is a student
        if (data?.role === "student") {
          const studentDoc = await getDoc(doc(db, "students", currentUser.uid));
          const studentData = studentDoc.exists() ? (studentDoc.data() as StudentData) : null;
          if (studentData) {
            setStudentData(studentData);
            setIdNumber(studentData.idNumber || "");
            setPhoneNumber(studentData.phoneNumber || "");
            setHomeAddress(studentData.homeAddress || "");
            setProfilePicture(studentData.profilePicture || data.profilePicture || "");
          }
        }
      } else {
        router.push("/auth/login");
      }
    });
    return () => unsubscribe();
  }, [user, router]);

  const handleUpdateProfile = async () => {
    if (!user) return;

    try {
      // Update user data
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        profilePicture: profilePicture || null,
      });

      // Update student data if the user is a student
      if (userRole === "student") {
        const studentRef = doc(db, "students", user.uid);
        await updateDoc(studentRef, {
          idNumber: idNumber || null,
          phoneNumber: phoneNumber || null,
          homeAddress: homeAddress || null,
          profilePicture: profilePicture || null,
        });
      }

      alert("Profile updated successfully!");
    } catch (err: any) {
      console.error("Error updating profile:", err);
      alert("Failed to update profile: " + err.message);
    }
  };

  if (!userData) return <p className="text-red-800 text-center">Loading...</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li>
            <Link href="/dashboard" className="text-red-800 hover:underline">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/profile" className="text-red-800 hover:underline">
              Profile
            </Link>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-6">Profile</h2>
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-red-800 font-medium mb-1">Name</label>
                <p className="text-red-800">{userData.name || "Unnamed"}</p>
              </div>
              <div>
                <label className="block text-red-800 font-medium mb-1">Email</label>
                <p className="text-red-800">{userData.email || "N/A"}</p>
              </div>
              <div>
                <label className="block text-red-800 font-medium mb-1">Role</label>
                <p className="text-red-800">{userData.role || "N/A"}</p>
              </div>
            </div>

            {/* Profile Picture Upload */}
            <div>
              <label className="block text-red-800 font-medium mb-1">Profile Picture URL</label>
              <input
                type="text"
                placeholder="Enter profile picture URL"
                value={profilePicture}
                onChange={(e) => setProfilePicture(e.target.value)}
                className="w-full p-2 border rounded text-red-800"
              />
              {profilePicture && (
                <div className="mt-2">
                  <img
                    src={profilePicture}
                    alt="Profile Preview"
                    className="w-24 h-24 rounded-full object-cover"
                    onError={(e) => (e.currentTarget.src = "/default-profile.png")} // Fallback image
                  />
                </div>
              )}
            </div>

            {/* Student-Specific Fields */}
            {userRole === "student" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-red-800 font-medium mb-1">ID Number</label>
                  <input
                    type="text"
                    placeholder="Enter your ID number"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    className="w-full p-2 border rounded text-red-800"
                  />
                </div>
                <div>
                  <label className="block text-red-800 font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="Enter your phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full p-2 border rounded text-red-800"
                  />
                </div>
                <div>
                  <label className="block text-red-800 font-medium mb-1">Home Address</label>
                  <textarea
                    placeholder="Enter your home address"
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    className="w-full p-2 border rounded text-red-800"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleUpdateProfile}
              className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
            >
              Save Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}