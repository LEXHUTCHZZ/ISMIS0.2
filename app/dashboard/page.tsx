"use client";

import { useEffect, useState, useRef } from "react";
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
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  StudentData,
  Course,
  Subject,
  Transaction,
  Notification,
  Resource,
  Test,
  TestResponse,
  User,
} from "../../models";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  sanitizeStudentData,
  sanitizeCourse,
  sanitizeUser,
  sanitizeResource,
  sanitizeTest,
  sanitizeTransaction,
  sanitizeNotification,
} from "../../utils/firestoreSanitizer"; // Ensure this file exists or update the path

// If the file does not exist, create it at the specified path or update the import path to the correct location.

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isMounted = useRef<boolean>(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser || !isMounted.current) {
        if (isMounted.current) router.push("/auth/login");
        return;
      }

      setIsLoading(true);
      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
          console.error("User document does not exist");
          if (isMounted.current) {
            setUserData(null);
            setError("User profile not found. Please contact support.");
          }
          return;
        }

        const fetchedUserData = sanitizeUser(userSnap.data());
        if (isMounted.current) {
          setRole(fetchedUserData.role || "");
          setUsername(fetchedUserData.name || "Unnamed");
          setUserData(fetchedUserData);
          const hour = new Date().getHours();
          setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening");
        }

        if (fetchedUserData.role === "student" && isMounted.current) {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          if (studentSnap.exists()) {
            const fetchedStudentData = sanitizeStudentData(studentSnap.data());
            if (isMounted.current) {
              setStudentData({
                ...fetchedStudentData,
                transactions: fetchedStudentData.transactions || [],
                notifications: fetchedStudentData.notifications || [],
              });
            }
          } else {
            console.warn("Student document not found for student user");
            if (isMounted.current) setStudentData(null);
          }

          try {
            const coursesSnapshot = await getDocs(collection(db, "courses"));
            const coursesList = await Promise.all(
              coursesSnapshot.docs.map(async (courseDoc) => {
                const courseData = courseDoc.data();
                const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
                const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
                const resources = resourcesSnapshot.docs.map((doc) => sanitizeResource({ id: doc.id, ...doc.data() }));
                const tests = await Promise.all(
                  testsSnapshot.docs.map(async (testDoc) => {
                    const testData = sanitizeTest(testDoc.data());
                    const responseSnap = await getDoc(doc(db, "courses", courseDoc.id, "tests", testDoc.id, "responses", currentUser.uid));
                    const response = responseSnap.exists() ? (responseSnap.data() as TestResponse) : null;
                    if (response && isMounted.current) {
                      setTestResponses((prev) => ({ ...prev, [testDoc.id]: response }));
                    }
                    return { ...testData, id: testDoc.id };
                  })
                );
                return sanitizeCourse({ id: courseDoc.id, ...courseData, resources, tests });
              })
            );
            if (isMounted.current) setAllCourses(coursesList);
          } catch (courseError) {
            console.error("Error fetching courses:", courseError);
            if (isMounted.current) setAllCourses([]);
          }
        }

        if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role) && isMounted.current) {
          try {
            const studentsSnapshot = await getDocs(collection(db, "students"));
            const studentsList = await Promise.all(
              studentsSnapshot.docs.map(async (studentDoc) => {
                const studentData = studentDoc.data();
                const transactionsRef = collection(studentDoc.ref, "transactions");
                const transactionsSnap = await getDocs(transactionsRef);
                const transactions = transactionsSnap.docs.map((doc) => sanitizeTransaction({ id: doc.id, ...doc.data() }));
                const notificationsRef = collection(studentDoc.ref, "notifications");
                const notificationsSnap = await getDocs(notificationsRef);
                const notifications = notificationsSnap.docs.map((doc) => sanitizeNotification({ id: doc.id, ...doc.data() }));
                return sanitizeStudentData({
                  id: studentDoc.id,
                  ...studentData,
                  transactions,
                  notifications,
                });
              })
            );
            if (isMounted.current) setAllStudents(studentsList);
          } catch (studentError) {
            console.error("Error fetching students:", studentError);
            if (isMounted.current) setAllStudents([]);
          }

          try {
            const coursesSnapshot = await getDocs(collection(db, "courses"));
            const coursesList = await Promise.all(
              coursesSnapshot.docs.map(async (courseDoc) => {
                const courseData = courseDoc.data();
                const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
                const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
                const resources = resourcesSnapshot.docs.map((doc) => sanitizeResource({ id: doc.id, ...doc.data() }));
                const tests = testsSnapshot.docs.map((doc) => sanitizeTest({ id: doc.id, ...doc.data() }));
                return sanitizeCourse({ id: courseDoc.id, ...courseData, resources, tests });
              })
            );
            if (isMounted.current) setAllCourses(coursesList);
          } catch (courseError) {
            console.error("Error fetching courses for admin/teacher:", courseError);
            if (isMounted.current) setAllCourses([]);
          }
        }
      } catch (error) {
        console.error("Error in useEffect:", error);
        if (isMounted.current) setError("Failed to load dashboard data. Please try again.");
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [user, router]);

  const calculateCourseAverage = (subjects: Subject[] | undefined): string => {
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) return "N/A";
    const validGrades = subjects
      .map((s) => parseFloat(s.grades?.final || "0"))
      .filter((g) => !isNaN(g));
    return validGrades.length ? (validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length).toFixed(2) : "N/A";
  };

  const handlePaymentSuccess = async (amount: number) => {
    if (!studentData || !user?.uid) return;
    try {
      const updatedBalance = studentData.balance - amount;
      const updatedTotalPaid = studentData.totalPaid + amount;
      const paymentStatus = updatedBalance <= 0 ? "Paid" : "Partial";
      const newTransaction: Transaction = {
        id: new Date().toISOString(),
        amount,
        date: new Date().toISOString(),
        status: "Completed",
      };
      const updatedTransactions = [...studentData.transactions, newTransaction];
      await updateDoc(doc(db, "students", user.uid), {
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: updatedTransactions,
      });
      setStudentData({
        ...studentData,
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: updatedTransactions,
      });
      alert("Payment processed successfully!");
    } catch (err: any) {
      console.error("Error processing payment:", err);
      alert("Failed to update payment: " + err.message);
    }
  };

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || !user?.uid) return;
    const isAlreadyEnrolled = (studentData.courses || []).some((c) => c.name === course.name);
    if (isAlreadyEnrolled) return alert("You are already enrolled in this course!");
    const courseToEnroll: Course = {
      ...course,
      subjects: course.subjects?.map((sub) => ({ name: sub.name, grades: {}, comments: "" })) || [],
    };
    const updatedCourses = [...(studentData.courses || []), courseToEnroll];
    const updatedTotalOwed = studentData.totalOwed + course.fee;
    const updatedBalance = studentData.balance + course.fee;
    try {
      await updateDoc(doc(db, "students", user.uid), {
        courses: updatedCourses,
        totalOwed: updatedTotalOwed,
        balance: updatedBalance,
        paymentStatus: updatedBalance > 0 ? "Partial" : "Paid",
      });
      setStudentData({ ...studentData, courses: updatedCourses, totalOwed: updatedTotalOwed, balance: updatedBalance });
      alert("Enrolled successfully!");
    } catch (err: any) {
      console.error("Error enrolling course:", err);
      alert("Failed to enroll: " + err.message);
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user?.uid) return;
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
    if (!user?.uid || !testResponses[testId]) return alert("Please answer all questions before submitting.");
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
      const responseData: TestResponse = { ...testResponses[testId], score: percentage, submittedAt: new Date().toISOString() };
      await setDoc(responseRef, responseData);
      setTestResponses((prev) => ({ ...prev, [testId]: responseData }));
      alert(`Test submitted successfully! Your score: ${percentage.toFixed(2)}%`);
    } catch (err: any) {
      console.error("Error submitting test:", err);
      alert("Failed to submit test: " + err.message);
    }
  };

  const handleGradeUpdate = (
    studentId: string,
    courseName: string,
    subjectName: string,
    field: string,
    value: string
  ) => {
    if (role !== "teacher" && role !== "admin") return;
    setAllStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          const updatedCourses = (s.courses || []).map((c: Course) => {
            if (c.name === courseName) {
              const updatedSubjects = (c.subjects || []).map((sub: Subject) => {
                if (sub.name === subjectName) {
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
      await updateDoc(doc(db, "students", studentId), {
        courses: studentToUpdate.courses,
      });
      alert("Grades updated successfully!");
    } catch (error: any) {
      console.error("Error updating student grades:", error);
      alert("Failed to update grades: " + error.message);
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    if (role !== "teacher" && role !== "admin") return;
    const studentToUpdate = allStudents.find((s) => s.id === studentId);
    if (!studentToUpdate) return;
    const updatedCourses = (studentToUpdate.courses || []).map((c: Course) => {
      if (c.name === courseName) {
        return {
          ...c,
          subjects: [...(c.subjects || []), { name: subjectName, grades: {}, comments: "" }],
        };
      }
      return c;
    });
    try {
      await updateDoc(doc(db, "students", studentId), { courses: updatedCourses });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, courses: updatedCourses } : s))
      );
      alert("Subject added!");
    } catch (error: any) {
      console.error("Error adding subject:", error);
      alert("Failed to add subject: " + error.message);
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
      );
      alert("Clearance granted!");
    } catch (error: any) {
      console.error("Error granting clearance:", error);
      alert("Failed to grant clearance: " + error.message);
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
      );
      alert("Clearance removed!");
    } catch (error: any) {
      console.error("Error removing clearance:", error);
      alert("Failed to remove clearance: " + error.message);
    }
  };

  const handleAddCourse = async (courseName: string, fee: number) => {
    if (role !== "admin") return;
    try {
      const courseRef = doc(collection(db, "courses"));
      const newCourse: Course = {
        id: courseRef.id,
        name: courseName,
        fee,
        coursework: [],
        subjects: [],
        resources: [],
        tests: [],
      };
      await setDoc(courseRef, newCourse);
      setAllCourses([...allCourses, newCourse]);
      alert("Course added!");
    } catch (error: any) {
      console.error("Error adding course:", error);
      alert("Failed to add course: " + error.message);
    }
  };

  const handleAddStudent = async (name: string, email: string) => {
    if (role !== "admin") return;
    try {
      const studentRef = doc(collection(db, "students"));
      const newStudent: StudentData = {
        id: studentRef.id,
        name,
        email,
        lecturerId: null,
        courses: [],
        totalOwed: 0,
        totalPaid: 0,
        balance: 0,
        paymentStatus: "Unpaid",
        clearance: false,
        transactions: [],
        notifications: [],
        idNumber: undefined,
        phoneNumber: undefined,
        homeAddress: undefined,
        profilePicture: undefined,
      };
      await setDoc(studentRef, newStudent);
      setAllStudents([...allStudents, newStudent]);
      alert("Student added!");
    } catch (error: any) {
      console.error("Error adding student:", error);
      alert("Failed to add student: " + error.message);
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (role !== "admin") return;
    try {
      const notificationRef = collection(db, "students", studentId, "notifications");
      const newNotification: Omit<Notification, "id"> = {
        message,
        date: new Date().toISOString(),
        read: false,
      };
      const docRef = await addDoc(notificationRef, newNotification);
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                notifications: [...s.notifications, { ...newNotification, id: docRef.id }],
              }
            : s
        )
      );
      alert("Notification sent!");
    } catch (error: any) {
      console.error("Error sending notification:", error);
      alert("Failed to send notification: " + error.message);
    }
  };

  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher" && role !== "admin") return;
    try {
      const resourceRef = doc(collection(db, "courses", courseId, "resources"));
      const newResource: Resource = {
        id: resourceRef.id,
        courseId,
        name,
        url,
        type,
        uploadDate: new Date().toISOString(),
      };
      await setDoc(resourceRef, newResource);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, resources: [...(c.resources || []), newResource] } : c
        )
      );
      alert("Resource added!");
    } catch (error: any) {
      console.error("Error adding resource:", error);
      alert("Failed to add resource: " + error.message);
    }
  };

  const handleAddTest = async (courseId: string, title: string, questions: Test["questions"]) => {
    if (role !== "teacher" && role !== "admin") return;
    try {
      const testRef = doc(collection(db, "courses", courseId, "tests"));
      const newTest: Test = {
        id: testRef.id,
        courseId,
        title,
        questions,
        createdAt: new Date().toISOString(),
      };
      await setDoc(testRef, newTest);
      setAllCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, tests: [...(c.tests || []), newTest] } : c))
      );
      alert("Test added!");
    } catch (error: any) {
      console.error("Error adding test:", error);
      alert("Failed to add test: " + error.message);
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Financial Report", 20, 20);

    const data = allStudents.map((s) => [
      s.name || "N/A",
      (s.totalOwed || 0).toLocaleString(),
      (s.totalPaid || 0).toLocaleString(),
      (s.balance || 0).toLocaleString(),
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

  if (isLoading) return <p className="text-red-800 text-center">Loading...</p>;
  if (error) return <p className="text-red-800 text-center">{error}</p>;
  if (userData === null) return <p className="text-red-800 text-center">User data not found. Please log in again.</p>;
  if (!role) return null;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
          {role === "teacher" && (
            <li>
              <Link href="/dashboard/students" className="text-red-800 hover:underline">Students</Link>
            </li>
          )}
          {role === "admin" && (
            <li>
              <Link href="/dashboard/management" className="text-red-800 hover:underline">Management</Link>
            </li>
          )}
          {role === "accountsadmin" && (
            <li>
              <Link href="/dashboard/payments" className="text-red-800 hover:underline">Payments</Link>
            </li>
          )}
        </ul>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <img
                src={userData?.profilePicture || "https://via.placeholder.com/150"}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => (e.currentTarget.src = "https://via.placeholder.com/150")}
              />
              <div>
                <h2 className="text-2xl font-bold text-red-800">{greeting}, {username}</h2>
                <p className="text-red-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {/* Student Dashboard */}
          {role === "student" && (
            <div className="space-y-6">
              {!studentData ? (
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-red-800 text-center">No student profile found. Contact support to set up your account.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Notifications</h3>
                      {studentData.notifications.length ? (
                        studentData.notifications.map((notif: Notification) => (
                          <div key={notif.id || notif.date} className="flex justify-between items-center mb-2">
                            <p className={`text-red-800 ${notif.read ? "opacity-50" : "font-bold"}`}>
                              {new Date(notif.date).toLocaleString()}: {notif.message || "No message"}
                            </p>
                            {!notif.read && (
                              <button
                                onClick={async () => {
                                  if (!user?.uid || !notif.id) return;
                                  await markNotificationAsRead(user.uid, notif.id);
                                  const studentDocRef = doc(db, "students", user.uid);
                                  const studentSnap = await getDoc(studentDocRef);
                                  if (studentSnap.exists() && isMounted.current) {
                                    const fetchedStudentData = sanitizeStudentData(studentSnap.data());
                                    setStudentData({
                                      ...fetchedStudentData,
                                      transactions: fetchedStudentData.transactions || [],
                                      notifications: fetchedStudentData.notifications || [],
                                    });
                                  }
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
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => (
                          <div key={c.id || c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name || "Unnamed Course"} (Fee: {(c.fee || 0).toLocaleString()} JMD)</p>
                            {c.subjects && Array.isArray(c.subjects) && c.subjects.length > 0 ? (
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
                                  {c.subjects.map((sub: Subject) => (
                                    <tr key={sub.name || Math.random()}>
                                      <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
                                      <td className="p-2 border text-red-800">
                                        {sub.grades
                                          ? Object.keys(sub.grades)
                                              .filter((k) => k.startsWith("C"))
                                              .map((k) => sub.grades![k] || "N/A")
                                              .join(", ") || "N/A"
                                          : "N/A"}
                                      </td>
                                      <td className="p-2 border text-red-800">{sub.grades?.exam || "N/A"}</td>
                                      <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                      <td className="p-2 border text-red-800">{sub.comments || "No comments"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-red-800">No subjects assigned.</p>
                            )}
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
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          return (
                            <div key={c.id || c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                              {enrolledCourse?.resources && Array.isArray(enrolledCourse.resources) && enrolledCourse.resources.length > 0 ? (
                                <ul className="list-disc pl-5">
                                  {enrolledCourse.resources.map((resource: Resource) => (
                                    <li key={resource.id} className="text-red-800">
                                      <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                        {resource.name || "Unnamed"} ({resource.type || "Unknown"})
                                      </a>{" "}
                                      - Uploaded: {resource.uploadDate ? new Date(resource.uploadDate).toLocaleString() : "N/A"}
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
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          if (!enrolledCourse) return null;
                          return (
                            <div key={c.id || c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                              {enrolledCourse.tests && Array.isArray(enrolledCourse.tests) && enrolledCourse.tests.length > 0 ? (
                                enrolledCourse.tests.map((test: Test) => (
                                  <div key={test.id} className="mt-2">
                                    <p className="text-red-800 font-medium">{test.title || "Untitled Test"}</p>
                                    {testResponses[test.id]?.submittedAt ? (
                                      <p className="text-red-800">
                                        Submitted on: {new Date(testResponses[test.id].submittedAt!).toLocaleString()}
                                        <br />
                                        Score: {testResponses[test.id].score?.toFixed(2)}%
                                      </p>
                                    ) : (
                                      <>
                                        {test.questions && Array.isArray(test.questions) ? (
                                          test.questions.map((q, idx) => (
                                            <div key={idx} className="mt-2">
                                              <p className="text-red-800">{idx + 1}. {q.question || "No question"}</p>
                                              {q.options && Array.isArray(q.options) && q.options.length > 0 ? (
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
                                          ))
                                        ) : (
                                          <p className="text-red-800">No questions available.</p>
                                        )}
                                        <button
                                          onClick={() => handleSubmitTest(enrolledCourse.id, test.id)}
                                          className="mt-2 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
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
                      <p className="text-red-800">Balance: {(studentData.balance || 0).toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {studentData.paymentStatus || "Unpaid"}</p>
                      <p className="text-red-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                      <div className="mt-2">
                        <h4 className="text-red-800 font-medium">Transaction History</h4>
                        {studentData.transactions.length ? (
                          studentData.transactions.map((txn: Transaction) => (
                            <p key={txn.id || txn.date} className="text-red-800">
                              {new Date(txn.date).toLocaleString()}: {(txn.amount || 0).toLocaleString()} JMD - {txn.status || "Unknown"}
                            </p>
                          ))
                        ) : (
                          <p className="text-red-800">No transactions.</p>
                        )}
                      </div>
                      {studentData.balance > 0 && (
                        <CheckoutPage balance={studentData.balance} onPaymentSuccess={handlePaymentSuccess} />
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Enroll in Courses</h3>
                      {allCourses.length ? (
                        allCourses.map((course: Course) => (
                          <div key={course.id} className="mb-2 flex justify-between items-center">
                            <p className="text-red-800">{course.name || "Unnamed Course"} (Fee: {(course.fee || 0).toLocaleString()} JMD)</p>
                            <button
                              onClick={() => handleEnrollCourse(course)}
                              className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
                              disabled={studentData.courses?.some((c) => c.name === course.name)}
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

          {/* Teacher Dashboard */}
          {role === "teacher" && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-red-800 mb-4">Manage Student Grades and Resources</h3>
              {allStudents.length ? (
                allStudents.map((s: StudentData) => (
                  <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                    {s.courses && Array.isArray(s.courses) && s.courses.length ? (
                      s.courses.map((c: Course) => {
                        const fullCourse = allCourses.find((ac) => ac.name === c.name);
                        return (
                          <div key={c.id || c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                            {c.subjects && Array.isArray(c.subjects) && c.subjects.length ? (
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
                                  {c.subjects.map((sub: Subject) => (
                                    <tr key={sub.name || Math.random()}>
                                      <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
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
                                      <td className="p-2 border text-red-800">{sub.comments || "N/A"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-red-800">No subjects assigned.</p>
                            )}
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
                            {fullCourse && (
                              <div className="mt-4">
                                <h4 className="text-red-800 font-medium">Resources for {c.name}</h4>
                                {fullCourse.resources && Array.isArray(fullCourse.resources) && fullCourse.resources.length ? (
                                  <ul className="list-disc pl-5">
                                    {fullCourse.resources.map((resource: Resource) => (
                                      <li key={resource.id} className="text-red-800">
                                        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                          {resource.name || "Unnamed"} ({resource.type || "Unknown"})
                                        </a>{" "}
                                        - Uploaded: {resource.uploadDate ? new Date(resource.uploadDate).toLocaleString() : "N/A"}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-red-800">No resources available.</p>
                                )}
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    placeholder="Resource Name"
                                    id={`resource-name-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Resource URL"
                                    id={`resource-url-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Resource Type"
                                    id={`resource-type-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <button
                                    onClick={() => {
                                      const name = (document.getElementById(`resource-name-${fullCourse.id}`) as HTMLInputElement).value;
                                      const url = (document.getElementById(`resource-url-${fullCourse.id}`) as HTMLInputElement).value;
                                      const type = (document.getElementById(`resource-type-${fullCourse.id}`) as HTMLInputElement).value;
                                      if (name && url && type) {
                                        handleAddResource(fullCourse.id, name, url, type);
                                        (document.getElementById(`resource-name-${fullCourse.id}`) as HTMLInputElement).value = "";
                                        (document.getElementById(`resource-url-${fullCourse.id}`) as HTMLInputElement).value = "";
                                        (document.getElementById(`resource-type-${fullCourse.id}`) as HTMLInputElement).value = "";
                                      } else {
                                        alert("Please fill in all resource fields.");
                                      }
                                    }}
                                    className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                  >
                                    Add Resource
                                  </button>
                                </div>
                                <h4 className="text-red-800 font-medium mt-4">Tests for {c.name}</h4>
                                {fullCourse.tests && Array.isArray(fullCourse.tests) && fullCourse.tests.length ? (
                                  fullCourse.tests.map((test: Test) => (
                                    <div key={test.id} className="mt-2">
                                      <p className="text-red-800">{test.title || "Untitled Test"}</p>
                                      <ul className="list-disc pl-5">
                                        {test.questions && Array.isArray(test.questions) && test.questions.length ? (
                                          test.questions.map((q, idx) => (
                                            <li key={idx} className="text-red-800">
                                              {q.question || "No question"} (Correct: {q.correctAnswer || "N/A"})
                                            </li>
                                          ))
                                        ) : (
                                          <li className="text-red-800">No questions available</li>
                                        )}
                                      </ul>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-red-800">No tests available.</p>
                                )}
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    placeholder="Test Title"
                                    id={`test-title-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <button
                                    onClick={() => {
                                      const title = (document.getElementById(`test-title-${fullCourse.id}`) as HTMLInputElement).value;
                                      if (title) {
                                        const questions = [
                                          { question: "Sample Question 1", options: ["A", "B", "C"], correctAnswer: "A" },
                                          { question: "Sample Question 2", options: ["X", "Y", "Z"], correctAnswer: "Y" },
                                        ];
                                        handleAddTest(fullCourse.id, title, questions);
                                        (document.getElementById(`test-title-${fullCourse.id}`) as HTMLInputElement).value = "";
                                      } else {
                                        alert("Please enter a test title.");
                                      }
                                    }}
                                    className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                  >
                                    Add Test
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-red-800">No courses assigned.</p>
                    )}
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
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Analytics</h4>
                <p className="text-red-800">Total Students: {allStudents.length}</p>
                <p className="text-red-800">Total Courses: {allCourses.length}</p>
                <p className="text-red-800">
                  Total Revenue: {allStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toLocaleString()} JMD
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Add New Student</h4>
                <input
                  type="text"
                  placeholder="Student Name"
                  id="new-student-name"
                  className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                />
                <input
                  type="email"
                  placeholder="Student Email"
                  id="new-student-email"
                  className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                />
                <button
                  onClick={() => {
                    const name = (document.getElementById("new-student-name") as HTMLInputElement).value;
                    const email = (document.getElementById("new-student-email") as HTMLInputElement).value;
                    if (name && email) {
                      handleAddStudent(name, email);
                      (document.getElementById("new-student-name") as HTMLInputElement).value = "";
                      (document.getElementById("new-student-email") as HTMLInputElement).value = "";
                    } else {
                      alert("Please enter both name and email.");
                    }
                  }}
                  className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                >
                  Add Student
                </button>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-red-800 mb-4">Add New Course</h4>
                <input
                  type="text"
                  placeholder="Course Name"
                  id="new-course-name"
                  className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                />
                <input
                  type="number"
                  placeholder="Fee (JMD)"
                  id="new-course-fee"
                  className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                  min="0"
                />
                <button
                  onClick={() => {
                    const name = (document.getElementById("new-course-name") as HTMLInputElement).value;
                    const feeStr = (document.getElementById("new-course-fee") as HTMLInputElement).value;
                    const fee = parseFloat(feeStr);
                    if (name && !isNaN(fee) && fee >= 0) {
                      handleAddCourse(name, fee);
                      (document.getElementById("new-course-name") as HTMLInputElement).value = "";
                      (document.getElementById("new-course-fee") as HTMLInputElement).value = "";
                    } else {
                      alert("Please enter a valid course name and fee.");
                    }
                  }}
                  className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                >
                  Add Course
                </button>
              </div>
              {allStudents.length ? (
                allStudents.map((s: StudentData) => (
                  <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                    <p className="text-red-800">Balance: {(s.balance || 0).toLocaleString()} JMD</p>
                    <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                    {s.courses && Array.isArray(s.courses) && s.courses.length ? (
                      s.courses.map((c: Course) => {
                        const fullCourse = allCourses.find((ac) => ac.name === c.name);
                        return (
                          <div key={c.id || c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                            {c.subjects && Array.isArray(c.subjects) && c.subjects.length ? (
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
                                  {c.subjects.map((sub: Subject) => (
                                    <tr key={sub.name || Math.random()}>
                                      <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
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
                                      <td className="p-2 border text-red-800">{sub.comments || "N/A"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-red-800">No subjects assigned.</p>
                            )}
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
                            {fullCourse && (
                              <div className="mt-4">
                                <h4 className="text-red-800 font-medium">Resources for {c.name}</h4>
                                {fullCourse.resources && Array.isArray(fullCourse.resources) && fullCourse.resources.length ? (
                                  <ul className="list-disc pl-5">
                                    {fullCourse.resources.map((resource: Resource) => (
                                      <li key={resource.id} className="text-red-800">
                                        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                          {resource.name || "Unnamed"} ({resource.type || "Unknown"})
                                        </a>{" "}
                                        - Uploaded: {resource.uploadDate ? new Date(resource.uploadDate).toLocaleString() : "N/A"}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-red-800">No resources available.</p>
                                )}
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    placeholder="Resource Name"
                                    id={`resource-name-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Resource URL"
                                    id={`resource-url-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Resource Type"
                                    id={`resource-type-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <button
                                    onClick={() => {
                                      const name = (document.getElementById(`resource-name-${fullCourse.id}`) as HTMLInputElement).value;
                                      const url = (document.getElementById(`resource-url-${fullCourse.id}`) as HTMLInputElement).value;
                                      const type = (document.getElementById(`resource-type-${fullCourse.id}`) as HTMLInputElement).value;
                                      if (name && url && type) {
                                        handleAddResource(fullCourse.id, name, url, type);
                                        (document.getElementById(`resource-name-${fullCourse.id}`) as HTMLInputElement).value = "";
                                        (document.getElementById(`resource-url-${fullCourse.id}`) as HTMLInputElement).value = "";
                                        (document.getElementById(`resource-type-${fullCourse.id}`) as HTMLInputElement).value = "";
                                      } else {
                                        alert("Please fill in all resource fields.");
                                      }
                                    }}
                                    className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                  >
                                    Add Resource
                                  </button>
                                </div>
                                <h4 className="text-red-800 font-medium mt-4">Tests for {c.name}</h4>
                                {fullCourse.tests && Array.isArray(fullCourse.tests) && fullCourse.tests.length ? (
                                  fullCourse.tests.map((test: Test) => (
                                    <div key={test.id} className="mt-2">
                                      <p className="text-red-800">{test.title || "Untitled Test"}</p>
                                      <ul className="list-disc pl-5">
                                        {test.questions && Array.isArray(test.questions) && test.questions.length ? (
                                          test.questions.map((q, idx) => (
                                            <li key={idx} className="text-red-800">
                                              {q.question || "No question"} (Correct: {q.correctAnswer || "N/A"})
                                            </li>
                                          ))
                                        ) : (
                                          <li className="text-red-800">No questions available</li>
                                        )}
                                      </ul>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-red-800">No tests available.</p>
                                )}
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    placeholder="Test Title"
                                    id={`test-title-${fullCourse.id}`}
                                    className="p-2 border rounded text-red-800 mr-2 mb-2 w-full"
                                  />
                                  <button
                                    onClick={() => {
                                      const title = (document.getElementById(`test-title-${fullCourse.id}`) as HTMLInputElement).value;
                                      if (title) {
                                        const questions = [
                                          { question: "Sample Question 1", options: ["A", "B", "C"], correctAnswer: "A" },
                                          { question: "Sample Question 2", options: ["X", "Y", "Z"], correctAnswer: "Y" },
                                        ];
                                        handleAddTest(fullCourse.id, title, questions);
                                        (document.getElementById(`test-title-${fullCourse.id}`) as HTMLInputElement).value = "";
                                      } else {
                                        alert("Please enter a test title.");
                                      }
                                    }}
                                    className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                  >
                                    Add Test
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-red-800">No courses enrolled.</p>
                    )}
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
                          s.clearance ? "bg-gray-400 cursor-not-allowed" : "bg-red-800 hover:bg-red-700"
                        }`}
                      >
                        Grant Clearance
                      </button>
                      <button
                        onClick={() => handleRemoveClearance(s.id)}
                        disabled={!s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${
                          !s.clearance ? "bg-gray-400 cursor-not-allowed" : "bg-red-800 hover:bg-red-700"
                        }`}
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
                allStudents.map((s: StudentData) => (
                  <div key={s.id} className="bg-white p-4 rounded-lg shadow-md">
                    <p className="text-lg font-medium text-red-800 mb-2">{s.name || "Unnamed"}</p>
                    <p className="text-red-800">Total Owed: {(s.totalOwed || 0).toLocaleString()} JMD</p>
                    <p className="text-red-800">Total Paid: {(s.totalPaid || 0).toLocaleString()} JMD</p>
                    <p className="text-red-800">Balance: {(s.balance || 0).toLocaleString()} JMD</p>
                    <p className="text-red-800">Status: {s.paymentStatus || "Unpaid"}</p>
                    <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                    <div className="mt-2">
                      <h4 className="text-red-800 font-medium">Transactions</h4>
                      {s.transactions && Array.isArray(s.transactions) && s.transactions.length ? (
                        s.transactions.map((txn: Transaction) => (
                          <p key={txn.id || txn.date} className="text-red-800">
                            {new Date(txn.date).toLocaleString()}: {(txn.amount || 0).toLocaleString()} JMD - {txn.status || "Unknown"}
                          </p>
                        ))
                      ) : (
                        <p className="text-red-800">No transactions.</p>
                      )}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={() => handleGrantClearance(s.id)}
                        disabled={s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${
                          s.clearance ? "bg-gray-400 cursor-not-allowed" : "bg-red-800 hover:bg-red-700"
                        }`}
                      >
                        Grant Clearance
                      </button>
                      <button
                        onClick={() => handleRemoveClearance(s.id)}
                        disabled={!s.clearance}
                        className={`px-4 py-2 rounded-md text-white ${
                          !s.clearance ? "bg-gray-400 cursor-not-allowed" : "bg-red-800 hover:bg-red-700"
                        }`}
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