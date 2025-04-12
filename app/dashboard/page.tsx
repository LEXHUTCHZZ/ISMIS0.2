// app/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
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
import {
  User,
  StudentData,
  Course,
  Resource,
  Test,
  TestResponse,
  Subject,
  Notification,
  TestCreation,
} from "../../models";
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
  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [newResource, setNewResource] = useState<Resource>({
    id: "",
    name: "",
    type: "",
    url: "",
    uploadDate: "",
    courseId: "",
  });
  const [newTest, setNewTest] = useState<TestCreation>({
    id: "",
    courseId: "",
    title: "",
    questions: [{ question: "", options: [""], correctAnswer: "" }],
    createdAt: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  // Timeout for loading state
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        if (loading) {
          setError("Failed to load data. Please try refreshing the page.");
          setLoading(false);
        }
      }, 10000); // 10 seconds timeout
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser: FirebaseUser | null) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Real-time listener for user data
        const userDocRef = doc(db, "users", currentUser.uid);
        const unsubscribeUser = onSnapshot(
          userDocRef,
          async (userSnap) => {
            if (userSnap.exists()) {
              const fetchedUserData = userSnap.data() as User;
              setUserData(fetchedUserData);
              setRole(fetchedUserData.role || "");
              setUsername(fetchedUserData.name || "Unnamed");
              const hour = new Date().getHours();
              setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Night");

              // Fetch student data if user is a student or teacher
              if (["student", "teacher"].includes(fetchedUserData.role)) {
                const studentDocRef = doc(db, "students", currentUser.uid);
                const unsubscribeStudent = onSnapshot(
                  studentDocRef,
                  (studentSnap) => {
                    if (studentSnap.exists()) {
                      const fetchedStudentData = studentSnap.data() as StudentData;
                      setStudentData({
                        ...fetchedStudentData,
                        transactions: fetchedStudentData.transactions || [],
                        notifications: fetchedStudentData.notifications || [],
                      });
                    } else {
                      setStudentData(null); // No student profile yet
                    }
                    setLoading(false);
                  },
                  (err) => {
                    console.error("Error fetching student data:", err);
                    setError("Failed to load student data.");
                    setLoading(false);
                  }
                );
                return () => unsubscribeStudent();
              } else {
                setStudentData(null);
                setLoading(false);
              }

              // Fetch additional data for teacher/admin roles
              if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role)) {
                // Fetch students from the top-level students collection
                const studentsSnapshot = await getDocs(collection(db, "students"));
                const studentsList = studentsSnapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                  transactions: doc.data().transactions || [],
                  notifications: doc.data().notifications || [],
                } as StudentData));
                setAllStudents(studentsList);

                // Set default selected student for teachers
                if (fetchedUserData.role === "teacher" && studentsList.length > 0 && !selectedStudentId) {
                  const assignedStudent = studentsList.find((s) => s.lecturerId === currentUser.uid);
                  setSelectedStudentId(assignedStudent?.id || studentsList[0]?.id || null);
                }

                // Fetch lecturers
                const usersSnapshot = await getDocs(collection(db, "users"));
                const lecturersList = usersSnapshot.docs
                  .map((doc) => ({ id: doc.id, ...doc.data() } as User))
                  .filter((u) => u.role === "teacher");
                setAllLecturers(lecturersList);

                // Fetch courses
                const coursesSnapshot = await getDocs(collection(db, "courses"));
                const coursesList = await Promise.all(
                  coursesSnapshot.docs.map(async (courseDoc) => {
                    const courseData = courseDoc.data() as Omit<Course, "id" | "resources" | "tests">;
                    const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
                    const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
                    const resources = resourcesSnapshot.docs.map((doc) => ({
                      id: doc.id,
                      ...doc.data(),
                    } as Resource));
                    const tests = await Promise.all(
                      testsSnapshot.docs.map(async (testDoc) => {
                        const testData = testDoc.data() as Omit<Test, "id">;
                        if (fetchedUserData.role === "student") {
                          const responseSnap = await getDoc(
                            doc(db, "courses", courseDoc.id, "tests", testDoc.id, "responses", currentUser.uid)
                          );
                          const response = responseSnap.exists() ? (responseSnap.data() as TestResponse) : null;
                          if (response) {
                            setTestResponses((prev) => ({ ...prev, [testDoc.id]: response }));
                          }
                        }
                        return { id: testDoc.id, ...testData } as Test;
                      })
                    );
                    return { id: courseDoc.id, ...courseData, resources, tests } as Course;
                  })
                );
                setAllCourses(coursesList);
              }
            } else {
              setError("User profile not found. Please contact support.");
              setUserData(null);
              setRole("");
              setLoading(false);
            }
          },
          (err) => {
            console.error("Error fetching user data:", err);
            setError("Failed to load user data.");
            setUserData(null);
            setRole("");
            setLoading(false);
          }
        );

        return () => unsubscribeUser();
      } catch (err) {
        console.error("Error in useEffect:", err);
        setError("An unexpected error occurred.");
        setUserData(null);
        setRole("");
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [user, router, selectedStudentId]);

  const calculateCourseAverage = (subjects: Subject[] | undefined): string => {
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) return "N/A";
    const validGrades = subjects
      .map((s) => parseFloat(s.grades?.final || "0"))
      .filter((g) => !isNaN(g));
    return validGrades.length ? (validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length).toFixed(2) : "N/A";
  };

  const handleGradeUpdate = useCallback(
    (studentId: string, courseName: string, subjectName: string, field: string, value: string) => {
      if (!["teacher", "admin"].includes(role) || !user) return;
      setAllStudents((prev) =>
        prev.map((s) => {
          if (s.id !== studentId || (role === "teacher" && s.lecturerId !== user.uid)) return s;
          const updatedCourses = (s.courses || []).map((c) => {
            if (c.name !== courseName) return c;
            const updatedSubjects = (c.subjects || []).map((sub) => {
              if (sub.name !== subjectName) return sub;
              if (field === "comments") return { ...sub, comments: value };
              const updatedGrades = { ...sub.grades, [field]: value };
              const classworkKeys = Object.keys(updatedGrades).filter((k) => k.startsWith("C"));
              const classworkValues = classworkKeys
                .map((k) => parseFloat(updatedGrades[k] || "0"))
                .filter((v) => !isNaN(v));
              const exam = parseFloat(updatedGrades.exam || "0");
              if (classworkValues.length && !isNaN(exam)) {
                const classworkAvg = classworkValues.reduce((sum, v) => sum + v, 0) / classworkValues.length;
                updatedGrades.final = (classworkAvg * 0.4 + exam * 0.6).toFixed(2);
              }
              return { ...sub, grades: updatedGrades };
            });
            return { ...c, subjects: updatedSubjects };
          });
          return { ...s, courses: updatedCourses };
        })
      );
    },
    [role, user]
  );

  const handleUpdateStudent = async (studentId: string) => {
    if (!user) return;
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return alert("Student not found.");
    if (role === "teacher" && studentToUpdate.lecturerId !== user.uid) {
      return alert("You can only update grades for students assigned to you.");
    }
    try {
      await updateDoc(doc(db, "students", studentId), { courses: studentToUpdate.courses || [] });
      alert("Grades updated successfully!");
    } catch (err) {
      console.error("Failed to update student:", err);
      alert("Failed to update grades. Please try again.");
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s)));
      alert("Clearance granted!");
    } catch (err) {
      console.error("Failed to grant clearance:", err);
      alert("Failed to grant clearance. Please try again.");
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s)));
      alert("Clearance removed!");
    } catch (err) {
      console.error("Failed to remove clearance:", err);
      alert("Failed to remove clearance. Please try again.");
    }
  };

  const handlePaymentSuccess = () => window.location.reload();

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || !user) return;
    const isAlreadyEnrolled = studentData.courses?.some((c) => c.name === course.name) || false;
    if (isAlreadyEnrolled) return alert("You are already enrolled in this course!");
    const courseToEnroll: Course = {
      ...course,
      subjects: course.subjects?.map((sub) => ({ name: sub.name, grades: {}, comments: "" })) || [],
    };
    const updatedCourses = [...(studentData.courses || []), courseToEnroll];
    try {
      await updateDoc(doc(db, "students", user.uid), { courses: updatedCourses });
      setStudentData((prev) => (prev ? { ...prev, courses: updatedCourses } : prev));
      alert("Enrolled successfully!");
    } catch (err) {
      console.error("Failed to enroll course:", err);
      alert("Failed to enroll. Please try again.");
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    if (!["teacher", "admin"].includes(role) || !user) return;
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate || (role === "teacher" && studentToUpdate.lecturerId !== user.uid)) return;
    const updatedCourses = (studentToUpdate.courses || []).map((c) =>
      c.name === courseName
        ? { ...c, subjects: [...(c.subjects || []), { name: subjectName, grades: {}, comments: "" }] }
        : c
    );
    try {
      await updateDoc(doc(db, "students", studentId), { courses: updatedCourses });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, courses: updatedCourses } : s)));
      alert("Subject added!");
    } catch (err) {
      console.error("Failed to add subject:", err);
      alert("Failed to add subject. Please try again.");
    }
  };

  const handleAddCourse = async (courseName: string, fee: number) => {
    if (role !== "admin" || !courseName || isNaN(fee)) return;
    try {
      const courseRef = doc(collection(db, "courses"));
      const newCourse: Course = { id: courseRef.id, name: courseName, fee, subjects: [], resources: [], tests: [] };
      await setDoc(courseRef, newCourse);
      setAllCourses((prev) => [...prev, newCourse]);
      alert("Course added!");
    } catch (err) {
      console.error("Failed to add course:", err);
      alert("Failed to add course. Please try again.");
    }
  };

  const handleAddStudent = async (name: string, email: string, lecturerId: string) => {
    if (role !== "admin" || !name || !email) return;
    try {
      const studentRef = doc(collection(db, "students"));
      const newStudent: StudentData = {
        id: studentRef.id,
        name,
        email,
        lecturerId: lecturerId || null,
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
      setAllStudents((prev) => [...prev, newStudent]);
      alert("Student added successfully!");
    } catch (err) {
      console.error("Failed to add student:", err);
      alert("Failed to add student. Please try again.");
    }
  };

  const handleAssignLecturer = async (studentId: string, lecturerId: string) => {
    if (!["admin", "teacher"].includes(role) || !user) return;
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return alert("Student not found.");
    if (role === "teacher" && studentToUpdate.lecturerId && studentToUpdate.lecturerId !== user.uid) {
      return alert("This student is already assigned to another teacher. Please contact an admin to reassign.");
    }
    try {
      await updateDoc(doc(db, "students", studentId), { lecturerId: lecturerId || null });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, lecturerId: lecturerId || null } : s)));
      alert("Lecturer assigned successfully!");
    } catch (err) {
      console.error("Failed to assign lecturer:", err);
      alert("Failed to assign lecturer. Please try again.");
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (role !== "admin" || !message) return;
    try {
      const notificationRef = collection(db, "students", studentId, "notifications");
      const newNotification: Notification = { id: "", message, date: new Date().toISOString(), read: false };
      const notificationDoc = await addDoc(notificationRef, newNotification);
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, notifications: [...(s.notifications || []), { ...newNotification, id: notificationDoc.id }] }
            : s
        )
      );
      alert("Notification sent!");
    } catch (err) {
      console.error("Failed to send notification:", err);
      alert("Failed to send notification. Please try again.");
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user) return;
    setTestResponses((prev) => ({
      ...prev,
      [testId]: {
        id: user.uid,
        answers: { ...(prev[testId]?.answers || {}), [questionIndex]: answer },
        submittedAt: prev[testId]?.submittedAt || null,
        score: prev[testId]?.score || 0,
      },
    }));
  };

  const handleSubmitTest = async (courseId: string, testId: string) => {
    if (!user || !testResponses[testId]) return;
    try {
      const testDocRef = doc(db, "courses", courseId, "tests", testId);
      const testSnap = await getDoc(testDocRef);
      const testData = testSnap.exists() ? (testSnap.data() as Test) : null;
      if (!testData) return alert("Test not found.");
      let score = 0;
      const totalQuestions = testData.questions.length;
      testData.questions.forEach((q, idx) => {
        if (testResponses[testId].answers[idx] === q.correctAnswer) score += 1;
      });
      const percentage = (score / totalQuestions) * 100;
      const responseRef = doc(db, "courses", courseId, "tests", testId, "responses", user.uid);
      const responseData: TestResponse = {
        ...testResponses[testId],
        score: percentage,
        submittedAt: new Date().toISOString(),
      };
      await setDoc(responseRef, responseData);
      setTestResponses((prev) => ({ ...prev, [testId]: responseData }));
      alert(`Test submitted successfully! Your score: ${percentage.toFixed(2)}%`);
    } catch (err) {
      console.error("Failed to submit test:", err);
      alert("Failed to submit test. Please try again.");
    }
  };

  const handleUploadResource = async () => {
    if (!["teacher", "admin"].includes(role) || !newResource.courseId || !newResource.name || !newResource.type || !newResource.url) {
      alert("Please fill in all resource fields and select a course.");
      return;
    }
    try {
      new URL(newResource.url);
    } catch {
      alert("Please enter a valid URL.");
      return;
    }
    try {
      const resourceRef = doc(collection(db, "courses", newResource.courseId, "resources"));
      const newResourceData: Resource = {
        id: resourceRef.id,
        name: newResource.name,
        type: newResource.type,
        url: newResource.url,
        uploadDate: new Date().toISOString(),
        courseId: newResource.courseId,
      };
      await setDoc(resourceRef, newResourceData);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === newResource.courseId ? { ...c, resources: [...(c.resources || []), newResourceData] } : c
        )
      );
      setNewResource({ id: "", name: "", type: "", url: "", uploadDate: "", courseId: "" });
      alert("Resource uploaded successfully!");
    } catch (err) {
      console.error("Failed to upload resource:", err);
      alert("Failed to upload resource. Please try again.");
    }
  };

  const handleCreateTest = async () => {
    if (!["teacher", "admin"].includes(role) || !newTest.courseId || !newTest.title) {
      alert("Please select a course and enter a test title.");
      return;
    }
    for (const q of newTest.questions) {
      if (!q.question || !q.correctAnswer) {
        alert("All questions must have a question text and a correct answer.");
        return;
      }
      if (q.options.length > 1 && q.options.some((opt) => !opt)) {
        alert("All multiple-choice options must be filled.");
        return;
      }
    }
    try {
      const testRef = doc(collection(db, "courses", newTest.courseId, "tests"));
      const newTestData: Test = {
        id: testRef.id,
        title: newTest.title,
        questions: newTest.questions,
        createdAt: new Date().toISOString(),
      };
      await setDoc(testRef, newTestData);
      setAllCourses((prev) =>
        prev.map((c) => (c.id === newTest.courseId ? { ...c, tests: [...(c.tests || []), newTestData] } : c))
      );
      setNewTest({ id: "", courseId: "", title: "", questions: [{ question: "", options: [""], correctAnswer: "" }], createdAt: "" });
      alert("Test created successfully!");
    } catch (err) {
      console.error("Failed to create test:", err);
      alert("Failed to create test. Please try again.");
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Financial Report", 20, 20);
    const data = allStudents.map((s) => [
      s.name || "N/A",
      s.totalOwed.toLocaleString(),
      s.totalPaid.toLocaleString(),
      s.balance.toLocaleString(),
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

  const filteredStudents = allStudents.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <p className="text-red-800 text-center">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="text-red-800 text-center">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!userData || !role) {
    return <p className="text-red-800 text-center">Please log in again.</p>;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li>
            <Link href="/dashboard" className="text-red-800 hover:underline">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/profile" className="text-red-800 hover:underline">
              Profile
            </Link>
          </li>
        </ul>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <img
                src={
                  userData.profilePicture ||
                  "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                }
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) =>
                  (e.currentTarget.src =
                    "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")
                }
              />
              <div>
                <h2 className="text-2xl font-bold text-red-800">
                  {greeting}, {username}
                </h2>
                <p className="text-red-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {role === "admin" && (
            <div className="mb-6">
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-red-800 mb-4">Search Students</h3>
                <input
                  type="text"
                  placeholder="Search by student name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border rounded text-red-800"
                />
                {searchQuery && (
                  <div className="mt-4">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <div key={student.id} className="flex items-center space-x-4 p-2 border-b">
                          <img
                            src={
                              student.profilePicture ||
                              "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                            }
                            alt={student.name}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) =>
                              (e.currentTarget.src =
                                "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")
                            }
                          />
                          <div>
                            <p className="text-red-800 font-medium">{student.name}</p>
                            <p className="text-red-800 text-sm">Email: {student.email}</p>
                            <p className="text-red-800 text-sm">ID: {student.idNumber || "N/A"}</p>
                            <p className="text-red-800 text-sm">Phone: {student.phoneNumber || "N/A"}</p>
                            <p className="text-red-800 text-sm">Address: {student.homeAddress || "N/A"}</p>
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
          )}

          {role === "student" && (
            <div className="space-y-6">
              {!studentData ? (
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-red-800 text-center">
                    No student profile found. Contact support to set up your account.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Notifications</h3>
                      {studentData.notifications.length ? (
                        studentData.notifications.map((notif) => (
                          <div key={notif.id || notif.date} className="flex justify-between items-center mb-2">
                            <p className={`text-red-800 ${notif.read ? "opacity-50" : "font-bold"}`}>
                              {new Date(notif.date).toLocaleString()}: {notif.message || "No message"}
                            </p>
                            {!notif.read && (
                              <button
                                onClick={async () => {
                                  if (!user || !notif.id) return;
                                  await markNotificationAsRead(user.uid, notif.id);
                                  setStudentData((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          notifications: prev.notifications.map((n) =>
                                            n.id === notif.id ? { ...n, read: true } : n
                                          ),
                                        }
                                      : prev
                                  );
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
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Your Grades</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => (
                          <div key={c.name} className="mb-4">
                            <p className="text-red-800 font-medium">
                              {c.name} (Fee: {c.fee.toLocaleString()} JMD)
                            </p>
                            <table className="w-full mt-2 border-collapse">
                              <thead>
                                <tr className="bg-red-800 text-white">
                                  <th className="p-2 border">Subject</th>
                                  <th className="p-2 border">Classwork</th>
                                  <th className="p-2 border">Exam</th>
                                  <th className="p-2 border">Final</th>
                                  <th className="p-2 border">Comments</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.subjects || []).map((sub) => (
                                  <tr key={sub.name}>
                                    <td className="p-2 border text-red-800">{sub.name}</td>
                                    <td className="p-2 border text-red-800">
                                      {Object.keys(sub.grades || {})
                                        .filter((k) => k.startsWith("C"))
                                        .map((k) => sub.grades![k] || "N/A")
                                        .join(", ") || "N/A"}
                                    </td>
                                    <td className="p-2 border text-red-800">{sub.grades?.exam || "N/A"}</td>
                                    <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                    <td className="p-2 border text-red-800">{sub.comments || "No comments"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="mt-2 text-red-800">Average: {calculateCourseAverage(c.subjects)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see grades.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Course Resources</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          return (
                            <div key={c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name}</p>
                              {enrolledCourse?.resources?.length ? (
                                <ul className="list-disc pl-5">
                                  {enrolledCourse.resources.map((resource) => (
                                    <li key={resource.id} className="text-red-800">
                                      <a
                                        href={resource.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                      >
                                        {resource.name} ({resource.type})
                                      </a>
                                      {" - Uploaded: " + new Date(resource.uploadDate).toLocaleString()}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-red-800">No resources available.</p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see resources.</p>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Course Tests</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          if (!enrolledCourse) return null;
                          return (
                            <div key={c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name}</p>
                              {enrolledCourse.tests?.length ? (
                                enrolledCourse.tests.map((test) => (
                                  <div key={test.id} className="mt-2">
                                    <p className="text-red-800 font-medium">{test.title}</p>
                                    {testResponses[test.id]?.submittedAt ? (
                                      <p className="text-red-800">
                                        Submitted on: {new Date(testResponses[test.id].submittedAt!).toLocaleString()}
                                        <br />
                                        Score: {testResponses[test.id].score?.toFixed(2)}%
                                      </p>
                                    ) : (
                                      <>
                                        {test.questions.map((q, idx) => (
                                          <div key={idx} className="mt-2">
                                            <p className="text-red-800">
                                              {idx + 1}. {q.question}
                                            </p>
                                            {q.options?.length > 1 ? (
                                              q.options.map((opt, optIdx) => (
                                                <label key={optIdx} className="block text-red-800">
                                                  <input
                                                    type="radio"
                                                    name={`${test.id}-${idx}`}
                                                    value={opt}
                                                    checked={testResponses[test.id]?.answers?.[idx] === opt}
                                                    onChange={(e) => handleTestAnswerChange(test.id, idx, e.target.value)}
                                                    className="mr-2"
                                                  />
                                                  {opt}
                                                </label>
                                              ))
                                            ) : (
                                              <input
                                                type="text"
                                                value={testResponses[test.id]?.answers?.[idx] || ""}
                                                onChange={(e) => handleTestAnswerChange(test.id, idx, e.target.value)}
                                                className="w-full p-2 border rounded text-red-800"
                                                placeholder="Your answer"
                                              />
                                            )}
                                          </div>
                                        ))}
                                        <button
                                          onClick={() => handleSubmitTest(enrolledCourse.id, test.id)}
                                          className="mt-2 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                          disabled={!testResponses[test.id]?.answers}
                                        >
                                          Submit Test
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="text-red-800">No tests available.</p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see tests.</p>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Payments</h3>
                      <p className="text-red-800">Balance: {studentData.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {studentData.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                      <div className="mt-2">
                        <h4 className="text-red-800 font-medium">Transaction History</h4>
                        {studentData.transactions.length ? (
                          studentData.transactions.map((txn) => (
                            <p key={txn.id || txn.date} className="text-red-800">
                              {new Date(txn.date).toLocaleString()}: {txn.amount.toLocaleString()} JMD - {txn.status}
                            </p>
                          ))
                        ) : (
                          <p className="text-red-800">No transactions.</p>
                        )}
                      </div>
                      <CheckoutPage onPaymentSuccess={handlePaymentSuccess} />
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Enroll in Courses</h3>
                      {allCourses.length ? (
                        allCourses.map((course) => (
                          <div key={course.id} className="mb-2 flex justify-between items-center">
                            <p className="text-red-800">
                              {course.name} (Fee: {course.fee.toLocaleString()} JMD)
                            </p>
                            <button
                              onClick={() => handleEnrollCourse(course)}
                              className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                              disabled={studentData.courses?.some((c) => c.name === course.name) || false}
                            >
                              {studentData.courses?.some((c) => c.name === course.name) ? "Already Enrolled" : "Enroll"}
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No courses available.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {role === "teacher" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Assign Students</h3>
                    {allStudents.length ? (
                      allStudents
                        .filter((s) => !s.lecturerId)
                        .map((s) => (
                          <div key={s.id} className="flex justify-between mb-2">
                            <p className="text-red-800">{s.name}</p>
                            <button
                              onClick={() => user && handleAssignLecturer(s.id, user.uid)}
                              className="px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                            >
                              Assign
                            </button>
                          </div>
                        ))
                    ) : (
                      <p className="text-red-800">No students available.</p>
                    )}
                    {!allStudents.some((s) => !s.lecturerId) && (
                      <p className="text-red-800">No unassigned students.</p>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Upload Resources</h3>
                    <select
                      value={newResource.type}
                      onChange={(e) => setNewResource({ ...newResource, type: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    >
                      <option value="">Resource Type</option>
                      <option value="YouTube Video">YouTube Video</option>
                      <option value="PDF">PDF</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newResource.name}
                      onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={newResource.url}
                      onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    />
                    <select
                      value={newResource.courseId}
                      onChange={(e) => setNewResource({ ...newResource, courseId: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    >
                      <option value="">Select Course</option>
                      {allCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleUploadResource}
                      className="px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Upload
                    </button>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Create Tests</h3>
                    <select
                      value={newTest.courseId}
                      onChange={(e) => setNewTest({ ...newTest, courseId: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    >
                      <option value="">Select Course</option>
                      {allCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Test Title"
                      value={newTest.title}
                      onChange={(e) => setNewTest({ ...newTest, title: e.target.value })}
                      className="w-full p-2 border rounded text-red-800 mb-2"
                    />
                    {newTest.questions.map((q, qIdx) => (
                      <div key={qIdx} className="mb-2 border p-2 rounded">
                        <input
                          type="text"
                          placeholder={`Question ${qIdx + 1}`}
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...newTest.questions];
                            updated[qIdx].question = e.target.value;
                            setNewTest({ ...newTest, questions: updated });
                          }}
                          className="w-full p-1 border rounded text-red-800 mb-1"
                        />
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex mb-1">
                            <input
                              type="text"
                              placeholder={`Option ${optIdx + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const updated = [...newTest.questions];
                                updated[qIdx].options[optIdx] = e.target.value;
                                setNewTest({ ...newTest, questions: updated });
                              }}
                              className="w-full p-1 border rounded text-red-800 mr-1"
                            />
                            <button
                              onClick={() => {
                                const updated = [...newTest.questions];
                                updated[qIdx].options.splice(optIdx, 1);
                                setNewTest({ ...newTest, questions: updated });
                              }}
                              className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                            >
                              X
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const updated = [...newTest.questions];
                            updated[qIdx].options.push("");
                            setNewTest({ ...newTest, questions: updated });
                          }}
                          className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700 mb-1"
                        >
                          Add Option
                        </button>
                        <input
                          type="text"
                          placeholder="Correct Answer"
                          value={q.correctAnswer}
                          onChange={(e) => {
                            const updated = [...newTest.questions];
                            updated[qIdx].correctAnswer = e.target.value;
                            setNewTest({ ...newTest, questions: updated });
                          }}
                          className="w-full p-1 border rounded text-red-800 mb-1"
                        />
                        <button
                          onClick={() => {
                            const updated = [...newTest.questions];
                            updated.splice(qIdx, 1);
                            setNewTest({ ...newTest, questions: updated });
                          }}
                          className="px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setNewTest({
                          ...newTest,
                          questions: [...newTest.questions, { question: "", options: [""], correctAnswer: "" }],
                        })
                      }
                      className="px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700 mr-2"
                    >
                      Add Question
                    </button>
                    <button
                      onClick={handleCreateTest}
                      className="px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Create
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Manage Grades</h3>
                    {allStudents.length ? (
                      <select
                        value={selectedStudentId || ""}
                        onChange={(e) => setSelectedStudentId(e.target.value || null)}
                        className="w-full p-2 border rounded text-red-800 mb-4"
                      >
                        <option value="">Select Student</option>
                        {allStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-red-800">No students available.</p>
                    )}
                    {selectedStudentId &&
                      allStudents
                        .filter((s) => s.id === selectedStudentId)
                        .map((s) => (
                          <div key={s.id}>
                            <p className="text-lg font-medium text-red-800 mb-2">{s.name}</p>
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
                                            onChange={(e) =>
                                              handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)
                                            }
                                            className="w-full p-1 border rounded text-red-800"
                                            min="0"
                                            max="100"
                                            disabled={s.lecturerId !== user?.uid}
                                          />
                                        </td>
                                        <td className="p-1 border">
                                          <input
                                            type="number"
                                            value={sub.grades?.C2 || ""}
                                            onChange={(e) =>
                                              handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)
                                            }
                                            className="w-full p-1 border rounded text-red-800"
                                            min="0"
                                            max="100"
                                            disabled={s.lecturerId !== user?.uid}
                                          />
                                        </td>
                                        <td className="p-1 border">
                                          <input
                                            type="number"
                                            value={sub.grades?.exam || ""}
                                            onChange={(e) =>
                                              handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)
                                            }
                                            className="w-full p-1 border rounded text-red-800"
                                            min="0"
                                            max="100"
                                            disabled={s.lecturerId !== user?.uid}
                                          />
                                        </td>
                                        <td className="p-1 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                        <td className="p-1 border">
                                          <input
                                            type="text"
                                            value={sub.comments || ""}
                                            onChange={(e) =>
                                              handleGradeUpdate(s.id, c.name, sub.name, "comments", e.target.value)
                                            }
                                            className="w-full p-1 border rounded text-red-800"
                                            placeholder="Comments"
                                            disabled={s.lecturerId !== user?.uid}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <input
                                  type="text"
                                  placeholder="Add subject"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.currentTarget.value && s.lecturerId === user?.uid) {
                                      handleAddSubject(s.id, c.name, e.currentTarget.value);
                                      e.currentTarget.value = "";
                                    }
                                  }}
                                  className="mt-2 p-1 border rounded text-red-800"
                                  disabled={s.lecturerId !== user?.uid}
                                />
                                {s.lecturerId === user?.uid ? (
                                  <button
                                    onClick={() => handleUpdateStudent(s.id)}
                                    className="mt-2 px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
                                  >
                                    Save
                                  </button>
                                ) : (
                                  <p className="mt-2 text-red-800">Only assigned teachers can edit grades.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Analytics</h3>
                    <p className="text-red-800">Total Students: {allStudents.length}</p>
                    <p className="text-red-800">Total Courses: {allCourses.length}</p>
                    <p className="text-red-800">
                      Total Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()} JMD
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Add New Student</h3>
                    <input
                      type="text"
                      placeholder="Student Name"
                      id="new-student-name"
                      className="p-2 border rounded text-red-800 mb-2 w-full"
                    />
                    <input
                      type="email"
                      placeholder="Student Email"
                      id="new-student-email"
                      className="p-2 border rounded text-red-800 mb-2 w-full"
                    />
                    <select id="new-student-lecturer" className="p-2 border rounded text-red-800 mb-2 w-full">
                      <option value="">No Lecturer</option>
                      {allLecturers.map((lecturer) => (
                        <option key={lecturer.id} value={lecturer.id}>
                          {lecturer.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const name = (document.getElementById("new-student-name") as HTMLInputElement)?.value || "";
                        const email = (document.getElementById("new-student-email") as HTMLInputElement)?.value || "";
                        const lecturerId = (document.getElementById("new-student-lecturer") as HTMLSelectElement)?.value || "";
                        handleAddStudent(name, email, lecturerId);
                      }}
                      className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                    >
                      Add Student
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-800 mb-4">Add New Course</h3>
                    <input
                      type="text"
                      placeholder="Course Name"
                      id="new-course-name"
                      className="p-2 border rounded text-red-800 mb-2 w-full"
                    />
                    <input
                      type="number"
                      placeholder="Fee (JMD)"
                      id="new-course-fee"
                      className="p-2 border rounded text-red-800 mb-2 w-full"
                    />
                    <button
                      onClick={() => {
                        const name = (document.getElementById("new-course-name") as HTMLInputElement)?.value || "";
                        const fee = parseFloat((document.getElementById("new-course-fee") as HTMLInputElement)?.value || "0");
                        handleAddCourse(name, fee);
                      }}
                      className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                    >
                      Add Course
                    </button>
                  </div>
                </div>
                <div className="space-y-6">
                  {allStudents.length ? (
                    allStudents.map((s) => (
                      <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                        <div className="flex items-center space-x-4 mb-2">
                          <img
                            src={
                              s.profilePicture ||
                              "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                            }
                            alt={s.name}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) =>
                              (e.currentTarget.src =
                                "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")
                            }
                          />
                          <p className="text-lg font-medium text-red-800">{s.name}</p>
                        </div>
                        <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                        <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                        <div className="mt-2">
                          <label className="text-red-800 mr-2">Assign Lecturer:</label>
                          <select
                            value={s.lecturerId || ""}
                            onChange={(e) => handleAssignLecturer(s.id, e.target.value)}
                            className="p-2 border rounded text-red-800"
                          >
                            <option value="">No Lecturer</option>
                            {allLecturers.map((lecturer) => (
                              <option key={lecturer.id} value={lecturer.id}>
                                {lecturer.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {(s.courses || []).map((c) => (
                          <div key={c.name} className="mb-4 mt-4">
                            <p className="text-red-800 font-medium">{c.name}</p>
                            <table className="w-full mt-2 border-collapse">
                              <thead>
                                <tr className="bg-red-800 text-white">
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
                                    <td className="p-2 border text-red-800">{sub.name}</td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C1 || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)
                                        }
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C2 || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)
                                        }
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.exam || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)
                                        }
                                        className="w-full p-1 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                    <td className="p-2 border">
                                      <input
                                        type="text"
                                        value={sub.comments || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "comments", e.target.value)
                                        }
                                        className="w-full p-1 border rounded text-red-800"
                                        placeholder="Add comments"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mt-2">
                              <input
                                type="text"
                                placeholder="Add new subject"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.currentTarget.value) {
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
                        <div className="mt-2">
                          <input
                            type="text"
                            placeholder="Send notification"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && e.currentTarget.value) {
                                handleSendNotification(s.id, e.currentTarget.value);
                                e.currentTarget.value = "";
                              }
                            }}
                            className="p-2 border rounded text-red-800 mr-2 w-full"
                          />
                        </div>
                        <div className="flex gap-4 mt-2">
                          <button
                            onClick={() => handleGrantClearance(s.id)}
                            disabled={s.clearance}
                            className={`px-4 py-2 rounded-md text-white ${
                              s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                            }`}
                          >
                            Grant Clearance
                          </button>
                          <button
                            onClick={() => handleRemoveClearance(s.id)}
                            disabled={!s.clearance}
                            className={`px-4 py-2 rounded-md text-white ${
                              !s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                            }`}
                          >
                            Remove Clearance
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <p className="text-red-800">No students available.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {role === "accountsadmin" && (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-red-800 mb-4">Financial Overview</h3>
                <p className="text-red-800">Total Students: {allStudents.length}</p>
                <p className="text-red-800">
                  Total Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()} JMD
                </p>
                <button
                  onClick={downloadFinancialReport}
                  className="mt-4 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                >
                  Download Financial Report
                </button>
              </div>
              <div className="space-y-4">
                {allStudents.length ? (
                  allStudents.map((s) => (
                    <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                      <div className="flex items-center space-x-4 mb-2">
                        <img
                          src={
                            s.profilePicture ||
                            "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                          }
                          alt={s.name}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) =>
                            (e.currentTarget.src =
                              "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")
                          }
                        />
                        <p className="text-lg font-medium text-red-800">{s.name}</p>
                      </div>
                      <p className="text-red-800">Total Owed: {s.totalOwed.toLocaleString()} JMD</p>
                      <p className="text-red-800">Total Paid: {s.totalPaid.toLocaleString()} JMD</p>
                      <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {s.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                      <div className="flex gap-4 mt-2">
                        <button
                          onClick={() => handleGrantClearance(s.id)}
                          disabled={s.clearance}
                          className={`px-4 py-2 rounded-md text-white ${
                            s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                          }`}
                        >
                          Grant Clearance
                        </button>
                        <button
                          onClick={() => handleRemoveClearance(s.id)}
                          disabled={!s.clearance}
                          className={`px-4 py-2 rounded-md text-white ${
                            !s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                          }`}
                        >
                          Remove Clearance
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-red-800">No students available.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}