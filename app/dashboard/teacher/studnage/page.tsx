// app/dashboard/teacher/studnage/page.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../contexts/AuthContext";
import { StudentData, Course, Subject } from "../../../../models";

export default function StudentManagement() {
  const [userData, setUserData] = useState<any>(undefined);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
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

      const studentsSnapshot = await getDocs(collection(db, "students"));
      const studentsList = await Promise.all(
        studentsSnapshot.docs.map(async (studentDoc) => {
          const studentData = studentDoc.data();
          return { id: studentDoc.id, ...studentData } as StudentData;
        })
      );
      setAllStudents(studentsList);
    });

    return () => unsubscribe();
  }, [user, router]);

  const handleGradeUpdate = (studentId: string, courseName: string, subjectName: string, field: string, value: string) => {
    setAllStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          const updatedCourses = s.courses.map((c: Course) => {
            if (c.name === courseName) {
              const updatedSubjects = (c.subjects || []).map((sub: Subject) => {
                if (sub.name === subjectName) {
                  const updatedGrades = { ...sub.grades, [field]: value };
                  const classworkKeys = Object.keys(updatedGrades).filter((k) => k.startsWith("C"));
                  const classworkValues = classworkKeys.map((k) => parseFloat(updatedGrades[k] || "0")).filter((v) => !isNaN(v));
                  const exam = parseFloat(updatedGrades.exam || "0");
                  if (classworkValues.length && !isNaN(exam)) {
                    const classworkAvg = classworkValues.reduce((sum, v) => sum + v, 0) / classworkValues.length;
                    updatedGrades.final = (classworkAvg * 0.4 + exam * 0.6).toFixed(2);
                  }
                  return { ...sub, grades: updatedGrades };
                }
                return sub;
              });
              return { ...c, subjects: updatedSubjects };
            }
            return c;
          });
          return { ...s, courses: updatedCourses };
        }
        return s;
      })
    );
  };

  const handleUpdateStudent = async (studentId: string) => {
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return;

    try {
      await updateDoc(doc(db, "students", studentId), { courses: studentToUpdate.courses });
      alert("Grades updated successfully!");
    } catch (err: any) {
      alert("Failed to update grades: " + err.message);
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return;

    const updatedCourses = studentToUpdate.courses.map((c: Course) => {
      if (c.name === courseName) {
        return { ...c, subjects: [...(c.subjects || []), { name: subjectName, grades: {} }] };
      }
      return c;
    });

    try {
      await updateDoc(doc(db, "students", studentId), { courses: updatedCourses });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, courses: updatedCourses } : s)));
      alert("Subject added!");
    } catch (err: any) {
      alert("Failed to add subject: " + err.message);
    }
  };

  if (userData === undefined) return <p className="text-red-800 text-center">Loading...</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
          <li><Link href="/dashboard/courses" className="text-red-800 hover:underline">Courses</Link></li>
          <li><Link href="/dashboard/teacher/courses" className="text-red-800 hover:underline">Teacher Courses</Link></li>
          <li><Link href="/dashboard/teacher/studnage" className="text-red-800 hover:underline font-bold">Student Management</Link></li>
        </ul>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-6">{greeting}, {username}</h2>
          <h3 className="text-xl font-semibold text-red-800 mb-4">Student Management</h3>
          <div className="space-y-6">
            {allStudents.length ? (
              allStudents.map((s) => (
                <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                  {(s.courses || []).map((c: Course) => (
                    <div key={c.name} className="mb-4">
                      <p className="text-red-800 font-medium">{c.name}</p>
                      <table className="w-full mt-2 border-collapse">
                        <thead>
                          <tr className="bg-red-800 text-white">
                            <th className="p-2 border">Subject</th>
                            <th className="p-2 border">C1</th>
                            <th className="p-2 border">C2</th>
                            <th className="p-2 border">Exam</th>
                            <th className="p-2 border">Final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.subjects || []).map((sub: Subject) => (
                            <tr key={sub.name}>
                              <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
                              <td className="p-2 border">
                                <input
                                  type="number"
                                  value={sub.grades?.C1 || ""}
                                  onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)}
                                  className="w-full p-1 border rounded text-red-800"
                                  min="0"
                                  max="100"
                                />
                              </td>
                              <td className="p-2 border">
                                <input
                                  type="number"
                                  value={sub.grades?.C2 || ""}
                                  onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)}
                                  className="w-full p-1 border rounded text-red-800"
                                  min="0"
                                  max="100"
                                />
                              </td>
                              <td className="p-2 border">
                                <input
                                  type="number"
                                  value={sub.grades?.exam || ""}
                                  onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)}
                                  className="w-full p-1 border rounded text-red-800"
                                  min="0"
                                  max="100"
                                />
                              </td>
                              <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2">
                        <input
                          type="text"
                          placeholder="Add new subject"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleAddSubject(s.id, c.name, e.currentTarget.value);
                              e.currentTarget.value = "";
                            }
                          }}
                          className="p-2 border rounded text-red-800"
                        />
                      </div>
                      <button
                        onClick={() => handleUpdateStudent(s.id)}
                        className="mt-2 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                      >
                        Save Grades
                      </button>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-red-800">No students found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}