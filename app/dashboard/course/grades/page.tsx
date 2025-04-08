"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";

export default function CourseGrades() {
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
            router.push("/dashboard"); // Redirect non-students
          }
        }
      } else {
        router.push("/auth/login");
      }
    });
    return () => unsubscribe();
  }, [user, router]);

  const calculateCourseAverage = (subjects: any[]) => {
    const validGrades = (subjects || [])
      .map((s) => parseFloat(s.grades?.final || "0"))
      .filter((g) => !isNaN(g));
    return validGrades.length > 0 ? (validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length).toFixed(2) : "N/A";
  };

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
            Your Grades, {username}
          </h2>
          {!student ? (
            <p style={{ textAlign: "center", color: "#7F1D1D" }}>Loading grades...</p>
          ) : (
            <div>
              {student.courses?.length > 0 ? (
                student.courses.map((c: any) => (
                  <div key={c.name} style={{ marginBottom: "1.5rem", border: "1px solid #7F1D1D", padding: "1rem", borderRadius: "4px" }}>
                    <p style={{ fontSize: "1.125rem", fontWeight: "600", color: "#7F1D1D" }}>Course: {c.name}</p>
                    {c.subjects?.map((s: any) => (
                      <div key={s.name} style={{ marginTop: "0.5rem", marginLeft: "1rem" }}>
                        <p style={{ color: "#7F1D1D" }}>{s.name}</p>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <input
                            type="text"
                            value={s.grades?.C1 || ""}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", width: "4rem", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                            placeholder="C1"
                          />
                          <input
                            type="text"
                            value={s.grades?.C2 || ""}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", width: "4rem", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                            placeholder="C2"
                          />
                          <input
                            type="text"
                            value={s.grades?.exam || ""}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", width: "4rem", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                            placeholder="Exam"
                          />
                          <input
                            type="text"
                            value={s.grades?.final || ""}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", width: "4rem", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                            placeholder="Final"
                          />
                          <input
                            type="text"
                            value={s.grades?.status || "Pending"}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                          />
                        </div>
                      </div>
                    ))}
                    <p style={{ marginTop: "0.5rem", color: "#7F1D1D" }}>Course Average: {calculateCourseAverage(c.subjects)}</p>
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