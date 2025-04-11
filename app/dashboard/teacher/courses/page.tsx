// app/dashboard/teacher/courses/page.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, doc, getDoc } from "firebase/firestore"; // Updated imports
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";
import { Course } from "../../../../models";

export default function TeacherCourses() {
  const [userData, setUserData] = useState<any>(undefined);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      const userDocRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userDocRef);
      const fetchedUserData = userSnap.exists() ? userSnap.data() : null;

      if (!fetchedUserData || fetchedUserData.role !== "teacher") {
        router.push("/dashboard");
        return;
      }

      setRole(fetchedUserData.role || "");
      setUsername(fetchedUserData.name || "Unnamed");
      setUserData(fetchedUserData);
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Night");

      const coursesSnapshot = await getDocs(collection(db, "courses"));
      const coursesList = coursesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Course[];
      setAllCourses(coursesList);
    });

    return () => unsubscribe();
  }, [user, router]);

  if (userData === undefined) return <p className="text-red-800 text-center">Loading...</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
          <li><Link href="/dashboard/courses" className="text-red-800 hover:underline">Courses</Link></li>
          <li><Link href="/dashboard/teacher/courses" className="text-red-800 hover:underline font-bold">Teacher Courses</Link></li>
          <li><Link href="/dashboard/teacher/studnage" className="text-red-800 hover:underline">Student Management</Link></li>
        </ul>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-6">{greeting}, {username}</h2>
          <h3 className="text-xl font-semibold text-red-800 mb-4">Teacher Courses</h3>
          <div className="space-y-6">
            {allCourses.length ? (
              allCourses.map((course) => (
                <div key={course.id} className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-lg font-medium text-red-800">{course.name}</p>
                  <p className="text-red-800">Fee: {course.fee?.toLocaleString() || "0"} JMD</p>
                  <p className="text-red-800">Subjects: {(course.subjects || []).map(s => s.name).join(", ") || "None"}</p>
                </div>
              ))
            ) : (
              <p className="text-red-800">No courses available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}