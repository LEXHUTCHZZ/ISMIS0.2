"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";

export default function Clearance() {
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
          if (["admin", "accountsadmin"].includes(userData.role)) {
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

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(userRole)) return;
    const studentDoc = doc(db, "students", studentId);
    await updateDoc(studentDoc, { clearance: true });
    setAllStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
    );
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(userRole)) return;
    const studentDoc = doc(db, "students", studentId);
    await updateDoc(studentDoc, { clearance: false });
    setAllStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
    );
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
          {["admin", "accountsadmin"].includes(userRole) && (
            <>
              <li style={{ marginBottom: "0.5rem" }}>
                <button
                  onClick={() => setIsManagementOpen(!isManagementOpen)}
                  style={{ color: "#7F1D1D", fontWeight: "500", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%" }}
                >
                  <span>Management</span>
                  <span>{isManagementOpen ? "▲" : "▼"}</span>
                </button>
                {isManagementOpen && (
                  <ul style={{ listStyle: "none", paddingLeft: "1rem", marginTop: "0.25rem" }}>
                    <li><Link href="/dashboard/management/clearance" style={{ color: "#7F1D1D", textDecoration: "none" }}>Clearance</Link></li>
                    <li><Link href="/dashboard/management/reports" style={{ color: "#7F1D1D", textDecoration: "none" }}>Reports</Link></li>
                  </ul>
                )}
              </li>
            </>
          )}
        </ul>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "2rem" }}>
        <div style={{ maxWidth: "64rem", margin: "0 auto", backgroundColor: "#FFFFFF", padding: "2rem", borderRadius: "0.5rem", boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)", border: "1px solid #7F1D1D" }}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#7F1D1D", marginBottom: "1.5rem" }}>
            Clearance Management, {username}
          </h2>
          {allStudents.length > 0 ? (
            allStudents.map((s) => (
              <div key={s.id} style={{ marginBottom: "1.5rem", border: "1px solid #7F1D1D", padding: "1rem", borderRadius: "4px" }}>
                <p style={{ fontSize: "1.125rem", fontWeight: "600", color: "#7F1D1D" }}>Student: {s.name}</p>
                <p style={{ color: "#7F1D1D", marginTop: "0.5rem" }}><strong>Balance:</strong> {s.balance?.toLocaleString() || "0"} JMD</p>
                <p style={{ color: "#7F1D1D" }}><strong>Clearance:</strong> {s.clearance ? "Granted" : "Not Granted"}</p>
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleGrantClearance(s.id)}
                    style={{ padding: "0.25rem 0.5rem", backgroundColor: "#7F1D1D", color: "#FFFFFF", borderRadius: "4px", border: "none", cursor: "pointer" }}
                    disabled={s.clearance}
                  >
                    Grant Clearance
                  </button>
                  <button
                    onClick={() => handleRemoveClearance(s.id)}
                    style={{ padding: "0.25rem 0.5rem", backgroundColor: "#7F1D1D", color: "#FFFFFF", borderRadius: "4px", border: "none", cursor: "pointer" }}
                    disabled={!s.clearance}
                  >
                    Remove Clearance
                  </button>
                </div>
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