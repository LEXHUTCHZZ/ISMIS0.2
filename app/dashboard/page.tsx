"use client";

import { useEffect, useState, useCallback } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { User, StudentData, Course, Resource, Test, TestResponse, Subject, Notification, TestCreation } from "../../models";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allLecturers, setAllLecturers] = useState<User[]>([]);
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [newResource, setNewResource] = useState<Resource>({ id: "", name: "", type: "", url: "", uploadDate: "", courseId: "" });
  const [newTest, setNewTest] = useState<TestCreation>({ id: "", courseId: "", title: "", questions: [{ question: "", options: [""], correctAnswer: "" }], createdAt: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return router.push("/auth/login");
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/auth/login");
      setLoading(true);
      try {
        const userDoc = doc(db, "users", currentUser.uid);
        onSnapshot(userDoc, async (snap) => {
          if (!snap.exists()) {
            setError("User not found");
            setLoading(false);
            return;
          }
          const data = snap.data() as User;
          setUserData(data);
          setRole(data.role);
          setUsername(data.name || "Unnamed");
          setGreeting(new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 18 ? "Good Afternoon" : "Good Night");

          if (["student", "teacher"].includes(data.role)) {
            const studentDoc = doc(db, "students", currentUser.uid);
            onSnapshot(studentDoc, (snap) => {
              setStudentData(snap.exists() ? { ...snap.data(), transactions: snap.data().transactions || [], notifications: snap.data().notifications || [] } as StudentData : null);
              setLoading(false);
            });
          } else {
            setStudentData(null);
            setLoading(false);
          }

          if (["teacher", "admin", "accountsadmin"].includes(data.role)) {
            const students = (await getDocs(collection(db, "students"))).docs.map((d) => ({ id: d.id, ...d.data(), transactions: d.data().transactions || [], notifications: d.data().notifications || [] } as StudentData));
            setAllStudents(students);
            if (data.role === "teacher" && students.length) setSelectedStudentId(students[0].id);

            const lecturers = (await getDocs(collection(db, "users"))).docs.map((d) => ({ id: d.id, ...d.data() } as User)).filter((u) => u.role === "teacher");
            setAllLecturers(lecturers);

            const courses = await Promise.all(
              (await getDocs(collection(db, "courses"))).docs.map(async (d) => {
                const course = d.data() as Omit<Course, "id" | "resources" | "tests">;
                const resources = (await getDocs(collection(db, "courses", d.id, "resources"))).docs.map((r) => ({ id: r.id, ...r.data() } as Resource));
                const tests = await Promise.all(
                  (await getDocs(collection(db, "courses", d.id, "tests"))).docs.map(async (t) => {
                    const test = { id: t.id, ...t.data() } as Test;
                    if (data.role === "student") {
                      const resp = await getDoc(doc(db, "courses", d.id, "tests", t.id, "responses", currentUser.uid));
                      if (resp.exists()) setTestResponses((prev) => ({ ...prev, [t.id]: resp.data() as TestResponse }));
                    }
                    return test;
                  })
                );
                return { id: d.id, ...course, resources, tests } as Course;
              })
            );
            setAllCourses(courses);
          }
        });
      } catch (e) {
        setError("Failed to load data");
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [user, router]);

  const calculateCourseAverage = (subjects: Subject[] = []): string => {
    const grades = subjects.map((s) => parseFloat(s.grades?.final || "0")).filter((g) => !isNaN(g));
    return grades.length ? (grades.reduce((sum, g) => sum + g, 0) / grades.length).toFixed(2) : "N/A";
  };

  const handleGradeUpdate = useCallback(
    (studentId: string, courseName: string, subjectName: string, field: string, value: string) => {
      if (!["teacher", "admin"].includes(role)) return;
      setAllStudents((prev) =>
        prev.map((s) => {
          if (s.id !== studentId) return s;
          const courses = s.courses.map((c) => {
            if (c.name !== courseName) return c;
            const subjects = c.subjects.map((sub) => {
              if (sub.name !== subjectName) return sub;
              if (field === "comments") return { ...sub, comments: value };
              const grades = { ...sub.grades, [field]: value };
              const classwork = Object.keys(grades)
                .filter((k) => k.startsWith("C"))
                .map((k) => parseFloat(grades[k] || "0"))
                .filter((v) => !isNaN(v));
              const exam = parseFloat(grades.exam || "0");
              if (classwork.length && !isNaN(exam)) grades.final = (classwork.reduce((sum, v) => sum + v, 0) / classwork.length * 0.4 + exam * 0.6).toFixed(2);
              return { ...sub, grades };
            });
            return { ...c, subjects };
          });
          return { ...s, courses };
        })
      );
    },
    [role]
  );

  const handleUpdateStudent = async (studentId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return alert("Student not found");
    try {
      await updateDoc(doc(db, "students", studentId), { courses: student.courses });
      alert("Grades updated");
    } catch {
      alert("Failed to update grades");
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s)));
      alert("Clearance granted");
    } catch {
      alert("Failed to grant clearance");
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s)));
      alert("Clearance removed");
    } catch {
      alert("Failed to remove clearance");
    }
  };

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || studentData.courses?.some((c) => c.name === course.name)) return alert("Already enrolled");
    const newCourse = { ...course, subjects: course.subjects?.map((s) => ({ name: s.name, grades: {}, comments: "" })) || [] };
    try {
      await updateDoc(doc(db, "students", user!.uid), { courses: [...(studentData.courses || []), newCourse] });
      setStudentData((prev) => prev && { ...prev, courses: [...(prev.courses || []), newCourse] });
      alert("Enrolled successfully");
    } catch {
      alert("Failed to enroll");
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    if (!["teacher", "admin"].includes(role)) return;
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;
    const courses = student.courses.map((c) => (c.name === courseName ? { ...c, subjects: [...(c.subjects || []), { name: subjectName, grades: {}, comments: "" }] } : c));
    try {
      await updateDoc(doc(db, "students", studentId), { courses });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, courses } : s)));
      alert("Subject added");
    } catch {
      alert("Failed to add subject");
    }
  };

  const handleAddCourse = async (name: string, fee: number) => {
    if (role !== "admin" || !name || isNaN(fee)) return;
    try {
      const ref = doc(collection(db, "courses"));
      const course = { id: ref.id, name, fee, subjects: [], resources: [], tests: [] };
      await setDoc(ref, course);
      setAllCourses((prev) => [...prev, course]);
      alert("Course added");
    } catch {
      alert("Failed to add course");
    }
  };

  const handleAddStudent = async (name: string, email: string, lecturerId: string) => {
    if (role !== "admin" || !name || !email) return;
    try {
      const ref = doc(collection(db, "students"));
      const student = { id: ref.id, name, email, lecturerId: lecturerId || null, courses: [], totalOwed: 0, totalPaid: 0, balance: 0, paymentStatus: "Unpaid", clearance: false, transactions: [], notifications: [] };
      await setDoc(ref, student);
      setAllStudents((prev) => [...prev, student]);
      alert("Student added");
    } catch {
      alert("Failed to add student");
    }
  };

  const handleAssignLecturer = async (studentId: string, lecturerId: string) => {
    if (!["teacher", "admin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { lecturerId: lecturerId || null });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, lecturerId: lecturerId || null } : s)));
      alert("Lecturer assigned");
    } catch {
      alert("Failed to assign lecturer");
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (!["teacher", "admin"].includes(role) || !message) return;
    try {
      const ref = collection(db, "students", studentId, "notifications");
      const notif = { id: "", message, date: new Date().toISOString(), read: false };
      const docRef = await addDoc(ref, notif);
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, notifications: [...(s.notifications || []), { ...notif, id: docRef.id }] } : s))
      );
      alert("Notification sent");
    } catch {
      alert("Failed to send notification");
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user) return;
    setTestResponses((prev) => ({
      ...prev,
      [testId]: { id: user.uid, answers: { ...(prev[testId]?.answers || {}), [questionIndex]: answer }, submittedAt: prev[testId]?.submittedAt || null, score: prev[testId]?.score || 0 },
    }));
  };

  const handleSubmitTest = async (courseId: string, testId: string) => {
    if (!user || !testResponses[testId]) return;
    try {
      const test = (await getDoc(doc(db, "courses", courseId, "tests", testId))).data() as Test;
      if (!test) return alert("Test not found");
      let score = test.questions.reduce((sum, q, i) => sum + (testResponses[testId].answers[i] === q.correctAnswer ? 1 : 0), 0);
      const response = { ...testResponses[testId], score: (score / test.questions.length) * 100, submittedAt: new Date().toISOString() };
      await setDoc(doc(db, "courses", courseId, "tests", testId, "responses", user.uid), response);
      setTestResponses((prev) => ({ ...prev, [testId]: response }));
      alert(`Test submitted! Score: ${response.score.toFixed(2)}%`);
    } catch {
      alert("Failed to submit test");
    }
  };

  const handleUploadResource = async () => {
    if (!["teacher", "admin"].includes(role) || !newResource.courseId || !newResource.name || !newResource.type || !newResource.url) return alert("Fill all resource fields");
    try {
      new URL(newResource.url);
      const ref = doc(collection(db, "courses", newResource.courseId, "resources"));
      const resource = { ...newResource, id: ref.id, uploadDate: new Date().toISOString() };
      await setDoc(ref, resource);
      setAllCourses((prev) => prev.map((c) => (c.id === newResource.courseId ? { ...c, resources: [...(c.resources || []), resource] } : c)));
      setNewResource({ id: "", name: "", type: "", url: "", uploadDate: "", courseId: "" });
      alert("Resource uploaded");
    } catch {
      alert("Invalid URL or failed to upload");
    }
  };

  const handleCreateTest = async () => {
    if (!["teacher", "admin"].includes(role) || !newTest.courseId || !newTest.title || newTest.questions.some((q) => !q.question || !q.correctAnswer || (q.options.length > 1 && q.options.some((o) => !o))))
      return alert("Fill all test fields");
    try {
      const ref = doc(collection(db, "courses", newTest.courseId, "tests"));
      const test = { id: ref.id, title: newTest.title, questions: newTest.questions, createdAt: new Date().toISOString() };
      await setDoc(ref, test);
      setAllCourses((prev) => prev.map((c) => (c.id === newTest.courseId ? { ...c, tests: [...(c.tests || []), test] } : c)));
      setNewTest({ id: "", courseId: "", title: "", questions: [{ question: "", options: [""], correctAnswer: "" }], createdAt: "" });
      alert("Test created");
    } catch {
      alert("Failed to create test");
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.text("Financial Report", 20, 20);
    autoTable(doc, {
      head: [["Name", "Owed", "Paid", "Balance", "Status"]],
      body: allStudents.map((s) => [s.name || "N/A", s.totalOwed.toLocaleString(), s.totalPaid.toLocaleString(), s.balance.toLocaleString(), s.paymentStatus || "N/A"]),
      startY: 30,
    });
    doc.save("Financial_Report.pdf");
  };

  const filteredStudents = allStudents.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) return <p className="text-red-800 text-center">Loading...</p>;
  if (error) return (
    <div className="text-red-800 text-center">
      <p>{error}</p>
      <button onClick={() => window.location.reload()} className="mt-2 px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Retry</button>
    </div>
  );
  if (!userData || !role) return <p className="text-red-800 text-center">Please log in</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
        </ul>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between mb-6">
            <div className="flex items-center space-x-4">
              <img
                src={userData.profilePicture || "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => (e.currentTarget.src = "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")}
              />
              <div>
                <h2 className="text-2xl font-bold text-red-800">{greeting}, {username}</h2>
                <p className="text-red-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {role === "admin" && (
            <div className="mb-6 bg-white p-4 rounded shadow">
              <h3 className="text-lg font-semibold text-red-800 mb-2">Search Students</h3>
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-2 border rounded text-red-800"
              />
              {searchQuery && (
                <div className="mt-2">
                  {filteredStudents.length ? filteredStudents.map((s) => (
                    <div key={s.id} className="flex items-center space-x-4 p-2 border-b">
                      <img src={s.profilePicture || "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="text-red-800 font-medium">{s.name}</p>
                        <p className="text-red-800 text-sm">Email: {s.email}</p>
                        <p className="text-red-800 text-sm">ID: {s.idNumber || "N/A"}</p>
                      </div>
                    </div>
                  )) : <p className="text-red-800">No students found</p>}
                </div>
              )}
            </div>
          )}

          {role === "student" && (
            <div className="space-y-6">
              {!studentData ? (
                <p className="text-red-800 text-center bg-white p-4 rounded shadow">No profile found. Contact support.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Notifications</h3>
                      {studentData.notifications.length ? studentData.notifications.map((n) => (
                        <div key={n.id || n.date} className="flex justify-between mb-2">
                          <p className={`text-red-800 ${n.read ? "opacity-50" : "font-bold"}`}>{new Date(n.date).toLocaleString()}: {n.message}</p>
                          {!n.read && (
                            <button
                              onClick={() => user && n.id && markNotificationAsRead(user.uid, n.id).then(() => setStudentData((prev) => prev && { ...prev, notifications: prev.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }))}
                              className="text-red-800 hover:underline"
                            >
                              Mark as Read
                            </button>
                          )}
                        </div>
                      )) : <p className="text-red-800">No notifications</p>}
                    </div>
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Grades</h3>
                      {studentData.courses?.length ? studentData.courses.map((c) => (
                        <div key={c.name} className="mb-4">
                          <p className="text-red-800 font-medium">{c.name} (Fee: {c.fee.toLocaleString()} JMD)</p>
                          <table className="w-full mt-2 border-collapse">
                            <thead>
                              <tr className="bg-red-800 text-white">
                                <th className="p-1 border">Subject</th>
                                <th className="p-1 border">Classwork</th>
                                <th className="p-1 border">Exam</th>
                                <th className="p-1 border">Final</th>
                                <th className="p-1 border">Comments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(c.subjects || []).map((s) => (
                                <tr key={s.name}>
                                  <td className="p-1 border text-red-800">{s.name}</td>
                                  <td className="p-1 border text-red-800">{Object.keys(s.grades || {}).filter((k) => k.startsWith("C")).map((k) => s.grades![k] || "N/A").join(", ") || "N/A"}</td>
                                  <td className="p-1 border text-red-800">{s.grades?.exam || "N/A"}</td>
                                  <td className="p-1 border text-red-800">{s.grades?.final || "N/A"}</td>
                                  <td className="p-1 border text-red-800">{s.comments || "None"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-2 text-red-800">Average: {calculateCourseAverage(c.subjects)}</p>
                        </div>
                      )) : <p className="text-red-800">No courses enrolled</p>}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Resources</h3>
                      {studentData.courses?.length ? studentData.courses.map((c) => {
                        const course = allCourses.find((ac) => ac.name === c.name);
                        return (
                          <div key={c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name}</p>
                            {course?.resources?.length ? (
                              <ul className="list-disc pl-5 text-red-800">
                                {course.resources.map((r) => (
                                  <li key={r.id}>
                                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                      {r.name} ({r.type})
                                    </a>{" "}
                                    - {new Date(r.uploadDate).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-red-800">No resources</p>}
                          </div>
                        );
                      }) : <p className="text-red-800">No courses enrolled</p>}
                    </div>
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Tests</h3>
                      {studentData.courses?.length ? studentData.courses.map((c) => {
                        const course = allCourses.find((ac) => ac.name === c.name);
                        return course && (
                          <div key={c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name}</p>
                            {course.tests?.length ? course.tests.map((t) => (
                              <div key={t.id} className="mt-2">
                                <p className="text-red-800 font-medium">{t.title}</p>
                                {testResponses[t.id]?.submittedAt ? (
                                  <p className="text-red-800">Submitted: {new Date(testResponses[t.id].submittedAt!).toLocaleString()} (Score: {testResponses[t.id].score?.toFixed(2)}%)</p>
                                ) : (
                                  <>
                                    {t.questions.map((q, i) => (
                                      <div key={i} className="mt-2">
                                        <p className="text-red-800">{i + 1}. {q.question}</p>
                                        {q.options?.length > 1 ? q.options.map((o, j) => (
                                          <label key={j} className="block text-red-800">
                                            <input
                                              type="radio"
                                              name={`${t.id}-${i}`}
                                              value={o}
                                              checked={testResponses[t.id]?.answers?.[i] === o}
                                              onChange={(e) => handleTestAnswerChange(t.id, i, e.target.value)}
                                              className="mr-2"
                                            />
                                            {o}
                                          </label>
                                        )) : (
                                          <input
                                            type="text"
                                            value={testResponses[t.id]?.answers?.[i] || ""}
                                            onChange={(e) => handleTestAnswerChange(t.id, i, e.target.value)}
                                            className="w-full p-2 border rounded text-red-800"
                                            placeholder="Answer"
                                          />
                                        )}
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => handleSubmitTest(course.id, t.id)}
                                      className="mt-2 px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                                      disabled={!testResponses[t.id]?.answers}
                                    >
                                      Submit
                                    </button>
                                  </>
                                )}
                              </div>
                            )) : <p className="text-red-800">No tests</p>}
                          </div>
                        );
                      }) : <p className="text-red-800">No courses enrolled</p>}
                    </div>
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Payments</h3>
                      <p className="text-red-800">Balance: {studentData.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {studentData.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                      <div className="mt-2">
                        <p className="text-red-800 font-medium">Transactions:</p>
                        {studentData.transactions.length ? studentData.transactions.map((t) => (
                          <p key={t.id || t.date} className="text-red-800">{new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD - {t.status}</p>
                        )) : <p className="text-red-800">No transactions</p>}
                      </div>
                      <CheckoutPage onPaymentSuccess={() => window.location.reload()} />
                    </div>
                    <div className="bg-white p-4 rounded shadow">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Enroll Courses</h3>
                      {allCourses.length ? allCourses.map((c) => (
                        <div key={c.id} className="mb-2 flex justify-between">
                          <p className="text-red-800">{c.name} (Fee: {c.fee.toLocaleString()} JMD)</p>
                          <button
                            onClick={() => handleEnrollCourse(c)}
                            className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                            disabled={studentData.courses?.some((x) => x.name === c.name)}
                          >
                            {studentData.courses?.some((x) => x.name === c.name) ? "Enrolled" : "Enroll"}
                          </button>
                        </div>
                      )) : <p className="text-red-800">No courses available</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {role === "teacher" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Assign Students</h3>
                    {allStudents.length ? allStudents.map((s) => (
                      <div key={s.id} className="flex justify-between mb-2">
                        <p className="text-red-800">{s.name} {s.lecturerId ? `(${allLecturers.find((l) => l.id === s.lecturerId)?.name || "Assigned"})` : "(Unassigned)"}</p>
                        <select value={s.lecturerId || ""} onChange={(e) => handleAssignLecturer(s.id, e.target.value)} className="p-1 border rounded text-red-800">
                          <option value="">Unassign</option>
                          {allLecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                    )) : <p className="text-red-800">No students</p>}
                  </div>
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Upload Resources</h3>
                    <select value={newResource.type} onChange={(e) => setNewResource({ ...newResource, type: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">Type</option>
                      <option value="YouTube Video">YouTube Video</option>
                      <option value="PDF">PDF</option>
                      <option value="Other">Other</option>
                    </select>
                    <input type="text" placeholder="Name" value={newResource.name} onChange={(e) => setNewResource({ ...newResource, name: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2" />
                    <input type="text" placeholder="URL" value={newResource.url} onChange={(e) => setNewResource({ ...newResource, url: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2" />
                    <select value={newResource.courseId} onChange={(e) => setNewResource({ ...newResource, courseId: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">Course</option>
                      {allCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={handleUploadResource} className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Upload</button>
                  </div>
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Notifications</h3>
                    <select value={selectedStudentId || ""} onChange={(e) => setSelectedStudentId(e.target.value || null)} className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">Student</option>
                      {allStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {selectedStudentId && (
                      <input
                        type="text"
                        placeholder="Message"
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value && handleSendNotification(selectedStudentId, e.currentTarget.value).then(() => (e.currentTarget.value = ""))}
                        className="w-full p-2 border rounded text-red-800"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Create Tests</h3>
                    <select value={newTest.courseId} onChange={(e) => setNewTest({ ...newTest, courseId: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">Course</option>
                      {allCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="text" placeholder="Title" value={newTest.title} onChange={(e) => setNewTest({ ...newTest, title: e.target.value })} className="w-full p-2 border rounded text-red-800 mb-2" />
                    {newTest.questions.map((q, i) => (
                      <div key={i} className="mb-2 border p-2 rounded">
                        <input
                          type="text"
                          placeholder={`Question ${i + 1}`}
                          value={q.question}
                          onChange={(e) => setNewTest({ ...newTest, questions: newTest.questions.map((x, j) => (i === j ? { ...x, question: e.target.value } : x)) })}
                          className="w-full p-1 border rounded text-red-800 mb-1"
                        />
                        {q.options.map((o, j) => (
                          <div key={j} className="flex mb-1">
                            <input
                              type="text"
                              placeholder={`Option ${j + 1}`}
                              value={o}
                              onChange={(e) => setNewTest({ ...newTest, questions: newTest.questions.map((x, k) => (i === k ? { ...x, options: x.options.map((y, l) => (j === l ? e.target.value : y)) } : x)) })}
                              className="w-full p-1 border rounded text-red-800 mr-1"
                            />
                            <button
                              onClick={() => setNewTest({ ...newTest, questions: newTest.questions.map((x, k) => (i === k ? { ...x, options: x.options.filter((_, l) => l !== j) } : x)) })}
                              className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                            >
                              X
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setNewTest({ ...newTest, questions: newTest.questions.map((x, k) => (i === k ? { ...x, options: [...x.options, ""] } : x)) })}
                          className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700 mb-1"
                        >
                          Add Option
                        </button>
                        <input
                          type="text"
                          placeholder="Correct Answer"
                          value={q.correctAnswer}
                          onChange={(e) => setNewTest({ ...newTest, questions: newTest.questions.map((x, j) => (i === j ? { ...x, correctAnswer: e.target.value } : x)) })}
                          className="w-full p-1 border rounded text-red-800 mb-1"
                        />
                        <button
                          onClick={() => setNewTest({ ...newTest, questions: newTest.questions.filter((_, j) => j !== i) })}
                          className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setNewTest({ ...newTest, questions: [...newTest.questions, { question: "", options: [""], correctAnswer: "" }] })}
                      className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700 mr-2"
                    >
                      Add Question
                    </button>
                    <button onClick={handleCreateTest} className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Create</button>
                  </div>
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Manage Grades</h3>
                    <select value={selectedStudentId || ""} onChange={(e) => setSelectedStudentId(e.target.value || null)} className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">Student</option>
                      {allStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {selectedStudentId && allStudents.filter((s) => s.id === selectedStudentId).map((s) => (
                      <div key={s.id} className="space-y-2">
                        <p className="text-lg font-medium text-red-800">{s.name}</p>
                        <p className="text-red-800">Email: {s.email || "N/A"}</p>
                        {s.courses?.map((c) => (
                          <div key={c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name}</p>
                            <table className="w-full mt-2 border-collapse">
                              <thead>
                                <tr className="bg-red-800 text-white">
                                  <th className="p-1 border">Subject</th>
                                  <th className="p-1 border">C1</th>
                                  <th className="p-1 border">C2</th>
                                  <th className="p-1 border">Exam</th>
                                  <th className="p-1 border">Final</th>
                                  <th className="p-1 border">Comments</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.subjects || []).map((sub) => (
                                  <tr key={sub.name}>
                                    <td className="p-1 border text-red-800">{sub.name}</td>
                                    <td className="p-1 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C1 || ""}
                                        onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)}
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-1 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C2 || ""}
                                        onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)}
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-1 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.exam || ""}
                                        onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)}
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-1 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                    <td className="p-1 border">
                                      <input
                                        type="text"
                                        value={sub.comments || ""}
                                        onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "comments", e.target.value)}
                                        className="w-full p-1 border rounded text-red-800"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <input
                              type="text"
                              placeholder="Add subject"
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value && handleAddSubject(s.id, c.name, e.currentTarget.value).then(() => (e.currentTarget.value = ""))}
                              className="w-full p-1 border rounded text-red-800 mt-2"
                            />
                            <button onClick={() => handleUpdateStudent(s.id)} className="mt-2 px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Save</button>
                          </div>
                        ))}
                        <p className="text-red-800 font-medium">Transactions:</p>
                        {s.transactions?.length ? s.transactions.map((t) => (
                          <p key={t.id || t.date} className="text-red-800">{new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD - {t.status}</p>
                        )) : <p className="text-red-800">No transactions</p>}
                        <p className="text-red-800 font-medium">Notifications:</p>
                        {s.notifications?.length ? s.notifications.map((n) => (
                          <p key={n.id || n.date} className="text-red-800">{new Date(n.date).toLocaleString()}: {n.message} ({n.read ? "Read" : "Unread"})</p>
                        )) : <p className="text-red-800">No notifications</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Analytics</h3>
                    <p className="text-red-800">Students: {allStudents.length}</p>
                    <p className="text-red-800">Courses: {allCourses.length}</p>
                    <p className="text-red-800">Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()} JMD</p>
                  </div>
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Add Student</h3>
                    <input type="text" id="new-student-name" placeholder="Name" className="w-full p-2 border rounded text-red-800 mb-2" />
                    <input type="email" id="new-student-email" placeholder="Email" className="w-full p-2 border rounded text-red-800 mb-2" />
                    <select id="new-student-lecturer" className="w-full p-2 border rounded text-red-800 mb-2">
                      <option value="">No Lecturer</option>
                      {allLecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <button
                      onClick={() => handleAddStudent(
                        (document.getElementById("new-student-name") as HTMLInputElement)?.value || "",
                        (document.getElementById("new-student-email") as HTMLInputElement)?.value || "",
                        (document.getElementById("new-student-lecturer") as HTMLSelectElement)?.value || ""
                      )}
                      className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Add Course</h3>
                    <input type="text" id="new-course-name" placeholder="Name" className="w-full p-2 border rounded text-red-800 mb-2" />
                    <input type="number" id="new-course-fee" placeholder="Fee (JMD)" className="w-full p-2 border rounded text-red-800 mb-2" />
                    <button
                      onClick={() => handleAddCourse(
                        (document.getElementById("new-course-name") as HTMLInputElement)?.value || "",
                        parseFloat((document.getElementById("new-course-fee") as HTMLInputElement)?.value || "0")
                      )}
                      className="px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {allStudents.length ? allStudents.map((s) => (
                    <div key={s.id} className="bg-white p-4 rounded shadow">
                      <div className="flex items-center space-x-4 mb-2">
                        <img src={s.profilePicture || "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                        <p className="text-lg font-medium text-red-800">{s.name}</p>
                      </div>
                      <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                      <div className="mt-2">
                        <label className="text-red-800 mr-2">Lecturer:</label>
                        <select value={s.lecturerId || ""} onChange={(e) => handleAssignLecturer(s.id, e.target.value)} className="p-2 border rounded text-red-800">
                          <option value="">None</option>
                          {allLecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                      {(s.courses || []).map((c) => (
                        <div key={c.name} className="mt-2">
                          <p className="text-red-800 font-medium">{c.name}</p>
                          <table className="w-full mt-2 border-collapse">
                            <thead>
                              <tr className="bg-red-800 text-white">
                                <th className="p-1 border">Subject</th>
                                <th className="p-1 border">C1</th>
                                <th className="p-1 border">C2</th>
                                <th className="p-1 border">Exam</th>
                                <th className="p-1 border">Final</th>
                                <th className="p-1 border">Comments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(c.subjects || []).map((sub) => (
                                <tr key={sub.name}>
                                  <td className="p-1 border text-red-800">{sub.name}</td>
                                  <td className="p-1 border">
                                    <input
                                      type="number"
                                      value={sub.grades?.C1 || ""}
                                      onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)}
                                      className="w-full p-1 border rounded text-red-800"
                                      min="0"
                                      max="100"
                                    />
                                  </td>
                                  <td className="p-1 border">
                                    <input
                                      type="number"
                                      value={sub.grades?.C2 || ""}
                                      onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)}
                                      className="w-full p-1 border rounded text-red-800"
                                      min="0"
                                      max="100"
                                    />
                                  </td>
                                  <td className="p-1 border">
                                    <input
                                      type="number"
                                      value={sub.grades?.exam || ""}
                                      onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)}
                                      className="w-full p-1 border rounded text-red-800"
                                      min="0"
                                      max="100"
                                    />
                                  </td>
                                  <td className="p-1 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                  <td className="p-1 border">
                                    <input
                                      type="text"
                                      value={sub.comments || ""}
                                      onChange={(e) => handleGradeUpdate(s.id, c.name, sub.name, "comments", e.target.value)}
                                      className="w-full p-1 border rounded text-red-800"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <input
                            type="text"
                            placeholder="Add subject"
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value && handleAddSubject(s.id, c.name, e.currentTarget.value).then(() => (e.currentTarget.value = ""))}
                            className="w-full p-1 border rounded text-red-800 mt-2"
                          />
                          <button onClick={() => handleUpdateStudent(s.id)} className="mt-2 px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Save</button>
                        </div>
                      ))}
                      <input
                        type="text"
                        placeholder="Notification"
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value && handleSendNotification(s.id, e.currentTarget.value).then(() => (e.currentTarget.value = ""))}
                        className="w-full p-2 border rounded text-red-800 mt-2"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleGrantClearance(s.id)}
                          disabled={s.clearance}
                          className={`px-4 py-1 rounded text-white ${s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                        >
                          Grant Clearance
                        </button>
                        <button
                          onClick={() => handleRemoveClearance(s.id)}
                          disabled={!s.clearance}
                          className={`px-4 py-1 rounded text-white ${!s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                        >
                          Remove Clearance
                        </button>
                      </div>
                    </div>
                  )) : <p className="text-red-800 bg-white p-4 rounded shadow">No students</p>}
                </div>
              </div>
            </div>
          )}

          {role === "accountsadmin" && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded shadow">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Financial Overview</h3>
                <p className="text-red-800">Students: {allStudents.length}</p>
                <p className="text-red-800">Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()} JMD</p>
                <button onClick={downloadFinancialReport} className="mt-2 px-4 py-1 bg-red-800 text-white rounded hover:bg-red-700">Download Report</button>
              </div>
              <div className="space-y-4">
                {allStudents.length ? allStudents.map((s) => (
                  <div key={s.id} className="bg-white p-4 rounded shadow">
                    <div className="flex items-center space-x-4 mb-2">
                      <img src={s.profilePicture || "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                      <p className="text-lg font-medium text-red-800">{s.name}</p>
                    </div>
                    <p className="text-red-800">Owed: {s.totalOwed.toLocaleString()} JMD</p>
                    <p className="text-red-800">Paid: {s.totalPaid.toLocaleString()} JMD</p>
                    <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                    <p className="text-red-800">Status: {s.paymentStatus}</p>
                    <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                    <div className="mt-2">
                      <p className="text-red-800 font-medium">Transactions:</p>
                      {s.transactions?.length ? s.transactions.map((t) => (
                        <p key={t.id || t.date} className="text-red-800">{new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD - {t.status}</p>
                      )) : <p className="text-red-800">No transactions</p>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleGrantClearance(s.id)}
                        disabled={s.clearance}
                        className={`px-4 py-1 rounded text-white ${s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Grant Clearance
                      </button>
                      <button
                        onClick={() => handleRemoveClearance(s.id)}
                        disabled={!s.clearance}
                        className={`px-4 py-1 rounded text-white ${!s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"}`}
                      >
                        Remove Clearance
                      </button>
                    </div>
                  </div>
                )) : <p className="text-red-800">No students</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}