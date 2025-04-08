"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";

export default function StudentReports() {
  const [allStudents, setAllStudents] = useState<any[]>([]);
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
          if (userData.role === "teacher") {
            const studentsSnapshot = await getDocs(collection(db, "students"));
            const studentsList = studentsSnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            setAllStudents(studentsList);
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
          {userRole === "teacher" && (
            <>
              <li style={{ marginBottom: "0.5rem" }}>
                <button
                  onClick={() => setIsStudentsOpen(!isStudentsOpen)}
                  style={{ color: "#7F1D1D", fontWeight: "500", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%" }}
                >
                  <span>Students</span>
                  <span>{isStudentsOpen ? "▲" : "▼"}</span>
                </button>
                {isStudentsOpen && (
                  <ul style={{ listStyle: "none", paddingLeft: "1rem", marginTop: "0.25rem" }}>
                    <li><Link href="/dashboard/students/grades" style={{ color: "#7F1D1D", textDecoration: "none" }}>Manage Grades</Link></li>
                    <li><Link href="/dashboard/students/reports" style={{ color: "#7F1D1D", textDecoration: "none" }}>View Reports</Link></li>
                  </ul>
                )}
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
            Student Reports, {username}
          </h2>
          {allStudents.length > 0 ? (
            allStudents.map((s) => (
              <div key={s.id} style={{ marginBottom: "1.5rem", border: "1px solid #7F1D1D", padding: "1rem", borderRadius: "4px" }}>
                <p style={{ fontSize: "1.125rem", fontWeight: "600", color: "#7F1D1D" }}>Student: {s.name}</p>
                {s.courses?.map((c: any) => (
                  <div key={c.name} style={{ marginTop: "0.5rem" }}>
                    <p style={{ color: "#7F1D1D", fontWeight: "600" }}>{c.name}</p>
                    {c.subjects?.map((sub: any) => (
                      <div key={sub.name} style={{ marginLeft: "1rem" }}>
                        <p>{sub.name}</p>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <input
                            type="text"
                            value={sub.grades?.final || "N/A"}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", width: "4rem", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                            placeholder="Final"
                          />
                          <input
                            type="text"
                            value={sub.grades?.status || "Pending"}
                            style={{ border: "1px solid #7F1D1D", padding: "4px", borderRadius: "4px", color: "#7F1D1D", backgroundColor: "#E5E7EB" }}
                            readOnly
                          />
                        </div>
                      </div>
                    ))}
                    <p style={{ marginTop: "0.5rem", color: "#7F1D1D" }}>Course Average: {calculateCourseAverage(c.subjects)}</p>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p style={{ color: "#7F1D1D" }}>No students found.</p>
          )}
        </div>
      </div>
    </div>
  );
}