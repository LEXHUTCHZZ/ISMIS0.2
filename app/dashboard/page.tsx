"use client";

import { useEffect, useState, useMemo } from "react";
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
  deleteDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  User,
  StudentData,
  Course,
  Resource,
  Test,
  TestResponse,
  Subject,
  Notification,
  Coursework,
  Submission,
} from "../../models";

// Define Role type
type Role = "student" | "teacher" | "admin" | "accountsadmin";

// Define Payment type
interface Payment {
  id: string;
  amount: number;
  date: string;
  description: string;
}

// Utility to validate URLs
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Centralized role-based permissions
const hasPermission = (role: Role, allowedRoles: Role[]): boolean =>
  allowedRoles.includes(role);

// Utility to download CSV
const downloadCSV = (data: any[], filename: string) => {
  if (!data.length) {
    alert("No data to download");
    return;
  }
  const csv = [
    Object.keys(data[0]).join(","),
    ...data.map((row) => Object.values(row).map((v) => `"${v}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<(StudentData & { payments?: Payment[]; email?: string })[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [newResource, setNewResource] = useState<Resource>({
    id: "",
    name: "",
    type: "",
    url: "",
    uploadDate: "",
    courseId: "",
  });
  const [newTest, setNewTest] = useState<Test>({
    id: "",
    courseId: "",
    title: "",
    questions: [{ question: "", options: [""], correctAnswer: "" }],
    createdAt: "",
  });
  const [newCoursework, setNewCoursework] = useState<Coursework>({
    id: "",
    title: "",
    description: "",
    dueDate: "",
    weight: 0,
    type: "activity",
  });
  const [submissions, setSubmissions] = useState<{ [courseworkId: string]: Submission }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  // Memoized greeting with emojis
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning 🌞";
    if (hour < 18) return "Good Afternoon ⛅";
    if (hour < 22) return "Good Evening 🌙";
    return "Good Night 🌟";
  }, []);

  // Memoized filtered students
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return allStudents;
    return allStudents.filter(
      (s) =>
        (s.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allStudents, searchQuery]);

  // Fetch data with real-time listeners
  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setLoading(true);
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      try {
        const userDoc = doc(db, "users", currentUser.uid);
        const unsubscribeUser = onSnapshot(userDoc, async (snap) => {
          if (!snap.exists()) {
            setError("User not found");
            setLoading(false);
            return;
          }

          const data = snap.data() as User & {
            clearance?: boolean;
            lastOnline?: string;
            active?: boolean;
          };
          const userRole = data.role as Role;
          if (!["student", "teacher", "admin", "accountsadmin"].includes(userRole)) {
            setError("Invalid user role");
            setLoading(false);
            return;
          }
          setUserData(data);
          setRole(userRole);
          setUsername(data.name || "User");
          setLoading(false);

          let unsubscribeStudent: (() => void) | undefined;
          let unsubscribeNotifications: (() => void) | undefined;

          // Fetch student data and notifications
          if (hasPermission(userRole, ["student", "teacher"])) {
            const studentDoc = doc(db, "students", currentUser.uid);
            unsubscribeStudent = onSnapshot(studentDoc, async (snap) => {
              if (!snap.exists()) {
                // Create default student document
                const defaultStudent: StudentData = {
                  id: currentUser.uid,
                  name: data.name || "Student",
                  email: currentUser.email || "",
                  courses: [],
                  transactions: [],
                  notifications: [],
                  totalOwed: 0,
                  totalPaid: 0,
                  balance: 0,
                  paymentStatus: "pending",
                  clearance: false,
                  lecturerId: "", // Provide a default value for lecturerId
                };
                try {
                  await setDoc(studentDoc, defaultStudent);
                  setStudentData(defaultStudent);
                } catch (e) {
                  console.error("Error creating student document:", e);
                  setError("Failed to initialize student profile");
                  setStudentData(null);
                }
              } else {
                const student = snap.data() as StudentData;
                setStudentData({
                  ...student,
                  id: currentUser.uid,
                  transactions: student.transactions || [],
                  notifications: student.notifications || [],
                  courses: student.courses || [], // Ensure courses is an array
                });
              }
            });

            if (userRole === "student") {
              const notificationsCollection = collection(db, "students", currentUser.uid, "notifications");
              unsubscribeNotifications = onSnapshot(notificationsCollection, (snapshot) => {
                const notifications = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                })) as Notification[];
                setStudentData((prev) =>
                  prev ? { ...prev, notifications: notifications || [] } : prev
                );
              });

              // Fetch courses, test responses, and submissions for student
              const coursesSnap = await getDocs(collection(db, "courses"));
              const courses: Course[] = await Promise.all(
                coursesSnap.docs.map(async (d) => {
                  const course = d.data() as Omit<Course, "id" | "resources" | "tests" | "coursework">;
                  const resourcesSnap = await getDocs(collection(db, "courses", d.id, "resources"));
                  const resources = resourcesSnap.docs.map((r) => ({
                    id: r.id,
                    ...r.data(),
                  })) as Resource[];

                  const testsSnap = await getDocs(collection(db, "courses", d.id, "tests"));
                  const tests = testsSnap.docs.map((t) => ({
                    id: t.id,
                    ...t.data(),
                  })) as Test[];

                  const courseworkSnap = await getDocs(collection(db, "courses", d.id, "coursework"));
                  const coursework = courseworkSnap.docs.map((c) => ({
                    id: c.id,
                    ...c.data(),
                  })) as Coursework[];

                  return {
                    id: d.id,
                    ...course,
                    resources: resources || [],
                    tests: tests || [],
                    coursework: coursework || [],
                  } as Course;
                })
              );
              setAllCourses(courses);

              for (const d of coursesSnap.docs) {
                const testsSnap = await getDocs(collection(db, "courses", d.id, "tests"));
                for (const t of testsSnap.docs) {
                  const resp = await getDoc(doc(db, "courses", d.id, "tests", t.id, "responses", currentUser.uid));
                  if (resp.exists()) {
                    setTestResponses((prev) => ({
                      ...prev,
                      [t.id]: resp.data() as TestResponse,
                    }));
                  }
                }
                const courseworkSnap = await getDocs(collection(db, "courses", d.id, "coursework"));
                for (const c of courseworkSnap.docs) {
                  const sub = await getDoc(doc(db, "courses", d.id, "coursework", c.id, "submissions", currentUser.uid));
                  if (sub.exists()) {
                    setSubmissions((prev) => ({
                      ...prev,
                      [c.id]: sub.data() as Submission,
                    }));
                  }
                }
              }
            }
          }

          // Fetch additional data for teacher/admin/accountsadmin
          if (hasPermission(userRole, ["teacher", "admin", "accountsadmin"])) {
            const studentsSnap = await getDocs(collection(db, "students"));
            const students = await Promise.all(
              studentsSnap.docs.map(async (d) => {
                const studentData = d.data() as StudentData & {
                  clearance?: boolean;
                  lastOnline?: string;
                  active?: boolean;
                  email?: string;
                };
                const paymentsSnap = await getDocs(collection(db, "students", d.id, "payments"));
                const payments = paymentsSnap.docs.map((p) => ({
                  id: p.id,
                  ...p.data(),
                })) as Payment[];
                return {
                  ...studentData,
                  id: d.id,
                  email: studentData.email || currentUser.email || "",
                  transactions: studentData.transactions || [],
                  notifications: studentData.notifications || [],
                  payments: payments || [],
                  clearance: studentData.clearance ?? false,
                  lastOnline: studentData.lastOnline || "",
                  active: studentData.active ?? true,
                  courses: studentData.courses || [],
                };
              })
            );
            setAllStudents(students);

            if (userRole === "teacher" && students.length) {
              setSelectedStudentId(students[0].id);
              if (students[0].courses?.length) {
                setSelectedCourseName(students[0].courses[0].name);
              }
            }

            // Fetch courses for non-students (already fetched for students above)
            if (userRole !== "student") {
              const coursesSnap = await getDocs(collection(db, "courses"));
              const courses = await Promise.all(
                coursesSnap.docs.map(async (d) => {
                  const course = d.data() as Omit<Course, "id" | "resources" | "tests" | "coursework">;
                  const resourcesSnap = await getDocs(collection(db, "courses", d.id, "resources"));
                  const resources = resourcesSnap.docs.map((r) => ({
                    id: r.id,
                    ...r.data(),
                  })) as Resource[];

                  const testsSnap = await getDocs(collection(db, "courses", d.id, "tests"));
                  const tests = testsSnap.docs.map((t) => ({
                    id: t.id,
                    ...t.data(),
                  })) as Test[];

                  const courseworkSnap = await getDocs(collection(db, "courses", d.id, "coursework"));
                  const coursework = courseworkSnap.docs.map((c) => ({
                    id: c.id,
                    ...c.data(),
                  })) as Coursework[];

                  return {
                    id: d.id,
                    ...course,
                    resources: resources || [],
                    tests: tests || [],
                    coursework: coursework || [],
                  } as Course;
                })
              );
              setAllCourses(courses);
            }
          }

          // Cleanup for student and notifications subscriptions
          return () => {
            if (unsubscribeStudent) unsubscribeStudent();
            if (unsubscribeNotifications) unsubscribeNotifications();
          };
        });

        // Cleanup for user snapshot
        return () => {
          unsubscribeUser();
        };
      } catch (e) {
        console.error("Error fetching data:", e);
        setError("Failed to load data");
        setLoading(false);
      }
    });

    // Cleanup for auth listener
    return () => {
      unsubscribeAuth();
    };
  }, [user, router]);

  const calculateCourseAverage = (subjects: Subject[] = []): string => {
    const grades = subjects
      .map((s) => parseFloat(s.grades?.final || "0"))
      .filter((g) => !isNaN(g));
    return grades.length
      ? (grades.reduce((sum, g) => sum + g, 0) / grades.length).toFixed(2)
      : "N/A";
  };

  const handleGradeUpdate = (
    studentId: string,
    courseName: string,
    subjectName: string,
    field: string,
    value: string
  ) => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) return;
    if (field !== "comments" && (isNaN(parseFloat(value)) || parseFloat(value) < 0 || parseFloat(value) > 100)) {
      alert("Enter a grade between 0 and 100");
      return;
    }
    setAllStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const courses = (s.courses || []).map((c) => {
          if (c.name !== courseName) return c;
          const subjects = (c.subjects || []).map((sub) => {
            if (sub.name !== subjectName) return sub;
            if (field === "comments") return { ...sub, comments: value };
            const grades = { ...(sub.grades || {}), [field]: value };
            const classwork = Object.keys(grades)
              .filter((k) => k.startsWith("C"))
              .map((k) => parseFloat(grades[k] || "0"))
              .filter((v) => !isNaN(v));
            const exam = parseFloat(grades.exam || "0");
            if (classwork.length && !isNaN(exam)) {
              grades.final = (classwork.reduce((sum, v) => sum + v, 0) / classwork.length * 0.4 + exam * 0.6).toFixed(2);
            }
            return { ...sub, grades };
          });
          return { ...c, subjects };
        });
        return { ...s, courses };
      })
    );
  };

  const handleUpdateStudent = async (studentId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) {
      alert("Student not found");
      return;
    }
    try {
      await updateDoc(doc(db, "students", studentId), { courses: student.courses || [] });
      alert("Grades updated");
    } catch (e) {
      console.error("Error updating student:", e);
      alert("Failed to update grades");
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) return;
    if (!message.trim()) {
      alert("Message cannot be empty");
      return;
    }
    try {
      const ref = collection(db, "students", studentId, "notifications");
      const notif: Notification = {
        id: "",
        message,
        date: new Date().toISOString(),
        read: false,
      };
      const docRef = await addDoc(ref, notif);
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                notifications: [...(s.notifications || []), { ...notif, id: docRef.id }],
              }
            : s
        )
      );
      alert("Notification sent");
    } catch (e) {
      console.error("Error sending notification:", e);
      alert("Failed to send notification");
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user) return;
    setTestResponses((prev) => {
      const currentResponse = prev[testId] || { id: user.uid, answers: {}, submittedAt: null, score: 0 };
      return {
        ...prev,
        [testId]: {
          ...currentResponse,
          answers: { ...currentResponse.answers, [questionIndex]: answer },
        },
      };
    });
  };

  const handleSubmitTest = async (courseId: string, testId: string) => {
    if (!user || !testResponses[testId]) {
      alert("No answers provided");
      return;
    }
    try {
      const testDoc = await getDoc(doc(db, "courses", courseId, "tests", testId));
      if (!testDoc.exists()) {
        alert("Test not found");
        return;
      }
      const test = testDoc.data() as Test;
      const score = test.questions.reduce(
        (sum, q, i) =>
          sum + (testResponses[testId].answers[i] === q.correctAnswer ? 1 : 0),
        0
      );
      const response: TestResponse = {
        id: user.uid,
        answers: testResponses[testId].answers,
        score: (score / test.questions.length) * 100,
        submittedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "courses", courseId, "tests", testId, "responses", user.uid), response);
      setTestResponses((prev) => ({ ...prev, [testId]: response }));
      alert(`Test submitted! Score: ${response.score.toFixed(2)}%`);
    } catch (e) {
      console.error("Error submitting test:", e);
      alert("Failed to submit test");
    }
  };

  const handleUploadResource = async () => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (!newResource.name || !newResource.type || !newResource.url) {
      alert("Fill all resource fields");
      return;
    }
    if (!isValidUrl(newResource.url)) {
      alert("Invalid URL");
      return;
    }
    if (!selectedCourseName) {
      alert("Select a course in Manage Grades");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "resources"));
      const resource: Resource = {
        id: ref.id,
        name: newResource.name,
        type: newResource.type,
        url: newResource.url,
        uploadDate: new Date().toISOString(),
        courseId: course.id,
      };
      await setDoc(ref, resource);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id
            ? { ...c, resources: [...(c.resources || []), resource] }
            : c
        )
      );
      setNewResource({ id: "", name: "", type: "", url: "", uploadDate: "", courseId: "" });
      alert("Resource uploaded");
    } catch (e) {
      console.error("Error uploading resource:", e);
      alert("Failed to upload resource");
    }
  };

  const handleCreateTest = async () => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (
      !newTest.title ||
      newTest.questions.some(
        (q) => !q.question || !q.correctAnswer || q.options.some((o) => !o)
      )
    ) {
      alert("Fill all test fields");
      return;
    }
    if (!selectedCourseName) {
      alert("Select a course in Manage Grades");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "tests"));
      const test: Test = {
        id: ref.id,
        courseId: course.id,
        title: newTest.title,
        questions: newTest.questions,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, test);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id ? { ...c, tests: [...(c.tests || []), test] } : c
        )
      );
      setNewTest({
        id: "",
        courseId: "",
        title: "",
        questions: [{ question: "", options: [""], correctAnswer: "" }],
        createdAt: "",
      });
      alert("Test created");
    } catch (e) {
      console.error("Error creating test:", e);
      alert("Failed to create test");
    }
  };

  const handleUploadCoursework = async () => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (
      !newCoursework.title ||
      !newCoursework.description ||
      !newCoursework.dueDate ||
      isNaN(newCoursework.weight) ||
      newCoursework.weight <= 0
    ) {
      alert("Fill all coursework fields");
      return;
    }
    if (!selectedCourseName) {
      alert("Select a course in Manage Grades");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "coursework"));
      const coursework: Coursework = {
        ...newCoursework,
        id: ref.id,
        type: "activity",
      };
      await setDoc(ref, coursework);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id
            ? { ...c, coursework: [...(c.coursework || []), coursework] }
            : c
        )
      );
      setNewCoursework({ id: "", title: "", description: "", dueDate: "", weight: 0, type: "activity" });
      alert("Coursework uploaded");
    } catch (e) {
      console.error("Error uploading coursework:", e);
      alert("Failed to upload coursework");
    }
  };

  const handleSubmitCoursework = async (courseId: string, courseworkId: string, fileUrl: string) => {
    if (!user) return;
    if (!isValidUrl(fileUrl)) {
      alert("Invalid URL");
      return;
    }
    try {
      const submission: Submission = {
        studentId: user.uid,
        fileUrl,
        submittedAt: new Date().toISOString(),
      };
      await setDoc(
        doc(db, "courses", courseId, "coursework", courseworkId, "submissions", user.uid),
        submission
      );
      setSubmissions((prev) => ({ ...prev, [courseworkId]: submission }));
      alert("Submission uploaded");
    } catch (e) {
      console.error("Error submitting coursework:", e);
      alert("Failed to upload submission");
    }
  };

  const handleToggleClearance = async (studentId: string, currentClearance: boolean) => {
    if (!role || !hasPermission(role, ["admin", "accountsadmin"])) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: !currentClearance });
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, clearance: !currentClearance } : s
        )
      );
      alert(`Clearance ${currentClearance ? "removed" : "granted"}`);
    } catch (e) {
      console.error("Error toggling clearance:", e);
      alert("Failed to update clearance");
    }
  };

  const handleDownloadStudentBalance = (student: StudentData & { payments?: Payment[] }) => {
    const data = (student.payments || []).map((p) => ({
      Date: new Date(p.date).toLocaleString(),
      Amount: p.amount.toFixed(2),
      Description: p.description,
    }));
    downloadCSV(data, `${student.name || "student"}_balance.csv`);
  };

  const handleDownloadAllBalances = () => {
    const data = allStudents.flatMap((s) =>
      (s.payments || []).map((p) => ({
        Student: s.name || "Unknown",
        Date: new Date(p.date).toLocaleString(),
        Amount: p.amount.toFixed(2),
        Description: p.description,
      }))
    );
    downloadCSV(data, "all_students_balances.csv");
  };

  const handleDeactivateAccount = async (studentId: string, currentActive: boolean) => {
    if (!role || !hasPermission(role, ["admin"])) return;
    try {
      await updateDoc(doc(db, "students", studentId), { active: !currentActive });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, active: !currentActive } : s))
      );
      alert(`Account ${currentActive ? "deactivated" : "reactivated"}`);
    } catch (e) {
      console.error("Error toggling account status:", e);
      alert("Failed to update account status");
    }
  };

  const handleDeleteAccount = async (studentId: string) => {
    if (!role || !hasPermission(role, ["admin"])) return;
    if (!confirm("Are you sure you want to permanently delete this account?")) return;
    try {
      await deleteDoc(doc(db, "students", studentId));
      await deleteDoc(doc(db, "users", studentId));
      setAllStudents((prev) => prev.filter((s) => s.id !== studentId));
      alert("Account deleted");
    } catch (e) {
      console.error("Error deleting account:", e);
      alert("Failed to delete account");
    }
  };

  const handleResetPassword = async (studentId: string, email: string) => {
    if (!role || !hasPermission(role, ["admin"])) return;
    if (!email) {
      alert("No email provided for this user");
      return;
    }
    const newPassword = prompt("Enter new password:");
    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    try {
      // Placeholder: Requires Firebase Admin SDK for production
      alert("Password reset requires server-side implementation. Contact support.");
    } catch (e) {
      console.error("Error resetting password:", e);
      alert("Failed to reset password");
    }
  };

  if (loading) return <p className="text-gray-600 text-center">Loading...</p>;
  if (error) return <p className="text-red-600 text-center">{error}</p>;
  if (!userData || !role) return <p className="text-gray-600 text-center">Please log in</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow p-6">
        <h3 className="text-xl font-semibold text-blue-600 mb-6">Dashboard Menu</h3>
        <ul className="space-y-4">
          <li>
            <Link href="/dashboard" className="text-blue-600 hover:underline">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/profile" className="text-blue-600 hover:underline">
              Profile
            </Link>
          </li>
        </ul>
      </div>
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between mb-8">
            <div className="flex items-center space-x-6">
              <img
                src={userData.profilePicture || "https://via.placeholder.com/150"}
                alt="Profile"
                className="w-14 h-14 rounded-full object-cover border-2 border-blue-600"
                onError={(e) => {
                  e.currentTarget.src = "https://via.placeholder.com/150";
                }}
              />
              <div>
                <h2 className="text-3xl font-bold text-blue-600">
                  {greetingText}, {username}
                </h2>
                <p className="text-blue-600 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {role === "student" && (
            <div className="space-y-8">
              {!studentData ? (
                <p className="text-gray-600 text-center bg-white p-6 rounded-lg shadow">
                  Initializing profile, please wait...
                </p>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">My Courses</h3>
                    {allCourses.length ? (
                      allCourses.map((course) => (
                        <div key={course.id} className="mb-6">
                          <h4 className="text-lg font-medium text-blue-600 mb-3">{course.name}</h4>
                          <div className="space-y-4">
                            <div>
                              <h5 className="text-blue-600 font-medium">Resources</h5>
                              {course.resources?.length ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                  {course.resources.map((r) => (
                                    <div
                                      key={r.id}
                                      className="p-4 bg-gray-50 rounded-lg flex items-center space-x-3 hover:bg-gray-100"
                                    >
                                      <span className="text-blue-500">📄</span>
                                      <div>
                                        <p className="text-blue-600 font-medium">{r.name}</p>
                                        <p className="text-sm text-gray-600">{r.type}</p>
                                        <p className="text-sm text-gray-600">
                                          Uploaded: {new Date(r.uploadDate).toLocaleDateString()}
                                        </p>
                                        <a
                                          href={r.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 underline text-sm"
                                        >
                                          View
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No resources available</p>
                              )}
                            </div>
                            <div>
                              <h5 className="text-blue-600 font-medium">Tests</h5>
                              {course.tests?.length ? (
                                <div className="space-y-3 mt-2">
                                  {course.tests.map((t) => (
                                    <div key={t.id} className="p-4 bg-gray-50 rounded-lg">
                                      <p className="text-blue-600 font-medium">{t.title}</p>
                                      {testResponses[t.id]?.submittedAt ? (
                                        <p className="text-gray-600">
                                          Submitted: {testResponses[t.id].submittedAt ? new Date(testResponses[t.id].submittedAt || "").toLocaleString() : "N/A"}
                                          <br />
                                          Score: {testResponses[t.id].score?.toFixed(2) || "N/A"}%
                                        </p>
                                      ) : (
                                        <>
                                          {t.questions.map((q, i) => (
                                            <div key={i} className="mt-2">
                                              <p className="text-gray-600">{i + 1}. {q.question}</p>
                                              {q.options?.length > 1 ? (
                                                q.options.map((o, j) => (
                                                  <label key={j} className="block text-gray-600">
                                                    <input
                                                      type="radio"
                                                      name={`${t.id}-${i}`}
                                                      value={o}
                                                      checked={testResponses[t.id]?.answers?.[i] === o}
                                                      onChange={(e) =>
                                                        handleTestAnswerChange(t.id, i, e.target.value)
                                                      }
                                                      className="mr-2"
                                                    />
                                                    {o}
                                                  </label>
                                                ))
                                              ) : (
                                                <input
                                                  type="text"
                                                  value={testResponses[t.id]?.answers?.[i] || ""}
                                                  onChange={(e) =>
                                                    handleTestAnswerChange(t.id, i, e.target.value)
                                                  }
                                                  className="w-full p-2 border rounded text-gray-600"
                                                  placeholder="Your answer"
                                                />
                                              )}
                                            </div>
                                          ))}
                                          <button
                                            onClick={() => handleSubmitTest(course.id, t.id)}
                                            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                                            disabled={
                                              !testResponses[t.id]?.answers ||
                                              Object.keys(testResponses[t.id]?.answers || {}).length !==
                                                t.questions.length
                                            }
                                          >
                                            Submit Test
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No tests available</p>
                              )}
                            </div>
                            <div>
                              <h5 className="text-blue-600 font-medium">Coursework</h5>
                              {course.coursework?.length ? (
                                <div className="space-y-3 mt-2">
                                  {course.coursework.map((cw) => (
                                    <div key={cw.id} className="p-4 bg-gray-50 rounded-lg">
                                      <p className="text-blue-600 font-medium">{cw.title}</p>
                                      <p className="text-gray-600">{cw.description}</p>
                                      <p className="text-gray-600">
                                        Due: {new Date(cw.dueDate).toLocaleString()}
                                      </p>
                                      <p className="text-gray-600">Weight: {cw.weight}%</p>
                                      {submissions[cw.id] ? (
                                        <p className="text-gray-600">
                                          Submitted: {new Date(submissions[cw.id].submittedAt).toLocaleString()}
                                        </p>
                                      ) : (
                                        <div className="mt-2">
                                          <input
                                            type="text"
                                            placeholder="Submission URL"
                                            onKeyDown={(e) =>
                                              e.key === "Enter" &&
                                              e.currentTarget.value &&
                                              handleSubmitCoursework(course.id, cw.id, e.currentTarget.value).then(
                                                () => (e.currentTarget.value = "")
                                              )
                                            }
                                            className="w-full p-2 border rounded text-gray-600"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No coursework available</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-600">No courses available. Contact your instructor.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {role === "teacher" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">Upload Resources</h3>
                    <p className="text-gray-600 mb-4">
                      Course: {selectedCourseName || "Select a course in Manage Grades"}
                    </p>
                    <select
                      value={newResource.type}
                      onChange={(e) => setNewResource({ ...newResource, type: e.target.value })}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    >
                      <option value="">Select Type</option>
                      <option value="Video">Video</option>
                      <option value="PDF">PDF</option>
                      <option value="Link">Link</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Resource Name"
                      value={newResource.name}
                      onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    <input
                      type="text"
                      placeholder="Resource URL"
                      value={newResource.url}
                      onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    <button
                      onClick={handleUploadResource}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-400"
                      disabled={!selectedCourseName || !newResource.name || !newResource.type || !newResource.url}
                    >
                      Upload Resource
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">Create Test</h3>
                    <p className="text-gray-600 mb-4">
                      Course: {selectedCourseName || "Select a course in Manage Grades"}
                    </p>
                    <input
                      type="text"
                      placeholder="Test Title"
                      value={newTest.title}
                      onChange={(e) => setNewTest({ ...newTest, title: e.target.value })}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    {newTest.questions.map((q, i) => (
                      <div key={i} className="mb-4 p-4 border rounded">
                        <input
                          type="text"
                          placeholder={`Question ${i + 1}`}
                          value={q.question}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, j) =>
                                i === j ? { ...x, question: e.target.value } : x
                              ),
                            })
                          }
                          className="w-full p-2 border rounded text-gray-600 mb-2"
                        />
                        {q.options.map((o, j) => (
                          <div key={j} className="flex mb-2">
                            <input
                              type="text"
                              placeholder={`Option ${j + 1}`}
                              value={o}
                              onChange={(e) =>
                                setNewTest({
                                  ...newTest,
                                  questions: newTest.questions.map((x, k) =>
                                    i === k
                                      ? {
                                          ...x,
                                          options: x.options.map((y, l) =>
                                            j === l ? e.target.value : y
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="w-full p-2 border rounded text-gray-600 mr-2"
                            />
                            <button
                              onClick={() =>
                                setNewTest({
                                  ...newTest,
                                  questions: newTest.questions.map((x, k) =>
                                    i === k
                                      ? { ...x, options: x.options.filter((_, l) => l !== j) }
                                      : x
                                  ),
                                })
                              }
                              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                            >
                              X
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, k) =>
                                i === k ? { ...x, options: [...x.options, ""] } : x
                              ),
                            })
                          }
                          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 mb-2"
                        >
                          Add Option
                        </button>
                        <input
                          type="text"
                          placeholder="Correct Answer"
                          value={q.correctAnswer}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, j) =>
                                i === j ? { ...x, correctAnswer: e.target.value } : x
                              ),
                            })
                          }
                          className="w-full p-2 border rounded text-gray-600 mb-2"
                        />
                        <button
                          onClick={() =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.filter((_, j) => j !== i),
                            })
                          }
                          className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                        >
                          Remove Question
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setNewTest({
                          ...newTest,
                          questions: [
                            ...newTest.questions,
                            { question: "", options: [""], correctAnswer: "" },
                          ],
                        })
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 mr-3"
                    >
                      Add Question
                    </button>
                    <button
                      onClick={handleCreateTest}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-400"
                      disabled={
                        !selectedCourseName ||
                        !newTest.title ||
                        newTest.questions.some(
                          (q) => !q.question || !q.correctAnswer || q.options.some((o) => !o)
                        )
                      }
                    >
                      Create Test
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">Upload Coursework</h3>
                    <p className="text-gray-600 mb-4">
                      Course: {selectedCourseName || "Select a course in Manage Grades"}
                    </p>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newCoursework.title}
                      onChange={(e) => setNewCoursework({ ...newCoursework, title: e.target.value })}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={newCoursework.description}
                      onChange={(e) =>
                        setNewCoursework({ ...newCoursework, description: e.target.value })
                      }
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    <input
                      type="datetime-local"
                      value={newCoursework.dueDate}
                      onChange={(e) =>
                        setNewCoursework({ ...newCoursework, dueDate: e.target.value })
                      }
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    />
                    <input
                      type="number"
                      placeholder="Weight (%)"
                      value={newCoursework.weight || ""}
                      onChange={(e) =>
                        setNewCoursework({
                          ...newCoursework,
                          weight: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                      min="0"
                      max="100"
                    />
                    <button
                      onClick={handleUploadCoursework}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-400"
                      disabled={!selectedCourseName}
                    >
                      Upload Coursework
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">Notifications</h3>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => setSelectedStudentId(e.target.value || null)}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || "Unknown"}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <input
                        type="text"
                        placeholder="Send a message"
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          e.currentTarget.value &&
                          handleSendNotification(selectedStudentId, e.currentTarget.value).then(
                            () => (e.currentTarget.value = "")
                          )
                        }
                        className="w-full p-3 border rounded text-gray-600"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold text-blue-600 mb-4">Manage Grades</h3>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value || null);
                        const student = allStudents.find((s) => s.id === e.target.value);
                        setSelectedCourseName(student?.courses?.length ? student.courses[0].name : null);
                      }}
                      className="w-full p-3 border rounded text-gray-600 mb-4"
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || "Unknown"}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <select
                        value={selectedCourseName || ""}
                        onChange={(e) => setSelectedCourseName(e.target.value || null)}
                        className="w-full p-3 border rounded text-gray-600 mb-4"
                      >
                        <option value="">Select Course</option>
                        {allStudents
                          .find((s) => s.id === selectedStudentId)
                          ?.courses?.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          )) || []}
                      </select>
                    )}
                    {selectedStudentId && selectedCourseName ? (
                      allStudents
                        .filter((s) => s.id === selectedStudentId)
                        .map((s) => (
                          <div key={s.id} className="space-y-4">
                            <p className="text-lg font-medium text-blue-600">{s.name || "Unknown"}</p>
                            {s.courses
                              ?.filter((c) => c.name === selectedCourseName)
                              .map((c) => (
                                <div key={c.name} className="mb-6">
                                  <p className="text-blue-600 font-medium">{c.name}</p>
                                  <table className="w-full mt-3 border-collapse">
                                    <thead>
                                      <tr className="bg-blue-600 text-white">
                                        <th className="p-2 border">Subject</th>
                                        <th className="p-2 border">C1</th>
                                        <th className="p-2 border">C2</th>
                                        <th className="p-2 border">Exam</th>
                                        <th className="p-2 border">Final</th>
                                        <th className="p-2 border">Comments</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(c.subjects || []).map((sub) => (
                                        <tr key={sub.name}>
                                          <td className="p-2 border text-gray-600">{sub.name}</td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.C1 || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "C1",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-gray-600"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.C2 || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "C2",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-gray-600"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.exam || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "exam",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-gray-600"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border text-gray-600">
                                            {sub.grades?.final || "N/A"}
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="text"
                                              value={sub.comments || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "comments",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-gray-600"
                                            />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <button
                                    onClick={() => handleUpdateStudent(s.id)}
                                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                                  >
                                    Save Grades
                                  </button>
                                </div>
                              ))}
                          </div>
                        ))
                    ) : (
                      <p className="text-gray-600">Select a student and course to manage grades.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(role === "admin" || role === "accountsadmin") && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold text-blue-600 mb-4">
                  {role === "admin" ? "Admin Dashboard" : "Accounts Admin Dashboard"}
                </h3>
                <p className="text-gray-600 mb-4">
                  Manage student accounts, payments, and clearances.
                </p>
                <div className="mb-6">
                  <input
                    type="text"
                    placeholder="Search by name or ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-3 border rounded text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleDownloadAllBalances}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500"
                  >
                    Download All Balances
                  </button>
                </div>
                {filteredStudents.length ? (
                  <div className="grid grid-cols-1 gap-6">
                    {filteredStudents.map((s) => (
                      <div key={s.id} className="p-6 bg-gray-50 rounded-lg shadow">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <h4 className="text-lg font-medium text-blue-600">{s.name || "Unknown"}</h4>
                            <p className="text-gray-600">ID: {s.id}</p>
                            <p className="text-gray-600">
                              Clearance: {s.clearance ? "Granted ✅" : "Not Granted ❌"}
                            </p>
                            <p className="text-gray-600">
                              Status: {s.active ? "Active 🟢" : "Inactive 🔴"}
                            </p>
                            {role === "admin" && (
                              <p className="text-gray-600">
                                Last Online:{" "}
                                {s.lastOnline
                                  ? new Date(s.lastOnline).toLocaleString()
                                  : "Never"}
                              </p>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleToggleClearance(s.id, s.clearance ?? false)}
                              className={`px-4 py-2 rounded text-white ${
                                s.clearance
                                  ? "bg-red-600 hover:bg-red-500"
                                  : "bg-green-600 hover:bg-green-500"
                              }`}
                            >
                              {s.clearance ? "Remove Clearance" : "Grant Clearance"}
                            </button>
                            <button
                              onClick={() => handleDownloadStudentBalance(s)}
                              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                            >
                              Download Balance
                            </button>
                            {role === "admin" && (
                              <>
                                <button
                                  onClick={() => handleDeactivateAccount(s.id, s.active ?? true)}
                                  className={`px-4 py-2 rounded text-white ${
                                    s.active
                                      ? "bg-yellow-600 hover:bg-yellow-500"
                                      : "bg-green-600 hover:bg-green-500"
                                  }`}
                                >
                                  {s.active ? "Deactivate" : "Reactivate"}
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(s.id)}
                                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => handleResetPassword(s.id, s.email || "")}
                                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500"
                                >
                                  Reset Password
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <h5 className="text-blue-600 font-medium mb-2">Payment History</h5>
                          {s.payments?.length ? (
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-blue-600 text-white">
                                  <th className="p-2 border">Date</th>
                                  <th className="p-2 border">Amount</th>
                                  <th className="p-2 border">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td className="p-2 border text-gray-600">
                                      {new Date(p.date).toLocaleString()}
                                    </td>
                                    <td className="p-2 border text-gray-600">${p.amount.toFixed(2)}</td>
                                    <td className="p-2 border text-gray-600">{p.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-gray-600">No payments recorded.</p>
                          )}
                        </div>
                        <div className="mt-4">
                          <h5 className="text-blue-600 font-medium mb-2">Courses</h5>
                          <p className="text-gray-600">
                            {s.courses?.map((c) => c.name).join(", ") || "None"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center">No students found.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}