"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { Course, StudentData } from "../../../types";

export default function CoursesPage() {
  const [userData, setUserData] = useState<any>(undefined);
  const [studentData, setStudentData] = useState<StudentData | undefined>(undefined);
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

      // Fetch user data
      const userDocRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userDocRef);
      const fetchedUserData = userSnap.exists() ? userSnap.data() : null;

      if (!fetchedUserData) {
        setUserData(undefined);
        return;
      }

      setRole(fetchedUserData.role || "");
      setUsername(fetchedUserData.name || "Unnamed");
      setUserData(fetchedUserData);
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Night");

      // Fetch student data if student
      if (fetchedUserData.role === "student") {
        const studentDocRef = doc(db, "students", currentUser.uid);
        const studentSnap = await getDoc(studentDocRef);
        const fetchedStudentData = studentSnap.exists() ? studentSnap.data() : null;

        if (fetchedStudentData) {
          setStudentData(fetchedStudentData as StudentData);
        }
      }

      // Fetch all courses
      const coursesSnapshot = await getDocs(collection(db, "courses"));
      const coursesList = coursesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Course[];
      setAllCourses(coursesList);
    });

    return () => unsubscribe();
  }, [user, router]);

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || role !== "student") return;
    const updatedCourses = [...(studentData.courses || []), course];
    try {
      await updateDoc(doc(db, "students", user!.uid), { courses: updatedCourses });
      setStudentData({ ...studentData, courses: updatedCourses });
      alert("Enrolled successfully!");
    } catch (err: any) {
      alert("Failed to enroll: " + err.message);
    }
  };

  if (userData === undefined) return <p className="text-red-800 text-center">User data not found. Please log in again.</p>;
  if (!role) return null;

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
          <li><Link href="/dashboard/courses" className="text-red-800 hover:underline font-bold">Courses</Link></li>
          {role === "teacher" && <li><Link href="/dashboard/students" className="text-red-800 hover:underline">Students</Link></li>}
          {role === "admin" && <li><Link href="/dashboard/management" className="text-red-800 hover:underline">Management</Link></li>}
          {role === "accountsadmin" && <li><Link href="/dashboard/payments" className="text-red-800 hover:underline">Payments</Link></li>}
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-6">{greeting}, {username}</h2>
          <h3 className="text-xl font-semibold text-red-800 mb-4">Courses</h3>

          {/* Courses List */}
          <div className="space-y-6">
            {allCourses.length ? (
              allCourses.map((course) => (
                <div key={course.id} className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-lg font-medium text-red-800">{course.name}</p>
                  <p className="text-red-800">Fee: {course.fee?.toLocaleString() || "0"} JMD</p>
                  <p className="text-red-800">Subjects: {(course.subjects || []).map(s => s.name).join(", ") || "None"}</p>
                  {role === "student" && (
                    <button
                      onClick={() => handleEnrollCourse(course)}
                      disabled={studentData?.courses?.some(c => c.name === course.name)}
                      className={`mt-2 px-4 py-2 rounded-md text-white ${
                        studentData?.courses?.some(c => c.name === course.name)
                          ? "bg-gray-400"
                          : "bg-red-800 hover:bg-red-700"
                      }`}
                    >
                      {studentData?.courses?.some(c => c.name === course.name) ? "Enrolled" : "Enroll"}
                    </button>
                  )}
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