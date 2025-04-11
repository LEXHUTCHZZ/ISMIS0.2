"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { StudentData, Course, Subject, Transaction, Notification } from "../../types"; // Adjusted path
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

export default function Dashboard() {
  const [userData, setUserData] = useState<any>(undefined);
  const [studentData, setStudentData] = useState<StudentData | undefined>(undefined);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
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

      // Fetch student data
      if (fetchedUserData.role === "student") {
        const studentDocRef = doc(db, "students", currentUser.uid);
        const studentSnap = await getDoc(studentDocRef);
        const fetchedStudentData = studentSnap.exists() ? studentSnap.data() : null;

        if (fetchedStudentData) {
          const transactionsRef = collection(studentDocRef, "transactions");
          const transactionsSnap = await getDocs(transactionsRef);
          const transactions = transactionsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Transaction[];

          const notificationsRef = collection(studentDocRef, "notifications");
          const notificationsSnap = await getDocs(notificationsRef);
          const notifications = notificationsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Notification[];

          setStudentData({ ...fetchedStudentData, transactions, notifications } as StudentData);
        } else {
          setStudentData(undefined);
        }
      }

      // Fetch all students and courses for teacher/admin/accountsadmin
      if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role)) {
        const studentsSnapshot = await getDocs(collection(db, "students"));
        const studentsList = await Promise.all(
          studentsSnapshot.docs.map(async (studentDoc) => {
            const studentData = studentDoc.data();
            const transactionsRef = collection(studentDoc.ref, "transactions");
            const transactionsSnap = await getDocs(transactionsRef);
            const transactions = transactionsSnap.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Transaction[];
            return { id: studentDoc.id, ...studentData, transactions } as StudentData;
          })
        );
        setAllStudents(studentsList);

        const coursesSnapshot = await getDocs(collection(db, "courses"));
        const coursesList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        setAllCourses(coursesList);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  const calculateCourseAverage = (subjects: Subject[]) => {
    const validGrades = (subjects || []).map((s) => parseFloat(s.grades?.final || "0")).filter((g) => !isNaN(g));
    return validGrades.length ? (validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length).toFixed(2) : "N/A";
  };

  const handleGradeUpdate = (studentId: string, courseName: string, subjectName: string, field: string, value: string) => {
    if (role !== "teacher" && role !== "admin") return;

    setAllStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          const updatedCourses = s.courses.map((c: Course) => {
            if (c.name === courseName) {
              const updatedSubjects = c.subjects.map((sub: Subject) => {
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

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s)));
      alert("Clearance granted!");
    } catch (err: any) {
      alert("Failed to grant clearance: " + err.message);
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s)));
      alert("Clearance removed!");
    } catch (err: any) {
      alert("Failed to remove clearance: " + err.message);
    }
  };

  const handlePaymentSuccess = () => {
    window.location.reload();
  };

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData) return;
    const updatedCourses = [...(studentData.courses || []), course];
    try {
      await updateDoc(doc(db, "students", user!.uid), { courses: updatedCourses });
      setStudentData({ ...studentData, courses: updatedCourses });
      alert("Enrolled successfully!");
    } catch (err: any) {
      alert("Failed to enroll: " + err.message);
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    if (role !== "teacher" && role !== "admin") return;
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return;

    const updatedCourses = studentToUpdate.courses.map((c: Course) => {
      if (c.name === courseName) {
        return { ...c, subjects: [...c.subjects, { name: subjectName, grades: {} }] };
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

  const handleAddCourse = async (courseName: string, fee: number) => {
    if (role !== "admin") return;
    try {
      const courseRef = doc(collection(db, "courses"));
      const newCourse = { name: courseName, fee, subjects: [] };
      await setDoc(courseRef, newCourse);
      setAllCourses([...allCourses, { ...newCourse, id: courseRef.id }]);
      alert("Course added!");
    } catch (err: any) {
      alert("Failed to add course: " + err.message);
    }
  };

  const handleAddStudent = async (name: string, email: string) => {
    if (role !== "admin") return;
    try {
      const studentRef = doc(collection(db, "students"));
      const newStudent = {
        name,
        email,
        courses: [],
        totalOwed: 0,
        totalPaid: 0,
        balance: 0,
        paymentStatus: "Unpaid",
        clearance: false,
        transactions: [],
        notifications: [],
      };
      await setDoc(studentRef, newStudent);
      setAllStudents([...allStudents, { ...newStudent, id: studentRef.id }]);
      alert("Student added!");
    } catch (err: any) {
      alert("Failed to add student: " + err.message);
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (role !== "admin") return;
    try {
      const notificationRef = collection(db, "students", studentId, "notifications");
      const newNotification = {
        message,
        date: new Date().toISOString(),
        read: false,
      };
      await addDoc(notificationRef, newNotification);
      alert("Notification sent!");
    } catch (err: any) {
      alert("Failed to send notification: " + err.message);
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Financial Report", 20, 20);

    const data = allStudents.map((s) => [
      s.name || "N/A",
      s.totalOwed?.toLocaleString() || "0",
      s.totalPaid?.toLocaleString() || "0",
      s.balance?.toLocaleString() || "0",
      s.paymentStatus || "N/A",
    ]);

    autoTable(doc, {
      head: [["Name", "Total Owed", "Total Paid", "Balance", "Status"]],
      body: data,
      startY: 30,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [127, 29, 29] },
    });

    doc.save("Financial_Report.pdf");
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
          <li><Link href="/dashboard/courses" className="text-red-800 hover:underline">Courses</Link></li>
          {role === "teacher" && <li><Link href="/dashboard/students" className="text-red-800 hover:underline">Students</Link></li>}
          {role === "admin" && <li><Link href="/dashboard/management" className="text-red-800 hover:underline">Management</Link></li>}
          {role === "accountsadmin" && <li><Link href="/dashboard/payments" className="text-red-800 hover:underline">Payments</Link></li>}
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-6">{greeting}, {username}</h2>

          {/* Student Dashboard */}
          {role === "student" && (
            <div className="space-y-6">
              {studentData === undefined ? (
                <p className="text-red-800 text-center">No student profile found. Contact support to set up your account.</p>
              ) : (
                <>
                  {/* Notifications */}
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Notifications</h3>
                    {(studentData.notifications || []).length ? (
                      studentData.notifications.map((notif) => (
                        <div key={notif.id} className="flex justify-between items-center mb-2">
                          <p className={`text-red-800 ${notif.read ? "opacity-50" : "font-bold"}`}>
                            {new Date(notif.date).toLocaleString()}: {notif.message}
                          </p>
                          {!notif.read && (
                            <button
                              onClick={async () => {
                                await markNotificationAsRead(user!.uid, notif.id);
                                setStudentData({
                                  ...studentData,
                                  notifications: studentData.notifications.map((n) =>
                                    n.id === notif.id ? { ...n, read: true } : n
                                  ),
                                });
                              }}
                              className="text-red-800 hover:underline"
                            >
                              Mark as Read
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-red-800">No notifications.</p>
                    )}
                  </div>

                  {/* Grades */}
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Your Grades</h3>
                    {(studentData.courses || []).map((c: Course) => (
                      <div key={c.name} className="mb-4">
                        <p className="text-red-800 font-medium">{c.name} (Fee: {c.fee?.toLocaleString() || "0"} JMD)</p>
                        <table className="w-full mt-2 border-collapse">
                          <thead>
                            <tr className="bg-red-800 text-white">
                              <th className="p-2 border">Subject</th>
                              <th className="p-2 border">Classwork</th>
                              <th className="p-2 border">Exam</th>
                              <th className="p-2 border">Final</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.subjects || []).map((sub: Subject) => (
                              <tr key={sub.name}>
                                <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
                                <td className="p-2 border text-red-800">
                                  {Object.keys(sub.grades || {}).filter((k) => k.startsWith("C")).map((k) => sub.grades[k] || "N/A").join(", ")}
                                </td>
                                <td className="p-2 border text-red-800">{sub.grades?.exam || "N/A"}</td>
                                <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-red-800">Average: {calculateCourseAverage(c.subjects)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Payments */}
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Payments</h3>
                    <p className="text-red-800">Balance: {studentData?.balance?.toLocaleString() || "0"} JMD</p>
                    <p className="text-red-800">Status: {studentData?.paymentStatus || "N/A"}</p>
                    <p className="text-red-800">Clearance: {studentData?.clearance ? "Yes" : "No"}</p>
                    <div className="mt-2">
                      <h4 className="text-red-800 font-medium">Transaction History</h4>
                      {(studentData.transactions || []).map((txn) => (
                        <p key={txn.id} className="text-red-800">
                          {new Date(txn.date).toLocaleString()}: {txn.amount.toLocaleString()} JMD - {txn.status}
                        </p>
                      ))}
                    </div>
                    <CheckoutPage onPaymentSuccess={handlePaymentSuccess} />
                  </div>

                  {/* Course Enrollment */}
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Enroll in Courses</h3>
                    {allCourses.length ? (
                      allCourses.map((course) => (
                        <div key={course.id} className="mb-2">
                          <p className="text-red-800">{course.name} (Fee: {course.fee.toLocaleString()} JMD)</p>
                          <button
                            onClick={() => handleEnrollCourse(course)}
                            className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                          >
                            Enroll
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-red-800">No courses available.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Teacher Dashboard */}
          {role === "teacher" && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-red-800 mb-4">Manage Student Grades</h3>
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
                <p className="text-red-800">No students assigned.</p>
              )}
            </div>
          )}

          {/* Admin Dashboard */}
          {role === "admin" && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-red-800 mb-4">Admin Dashboard</h3>

              {/* Analytics */}
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Analytics</h4>
                <p className="text-red-800">Total Students: {allStudents.length}</p>
                <p className="text-red-800">Total Courses: {allCourses.length}</p>
                <p className="text-red-800">
                  Total Revenue: {allStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toLocaleString()} JMD
                </p>
              </div>

              {/* Add New Student */}
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Add New Student</h4>
                <input
                  type="text"
                  placeholder="Student Name"
                  id="new-student-name"
                  className="p-2 border rounded text-red-800 mr-2"
                />
                <input
                  type="email"
                  placeholder="Student Email"
                  id="new-student-email"
                  className="p-2 border rounded text-red-800 mr-2"
                />
                <button
                  onClick={() => {
                    const name = (document.getElementById("new-student-name") as HTMLInputElement).value;
                    const email = (document.getElementById("new-student-email") as HTMLInputElement).value;
                    handleAddStudent(name, email);
                  }}
                  className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                >
                  Add Student
                </button>
              </div>

              {/* Add New Course */}
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Add New Course</h4>
                <input
                  type="text"
                  placeholder="Course Name"
                  id="new-course-name"
                  className="p-2 border rounded text-red-800 mr-2"
                />
                <input
                  type="number"
                  placeholder="Fee (JMD)"
                  id="new-course-fee"
                  className="p-2 border rounded text-red-800 mr-2"
                />
                <button
                  onClick={() => {
                    const name = (document.getElementById("new-course-name") as HTMLInputElement).value;
                    const fee = parseFloat((document.getElementById("new-course-fee") as HTMLInputElement).value);
                    handleAddCourse(name, fee);
                  }}
                  className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                >
                  Add Course
                </button>
              </div>

              {/* Manage Students */}
              {allStudents.length ? (
                allStudents.map((s) => (
                  <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                    <p className="text-red-800">Balance: {s.balance?.toLocaleString() || "0"} JMD</p>
                    <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>

                    {/* Grades Management */}
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

                    {/* Send Notification */}
                    <div className="mt-2">
                      <input
                        type="text"
                        placeholder="Send notification"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSendNotification(s.id, e.currentTarget.value);
                            e.currentTarget.value = "";
                          }
                        }}
                        className="p-2 border rounded text-red-800 mr-2"
                      />
                    </div>

                    {/* Clearance */}
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={() => handleGrantClearance(s.id)}
                        disabled={s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Grant Clearance
                      </button>
                      <button
                        onClick={() => handleRemoveClearance(s.id)}
                        disabled={!s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${!s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Remove Clearance
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-red-800">No students found.</p>
              )}
            </div>
          )}

          {/* Accounts Admin Dashboard */}
          {role === "accountsadmin" && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-red-800 mb-4">Accounts Admin Dashboard</h3>
              <button
                onClick={downloadFinancialReport}
                className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 mb-4"
              >
                Download Financial Report
              </button>
              {allStudents.length ? (
                allStudents.map((s) => (
                  <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                    <p className="text-red-800">Total Owed: {s.totalOwed?.toLocaleString() || "0"} JMD</p>
                    <p className="text-red-800">Total Paid: {s.totalPaid?.toLocaleString() || "0"} JMD</p>
                    <p className="text-red-800">Balance: {s.balance?.toLocaleString() || "0"} JMD</p>
                    <p className="text-red-800">Status: {s.paymentStatus || "N/A"}</p>
                    <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                    <div className="mt-2">
                      <h4 className="text-red-800 font-medium">Transactions</h4>
                      {(s.transactions || []).map((txn: Transaction) => (
                        <p key={txn.id} className="text-red-800">
                          {new Date(txn.date).toLocaleString()}: {txn.amount.toLocaleString()} JMD - {txn.status}
                        </p>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={() => handleGrantClearance(s.id)}
                        disabled={s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Grant Clearance
                      </button>
                      <button
                        onClick={() => handleRemoveClearance(s.id)}
                        disabled={!s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${!s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Remove Clearance
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-red-800">No students found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}