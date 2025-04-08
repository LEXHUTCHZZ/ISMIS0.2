"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";

export default function CourseDetails() {
  const [student, setStudent] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [isCoursesOpen, setIsCoursesOpen] = useState(false);
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const userData = userDoc.data();
        if (userData) {
          setUserRole(userData.role);
          setUsername(userData.name || "Unnamed");
          if (userData.role === "student") {
            const studentDoc = doc(db, "students", currentUser.uid);
            const studentSnap = await getDoc(studentDoc);
            const studentData = studentSnap.data();
            setStudent(studentData);
          } else {
            router.push("/dashboard");
          }
        }
      } else {
        router.push("/auth/login");
      }
    });
    return () => unsubscribe();
  }, [user, router]);

  if (!userRole) return <p style={{ textAlign: "center", color: "#7F1D1D" }}>Loading...</p>;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", display: "flex" }}>
      {/* Sidebar */}
      <div style={{ width: "250px", backgroundColor: "#f0f0f0", padding: "1rem", borderRight: "1px solid #7F1D1D" }}>
        <h3 style={{ color: "#7F1D1D", fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem" }}>ISMIS Menu</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/dashboard" style={{ color: "#7F1D1D", textDecoration: "none", fontWeight: "500" }}>Dashboard</Link>
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/profile" style={{ color: "#7F1D1D", textDecoration: "none", fontWeight: "500" }}>Profile</Link>
          </li>
          {userRole === "student" && (
            <>
              <li style={{ marginBottom: "0.5rem" }}>
                <button
                  onClick={() => setIsCoursesOpen(!isCoursesOpen)}
                  style={{ color: "#7F1D1D", fontWeight: "500", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%" }}
                >
                  <span>Courses</span>
                  <span>{isCoursesOpen ? "▲" : "▼"}</span>
                </button>
                {isCoursesOpen && (
                  <ul style={{ listStyle: "none", paddingLeft: "1rem", marginTop: "0.25rem" }}>
                    <li><Link href="/dashboard/courses/grades" style={{ color: "#7F1D1D", textDecoration: "none" }}>View Grades</Link></li>
                    <li><Link href="/dashboard/courses/details" style={{ color: "#7F1D1D", textDecoration: "none" }}>Course Details</Link></li>
                  </ul>
                )}
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <Link href="/dashboard/payments" style={{ color: "#7F1D1D", textDecoration: "none", fontWeight: "500" }}>Payments</Link>
              </li>
            </>
          )}
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/auth/logout" style={{ color: "#7F1D1D", textDecoration: "none", fontWeight: "500" }}>Logout</Link>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "2rem" }}>
        <div style={{ maxWidth: "64rem", margin: "0 auto", backgroundColor: "#FFFFFF", padding: "2rem", borderRadius: "0.5rem", boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)", border: "1px solid #7F1D1D" }}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#7F1D1D", marginBottom: "1.5rem" }}>
            Course Details, {username}
          </h2>
          {!student ? (
            <p style={{ textAlign: "center", color: "#7F1D1D" }}>Loading course details...</p>
          ) : (
            <div>
              {student.courses?.length > 0 ? (
                student.courses.map((c: any) => (
                  <div key={c.name} style={{ marginBottom: "1.5rem", border: "1px solid #7F1D1D", padding: "1rem", borderRadius: "4px" }}>
                    <p style={{ fontSize: "1.125rem", fontWeight: "600", color: "#7F1D1D" }}>Course: {c.name}</p>
                    <p style={{ color: "#7F1D1D", marginTop: "0.5rem" }}><strong>Fee:</strong> {c.fee.toLocaleString()} JMD</p>
                    <p style={{ color: "#7F1D1D" }}><strong>Subjects:</strong> {c.subjects?.map((s: any) => s.name).join(", ") || "None"}</p>
                  </div>
                ))
              ) : (
                <p style={{ color: "#7F1D1D" }}>No courses enrolled.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}