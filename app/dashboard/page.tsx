"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { v4 as uuidv4 } from 'uuid';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart, Pie, Cell, Legend } from "recharts";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

// Interfaces
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePicture?: string;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  teacherId: string | null;
  courses: Course[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  grades: Record<string, number>;
}

interface Course {
  id: string;
  name: string;
  teacherId: string;
  resources: Resource[];
  assignments: Assignment[];
  tests: any[];
}

interface Transaction {
  id: string;
  amount: number;
  date: string;
  status: string;
}

interface Notification {
  id?: string;
  message: string;
  date: string;
  read: boolean;
}

interface Resource {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'link';
  url: string;
  description: string;
  uploadedBy: string;
  uploadedAt: Date;
  courseCode?: string;
  recipientId?: string;
}

interface Grade {
  id: string;
  studentId: string;
  courseCode: string;
  courseName: string;
  mark: number;
  grade: string;
  credits: number;
  quality: number;
  comments?: string;
  semester: string;
  updatedAt: Date;
}

interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  points: number;
  createdAt: string;
}

// Sample chart data
const transactionData = [
  { date: "Jan 2025", amount: 5000 },
  { date: "Feb 2025", amount: 7000 },
  { date: "Mar 2025", amount: 4500 },
  { date: "Apr 2025", amount: 6000 },
];

const gradeData = [
  { name: "A", value: 30 },
  { name: "B", value: 25 },
  { name: "C", value: 20 },
  { name: "D", value: 15 },
  { name: "F", value: 10 },
];

const COLORS = ["#22C55E", "#A3E635", "#FACC15", "#F97316", "#E11D48"];

// Components
const ResourceForm = ({
  courseId,
  onAddResource,
}: {
  courseId: string;
  onAddResource: (title: string, type: 'video' | 'pdf' | 'link', url: string, description: string) => void;
}) => {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"video" | "pdf" | "link">("video");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !type || !url.trim() || !description.trim()) {
      setError("All fields are required.");
      return;
    }
    if (!url.match(/^https?:\/\/[^\s$.?#].[^\s]*$/)) {
      setError("Please enter a valid URL.");
      return;
    }
    onAddResource(title, type, url, description);
    setTitle("");
    setType("video");
    setUrl("");
    setDescription("");
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Resource Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-2 border rounded text-gray-800"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "video" | "pdf" | "link")}
        className="w-full p-2 border rounded text-gray-800"
      >
        <option value="video">Video</option>
        <option value="pdf">PDF</option>
        <option value="link">Link</option>
      </select>
      <input
        type="url"
        placeholder="Resource URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full p-2 border rounded text-gray-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-gray-800 min-h-[80px]"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Add Resource
      </button>
    </form>
  );
};

const AssignmentForm = ({
  courseId,
  onAddAssignment,
}: {
  courseId: string;
  onAddAssignment: (title: string, description: string, points: number) => void;
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState(100);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (points < 0 || points > 1000) {
      setError("Points must be between 0 and 1000.");
      return;
    }
    onAddAssignment(title, description, points);
    setTitle("");
    setDescription("");
    setPoints(100);
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Assignment Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-2 border rounded text-gray-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-gray-800 min-h-[80px]"
      />
      <input
        type="number"
        placeholder="Points"
        value={points}
        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
        className="w-full p-2 border rounded text-gray-800"
        min="0"
        max="1000"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Create Assignment
      </button>
    </form>
  );
};

const NotificationList = ({
  notifications,
  onMarkAsRead,
}: {
  notifications: Notification[];
  onMarkAsRead: (notificationId: string) => void;
}) => (
  <div className="space-y-2">
    {notifications.length ? (
      notifications.map((notif) => (
        <div
          key={notif.id || notif.date}
          className="flex justify-between items-center p-2 bg-gray-50 rounded"
        >
          <div>
            <p
              className={`text-gray-800 ${
                notif.read ? "opacity-50" : "font-medium"
              }`}
            >
              {notif.message || "No message"}
            </p>
            <p className="text-sm text-gray-600">
              {new Date(notif.date).toLocaleString()}
            </p>
          </div>
          {!notif.read && notif.id && (
            <button
              onClick={() => onMarkAsRead(notif.id!)}
              className="text-blue-600 hover:underline text-sm"
            >
              Mark as Read
            </button>
          )}
        </div>
      ))
    ) : (
      <p className="text-gray-800">No notifications.</p>
    )}
  </div>
);

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<User[]>([]);
  type Role = "admin" | "student" | "teacher" | "accountsadmin";
  const [role, setRole] = useState<Role>("student");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();

  const initializeUserDoc = async (currentUser: any) => {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      const defaultUser: User = {
        id: currentUser.uid,
        name: currentUser.displayName || "Unnamed User",
        email: currentUser.email || "",
        role: "student",
      };
      await setDoc(userDocRef, defaultUser);
      return defaultUser;
    }
    return { id: userSnap.id, ...userSnap.data() } as User;
  };

  const fetchCourses = async () => {
    try {
      const coursesSnapshot = await getDocs(collection(db, "courses"));
      const coursesList = await Promise.all(
        coursesSnapshot.docs.map(async (courseDoc) => {
          const courseData = courseDoc.data();
          const resourcesSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "resources")
          );
          const assignmentsSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "assignments")
          );
          const resources = resourcesSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data(), uploadedAt: doc.data().uploadedAt?.toDate() || new Date() }) as Resource
          );
          const assignments = assignmentsSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Assignment
          );
          return {
            id: courseDoc.id,
            name: courseData.name || "Unnamed Course",
            teacherId: courseData.teacherId || "",
            resources,
            assignments,
            tests: courseData.tests || [],
          } as Course;
        })
      );
      setAllCourses(coursesList);
    } catch (err) {
      console.error("Error fetching courses:", err);
    }
  };

  const fetchData = useCallback(async (currentUser: any) => {
    setIsLoading(true);
    try {
      const fetchedUserData = await initializeUserDoc(currentUser);
      setRole(fetchedUserData.role as Role);
      setUsername(fetchedUserData.name || "Unnamed");
      setUserData(fetchedUserData);
      const hour = new Date().getHours();
      setGreeting(
        hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"
      );

      if (fetchedUserData.role === "student") {
        const studentDocRef = doc(db, "students", currentUser.uid);
        const studentSnap = await getDoc(studentDocRef);
        let fetchedStudentData: StudentData | null = null;
        if (studentSnap.exists()) {
          fetchedStudentData = {
            id: studentSnap.id,
            ...studentSnap.data(),
            transactions: studentSnap.data().transactions || [],
            notifications: studentSnap.data().notifications || [],
            grades: studentSnap.data().grades || {},
            courses: studentSnap.data().courses || [],
            totalOwed: studentSnap.data().totalOwed || 0,
            totalPaid: studentSnap.data().totalPaid || 0,
            balance: studentSnap.data().balance || 0,
            paymentStatus: studentSnap.data().paymentStatus || "Unpaid",
            clearance: studentSnap.data().clearance || false,
          } as StudentData;
        }
        if (!fetchedStudentData) {
          const newStudent: StudentData = {
            id: currentUser.uid,
            name: fetchedUserData.name || "Student",
            email: fetchedUserData.email || "",
            teacherId: null,
            courses: [],
            totalOwed: 0,
            totalPaid: 0,
            balance: 0,
            paymentStatus: "Unpaid",
            clearance: false,
            transactions: [],
            notifications: [],
            grades: {},
          };
          await setDoc(studentDocRef, newStudent);
          fetchedStudentData = newStudent;
        }
        setStudentData(fetchedStudentData);
      }

      if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role)) {
        const studentsSnapshot = await getDocs(collection(db, "students"));
        const studentsList = studentsSnapshot.docs.map((studentDoc) => ({
          id: studentDoc.id,
          ...studentDoc.data(),
          transactions: studentDoc.data().transactions || [],
          notifications: studentDoc.data().notifications || [],
          grades: studentDoc.data().grades || {},
          clearance: studentDoc.data().clearance ?? false,
          courses: studentDoc.data().courses || [],
          totalOwed: studentDoc.data().totalOwed || 0,
          totalPaid: studentDoc.data().totalPaid || 0,
          balance: studentDoc.data().balance || 0,
          paymentStatus: studentDoc.data().paymentStatus || "Unpaid",
        })) as StudentData[];
        setAllStudents(studentsList);

        const teachersList: User[] = [];
        for (const student of studentsList) {
          if (student.teacherId) {
            const teacherDocRef = doc(db, "users", student.teacherId);
            const teacherSnap = await getDoc(teacherDocRef);
            if (teacherSnap.exists() && teacherSnap.data().role === "teacher") {
              teachersList.push({
                id: teacherSnap.id,
                ...teacherSnap.data(),
              } as User);
            }
          }
        }
        setAllTeachers(teachersList);

        if (fetchedUserData.role === "teacher" && studentsList.length > 0) {
          const assignedStudent = studentsList.find(
            (s) => s.teacherId === currentUser.uid
          );
          setSelectedStudentId(assignedStudent ? assignedStudent.id : null);
        }
      }

      await fetchCourses();
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }
      fetchData(currentUser);
    });

    return () => unsubscribe();
  }, [user, router, fetchData]);

  const handleAddResource = async (
    title: string,
    type: 'link' | 'video' | 'pdf',
    url: string,
    description: string
  ) => {
    if (!['teacher', 'admin'].includes(role) || !user || !selectedCourseId) return;
    try {
      const resourceRef = collection(db, 'courses', selectedCourseId, 'resources');
      await addDoc(resourceRef, {
        title,
        type,
        url,
        description,
        uploadedAt: new Date(),
        uploadedBy: userData?.name || 'Unknown',
      });
      await fetchCourses();
    } catch (error) {
      setError('Failed to add resource');
    }
  };

  const handleAddAssignment = async (
    courseId: string,
    title: string,
    description: string,
    points: number
  ) => {
    if (!["teacher", "admin"].includes(role) || !user || !courseId) return;
    try {
      const assignmentRef = collection(db, "courses", courseId, "assignments");
      const newAssignment: Assignment = {
        id: uuidv4(),
        courseId,
        title,
        description,
        points,
        createdAt: new Date().toISOString(),
      };
      await addDoc(assignmentRef, newAssignment);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, assignments: [...(c.assignments || []), newAssignment] }
            : c
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to create assignment.");
    }
  };

  const handleGradeAssignment = async (
    studentId: string,
    courseId: string,
    assignmentId: string,
    grade: number
  ) => {
    if (role !== "teacher" || !user) return;
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) {
      setError("Student not found.");
      return;
    }
    try {
      const gradeRef = doc(db, "students", studentId);
      const updatedGrades = {
        ...(student.grades || {}),
        [`${courseId}_${assignmentId}`]: grade,
      };
      await updateDoc(gradeRef, { grades: updatedGrades });
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, grades: updatedGrades } : s
        )
      );
      if (studentData && studentId === studentData.id) {
        setStudentData((prev) =>
          prev ? { ...prev, grades: updatedGrades } : prev
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to update grade.");
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
      );
    } catch (err: any) {
      setError(err.message || "Failed to grant clearance.");
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
      );
    } catch (err: any) {
      setError(err.message || "Failed to remove clearance.");
    }
  };

  const handleDeleteAccount = async (studentId: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "users", studentId));
      await deleteDoc(doc(db, "students", studentId));
      setAllStudents((prev) => prev.filter((s) => s.id !== studentId));
      if (selectedStudentId === studentId) {
        setSelectedStudentId(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete account.");
    }
  };

  const handlePaymentSuccess = async (transaction: Transaction) => {
    if (!user || !studentData) return;
    try {
      const newBalance = studentData.balance - transaction.amount;
      const updatedTransactions = [...studentData.transactions, transaction];
      await updateDoc(doc(db, "students", user.uid), {
        balance: newBalance,
        totalPaid: studentData.totalPaid + transaction.amount,
        paymentStatus: newBalance <= 0 ? "Paid" : "Unpaid",
        transactions: updatedTransactions,
      });
      setStudentData({
        ...studentData,
        balance: newBalance,
        totalPaid: studentData.totalPaid + transaction.amount,
        paymentStatus: newBalance <= 0 ? "Paid" : "Unpaid",
        transactions: updatedTransactions,
      });
    } catch (err: any) {
      setError(err.message || "Failed to process payment.");
    }
  };

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    if (!user || role !== "student" || !studentData) return;
    try {
      await markNotificationAsRead(user.uid, notificationId);
      setStudentData({
        ...studentData,
        notifications: studentData.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        ),
      });
    } catch (err: any) {
      setError(err.message || "Failed to mark notification as read.");
    }
  };

  const downloadFinancialReport = () => {
    try {
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
        headStyles: { fillColor: [30, 64, 175] },
      });
      doc.save("Financial_Report.pdf");
    } catch (err: any) {
      setError(err.message || "Failed to generate financial report.");
    }
  };

  const filteredStudents = allStudents.filter((student) =>
    student.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white text-xl">Loading...</p>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded">
          <p>{error || "User data not found. Please log in again."}</p>
          <Link
            href="/auth/login"
            className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 p-4 shadow-md">
        <h3 className="text-xl font-semibold text-white mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li>
            <Link
              href="/dashboard"
              className="block p-2 text-white hover:bg-gray-700 rounded"
            >
              Dashboard
            </Link>
          </li>
          <li>
            <Link
              href="/profile"
              className="block p-2 text-white hover:bg-gray-700 rounded"
            >
              Profile
            </Link>
          </li>
          <li>
            <button
              onClick={() => signOut(auth)}
              className="block w-full text-left p-2 text-white hover:bg-gray-700 rounded"
            >
              Logout
            </button>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">{greeting}, {username}</h1>
          <p className="text-lg mb-6 capitalize">{role} Dashboard</p>

          <Tabs defaultValue="overview" className="mb-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="courses">Courses</TabsTrigger>
              <TabsTrigger value="paymentsgrades">Grades</TabsTrigger>
              {role !== "student" && <TabsTrigger value="students">Students</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Students</h2>
                    <p className="text-2xl font-bold">{allStudents.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Courses</h2>
                    <p className="text-2xl font-bold">{allCourses.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Resources</h2>
                    <p className="text-2xl font-bold">
                      {allCourses.reduce((acc, course) => acc + (course.resources?.length || 0), 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Transaction Trends</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={transactionData}>
                        <XAxis dataKey="date" stroke="#8884d8" />
                        <YAxis stroke="#8884d8" />
                        <Tooltip />
                        <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Grade Distribution</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={gradeData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                          fill="#8884d8"
                          label
                        >
                          {gradeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="courses">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allCourses.map((course) => (
                  <Card key={course.id}>
                    <CardContent className="p-4">
                      <h2 className="text-lg font-semibold mb-2">{course.name}</h2>
                      <p className="text-sm mb-2">Resources: {course.resources?.length || 0}</p>
                      <p className="text-sm mb-2">Assignments: {course.assignments?.length || 0}</p>
                      <Link
                        href={`/courses/${course.id}/materials`}
                        className="text-blue-400 hover:underline"
                      >
                        View Materials
                      </Link>
                      <Link
                        href={`/courses/${course.id}/assignments`}
                        className="text-blue-400 hover:underline ml-4"
                      >
                        View Assignments
                      </Link>
                      {role !== "student" && (
                        <>
                          <ResourceForm courseId={course.id} onAddResource={handleAddResource} />
                          <AssignmentForm courseId={course.id} onAddAssignment={(title, description, points) => handleAddAssignment(course.id, title, description, points)} />
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="grades">
              {studentData && role === "student" && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Your Grades</h2>
                    {Object.keys(studentData.grades).length > 0 ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-700">
                            <th className="p-2 border">Assignment</th>
                            <th className="p-2 border">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(studentData.grades).map(([key, grade]) => (
                            <tr key={key}>
                              <td className="p-2 border">{key}</td>
                              <td className="p-2 border">{grade}/100</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No grades available.</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {role === "teacher" && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Grade Assignments</h2>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full p-2 border rounded mb-4 text-gray-800"
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <div>
                        {/* Add grade input form here */}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {role !== "student" && (
              <TabsContent value="students">
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Manage Students</h2>
                    <input
                      type="text"
                      placeholder="Search by student name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full p-2 border rounded mb-4 text-gray-800"
                    />
                    {filteredStudents.length > 0 ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-700">
                            <th className="p-2 border">Name</th>
                            <th className="p-2 border">Email</th>
                            <th className="p-2 border">Balance</th>
                            <th className="p-2 border">Clearance</th>
                            <th className="p-2 border">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((student) => (
                            <tr key={student.id}>
                              <td className="p-2 border">{student.name}</td>
                              <td className="p-2 border">{student.email}</td>
                              <td className="p-2 border">{student.balance.toLocaleString()} JMD</td>
                              <td className="p-2 border">
                                <button
                                  onClick={() =>
                                    student.clearance
                                      ? handleRemoveClearance(student.id)
                                      : handleGrantClearance(student.id)
                                  }
                                  className={`px-2 py-1 rounded text-white ${
                                    student.clearance
                                      ? "bg-green-600 hover:bg-green-700"
                                      : "bg-red-600 hover:bg-red-700"
                                  }`}
                                >
                                  {student.clearance ? "Revoke" : "Grant"}
                                </button>
                              </td>
                              <td className="p-2 border">
                                <button
                                  onClick={() => handleDeleteAccount(student.id)}
                                  className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No students found.</p>
                    )}
                    {(role === "admin" || role === "accountsadmin") && (
                      <button
                        onClick={downloadFinancialReport}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Download Financial Report
                      </button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>

          {role === "student" && studentData && (
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Notifications</h2>
                  <NotificationList
                    notifications={studentData.notifications}
                    onMarkAsRead={handleMarkNotificationAsRead}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Payments</h2>
                  <p>Balance: {studentData.balance.toLocaleString()} JMD</p>
                  <p>Status: {studentData.paymentStatus}</p>
                  <p>Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                  {studentData.balance > 0 && (
                    <CheckoutPage
                      studentId={studentData.id}
                      onPaymentSuccess={handlePaymentSuccess}
                      amount={studentData.balance}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}