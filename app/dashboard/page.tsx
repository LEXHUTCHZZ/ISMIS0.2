"use client";

import { useEffect, useState, useCallback } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Test, Coursework } from "../../models/index";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";
import { sanitizeStudentData } from "../../utils/firestoreSanitizer";
import { User as FirebaseUser } from 'firebase/auth';

// Interfaces
interface User {
  id: string;
  name: string;
  email: string | null;
  role: string;
  profilePicture?: string;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  lecturerId: string | null;
  courses: Course[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  grades: Record<string, number>;
  active?: boolean;
}

type Subject = {
  id?: string;
  name: string;
  grades?: { [key: string]: string };
  comments?: string;
};

interface Course {
  id: string;
  name: string;
  teacherId?: string;
  resources?: Resource[];
  assignments: Assignment[];
  tests?: Test[];
  fee?: number;
  subjects?: Subject[];
  coursework?: Coursework[];
  announcements?: any[];
  description?: string;
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
  name: string;
  type: string;
  url: string;
  uploadDate: string;
}

interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  points: number;
  createdAt: string;
}

// Resource Form Component
const ResourceForm = ({
  courseId,
  onAddResource,
}: {
  courseId: string;
  onAddResource: (name: string, type: string, url: string) => void;
}) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !type.trim() || !url.trim()) {
      setError("All fields are required.");
      return;
    }
    if (!url.match(/^https?:\/\/[^\s$.?#].[^\s]*$/)) {
      setError("Please enter a valid URL.");
      return;
    }
    onAddResource(name, type, url);
    setName("");
    setType("");
    setUrl("");
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Resource Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full p-2 border rounded text-blue-800"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="w-full p-2 border rounded text-blue-800"
      >
        <option value="">Select Type</option>
        <option value="YouTube Video">YouTube Video</option>
        <option value="PDF">PDF</option>
        <option value="Other">Other</option>
      </select>
      <input
        type="url"
        placeholder="Resource URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full p-2 border rounded text-blue-800"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-700"
      >
        Add Resource
      </button>
    </form>
  );
};

// Assignment Form Component
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
        className="w-full p-2 border rounded text-blue-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-blue-800 min-h-[80px]"
      />
      <input
        type="number"
        placeholder="Points"
        value={points}
        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
        className="w-full p-2 border rounded text-blue-800"
        min="0"
        max="1000"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-700"
      >
        Create Assignment
      </button>
    </form>
  );
};

// Notification List Component
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
              className={`text-blue-800 ${
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
      <p className="text-blue-800">No notifications.</p>
    )}
  </div>
);

// Main Dashboard Component
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
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user, loading } = useAuth();

  const fetchData = useCallback(async (currentUser: FirebaseUser) => {
    if (!currentUser) {
      setError("No user found");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch user data
      const userDocRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (!userSnap.exists()) {
        // Create a new user document if it doesn't exist
        const newUser = {
          id: currentUser.uid,
          name: currentUser.displayName || "Unnamed",
          email: currentUser.email || "",
          role: "student", // Default role
          profilePicture: currentUser.photoURL || ""
        };
        await setDoc(userDocRef, newUser);
        const userWithAuth: User = {
        ...newUser,
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        emailVerified: currentUser.emailVerified,
        email: currentUser.email
      };
      setUserData(userWithAuth);
        setRole(newUser.role);
        setUsername(newUser.name);
      } else {
        const fetchedUserData = { id: userSnap.id, ...userSnap.data() } as User;
        setRole(fetchedUserData.role || "");
        setUsername(fetchedUserData.name || "Unnamed");
        const userWithAuth: User = {
          ...fetchedUserData,
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          emailVerified: currentUser.emailVerified,
          email: currentUser.email
        };
        setUserData(userWithAuth);
      }

      const hour = new Date().getHours();
      setGreeting(
        hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"
      );

      // Fetch student data if user is a student
      // Fetch all students data
      const studentsSnapshot = await getDocs(collection(db, "students"));
      const studentsList = await Promise.all(
        studentsSnapshot.docs.map(async (studentDoc) => {
          const rawData = {
            id: studentDoc.id,
            ...studentDoc.data()
          };
          return sanitizeStudentData(rawData);
        })
      );
      const processedStudents = studentsList.map((s: any): StudentData => {
        const processedCourses = (s.courses || []).map((c: Partial<Course>) => ({
          ...c,
          id: c.id || '',
          name: c.name || '',
          teacherId: c.teacherId || '',
          assignments: c.assignments || [],
          resources: c.resources || [],
          tests: c.tests || [],
          fee: c.fee,
          subjects: c.subjects || [],
          coursework: c.coursework || [],
          announcements: c.announcements || [],
          description: c.description
        } as Course));
        
        return {
          ...s,
          courses: processedCourses
        } as StudentData;
      });
      
      setAllStudents(processedStudents);

      // If current user is a student, find their data
      if (userData?.role === "student") {
        const studentDoc = await getDoc(doc(db, "students", currentUser.uid));
        if (studentDoc.exists()) {
          const rawStudentData = {
            id: studentDoc.id,
            ...(studentDoc.data() as any)
          } as StudentData;
          const processedCourses = (rawStudentData.courses || []).map((c: Partial<Course>) => ({
            id: c.id || '',
            name: c.name || '',
            teacherId: c.teacherId || '',
            assignments: c.assignments || [],
            resources: c.resources || [],
            tests: c.tests || [],
            fee: c.fee,
            subjects: c.subjects,
            coursework: c.coursework,
            announcements: c.announcements,
            description: c.description
          } as Course));
          
          const sanitizedData = sanitizeStudentData({
            ...rawStudentData,
            courses: processedCourses.map((c: Course) => ({
              ...c,
              teacherId: c.teacherId || '',
              assignments: c.assignments || [],
              resources: c.resources || [],
              tests: c.tests || []
            }))
          });
          setStudentData(sanitizedData as unknown as StudentData);
        } else {
          // Create new student document if it doesn't exist
          const newStudentData: StudentData = sanitizeStudentData({
            id: currentUser.uid,
            name: userData.name,
            email: userData.email,
            lecturerId: null,
            courses: [],
            totalOwed: 0,
            totalPaid: 0,
            balance: 0,
            paymentStatus: "Unpaid",
            clearance: false,
            transactions: [],
            notifications: [],
            grades: {}
          });
          await setDoc(doc(db, "students", currentUser.uid), newStudentData);
          setStudentData(newStudentData as unknown as StudentData);
        }
      }

      // Fetch all lecturers
      const usersSnapshot = await getDocs(collection(db, "users"));
      const lecturersList = usersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }) as User)
        .filter((u) => u.role === "teacher");
      setAllLecturers(lecturersList);

      // If user is a teacher, find their assigned student
      if (userData?.role === "teacher" && studentsList.length > 0) {
        const assignedStudent = studentsList.find(
          (s) => s.lecturerId === currentUser.uid
        );
        setSelectedStudentId(assignedStudent ? assignedStudent.id : null);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching data");
      setIsLoading(false);
    }

    }, []);

    useEffect(() => {
      if (!user || loading) {
      setIsLoading(false);
      return;
    }
      fetchData(user);
    }, [user, loading, fetchData]);

    useEffect(() => {
      if (!userData?.role) return;

      const loadCourses = async () => {
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
                (doc) => ({ id: doc.id, ...doc.data() }) as Resource
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
          console.error("Error fetching data:", err);
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard data."
          );
        } finally {
          setIsLoading(false);
        }
      };

      loadCourses();
    }, [userData?.role]);

  useEffect(() => {
    if (loading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      router.push("/auth/login");
      return;
    }

    fetchData(user);

    return () => {};
  }, [user, router, fetchData]);

  const handleAddResource = async (
    courseId: string,
    name: string,
    type: string,
    url: string
  ) => {
    if (!["teacher", "admin"].includes(role) || !user) return;
    try {
      const resourceRef = doc(collection(db, "courses", courseId, "resources"));
      const newResource: Resource = {
        id: resourceRef.id,
        name,
        type,
        url,
        uploadDate: new Date().toISOString(),
      };
      await setDoc(resourceRef, newResource);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, resources: [...(c.resources || []), newResource] }
            : c
        )
      );
      alert("Resource added successfully!");
    } catch (err) {
      console.error("Error adding resource:", err);
      alert(err instanceof Error ? err.message : "Failed to add resource.");
    }
  };

  const handleAddAssignment = async (
    courseId: string,
    title: string,
    description: string,
    points: number
  ) => {
    if (!["teacher", "admin"].includes(role) || !user) return;
    try {
      const assignmentRef = doc(
        collection(db, "courses", courseId, "assignments")
      );
      const newAssignment: Assignment = {
        id: assignmentRef.id,
        courseId,
        title,
        description,
        points,
        createdAt: new Date().toISOString(),
      };
      await setDoc(assignmentRef, newAssignment);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, assignments: [...(c.assignments || []), newAssignment] }
            : c
        )
      );
      alert("Assignment created successfully!");
    } catch (err) {
      console.error("Error adding assignment:", err);
      alert(err instanceof Error ? err.message : "Failed to create assignment.");
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
    if (!student || student.lecturerId !== user.uid) {
      alert("You can only grade assignments for students assigned to you.");
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
      alert("Grade updated successfully!");
    } catch (err) {
      console.error("Error grading assignment:", err);
      alert(err instanceof Error ? err.message : "Failed to update grade.");
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
    } catch (err) {
      console.error("Error granting clearance:", err);
      alert(err instanceof Error ? err.message : "Failed to grant clearance.");
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
    } catch (err) {
      console.error("Error removing clearance:", err);
      alert(err instanceof Error ? err.message : "Failed to remove clearance.");
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
      alert("Account deleted successfully!");
    } catch (err) {
      console.error("Error deleting account:", err);
      alert(err instanceof Error ? err.message : "Failed to delete account.");
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
      alert("Payment processed successfully!");
    } catch (err) {
      console.error("Error processing payment:", err);
      alert(err instanceof Error ? err.message : "Failed to process payment.");
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
    } catch (err) {
      console.error("Error marking notification as read:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to mark notification as read."
      );
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
    } catch (err) {
      console.error("Error generating financial report:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to generate financial report."
      );
    }
  };

  const filteredStudents = allStudents.filter((student) =>
    student.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-blue-800 text-xl">Loading...</p>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded">
          <p>{error || "User data not found. Please log in again."}</p>
          <Link
            href="/auth/login"
            className="mt-2 inline-block px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-700"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  if (!role) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-blue-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li>
            <Link
              href="/dashboard"
              className="block p-2 text-blue-800 hover:bg-blue-50 rounded"
            >
              Dashboard
            </Link>
          </li>
          <li>
            <Link
              href="/profile"
              className="block p-2 text-blue-800 hover:bg-blue-50 rounded"
            >
              Profile
            </Link>
          </li>
          <li>
            <button
              onClick={() => auth.signOut()}
              className="block w-full text-left p-2 text-blue-800 hover:bg-blue-50 rounded"
            >
              Logout
            </button>
          </li>
        </ul>
      </div>

      {/* Main Content */}
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
                <h2 className="text-2xl font-bold text-blue-800">
                  {greeting}, {username}
                </h2>
                <p className="text-blue-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {/* Student Dashboard */}
          {role === "student" && (
            <div className="space-y-6">
              {!studentData ? (
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <p className="text-blue-800 text-center">
                    No student profile found. Contact support to set up your
                    account.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Notifications */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Notifications
                    </h3>
                    <NotificationList
                      notifications={studentData.notifications}
                      onMarkAsRead={handleMarkNotificationAsRead}
                    />
                  </div>

                  {/* Payments */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Payments
                    </h3>
                    <p className="text-blue-800">
                      Balance: {studentData.balance.toLocaleString()} JMD
                    </p>
                    <p className="text-blue-800">
                      Status: {studentData.paymentStatus}
                    </p>
                    <p className="text-blue-800">
                      Clearance: {studentData.clearance ? "Yes" : "No"}
                    </p>
                    {studentData.transactions.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-blue-800 font-medium">
                          Transaction History
                        </h4>
                        {studentData.transactions.map((txn) => (
                          <p key={txn.id} className="text-blue-800">
                            {new Date(txn.date).toLocaleString()}:{" "}
                            {txn.amount.toLocaleString()} JMD - {txn.status}
                          </p>
                        ))}
                      </div>
                    )}
                    {studentData.balance > 0 ? (
                      <div className="mt-4">
                        <CheckoutPage
                          studentId={studentData.id}
                          onPaymentSuccess={handlePaymentSuccess}
                          amount={studentData.balance}
                        />
                      </div>
                    ) : (
                      <p className="text-green-600 mt-2">
                        No outstanding balance.
                      </p>
                    )}
                  </div>

                  {/* Grades */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Your Grades
                    </h3>
                    {studentData.grades &&
                    Object.keys(studentData.grades).length > 0 ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-blue-800 text-white">
                            <th className="p-2 border">Assignment</th>
                            <th className="p-2 border">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(studentData.grades).map(
                            ([key, grade]) => (
                              <tr key={key}>
                                <td className="p-2 border text-blue-800">
                                  {key}
                                </td>
                                <td className="p-2 border text-blue-800">
                                  {grade}/100
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-blue-800">No grades available.</p>
                    )}
                  </div>

                  {/* Resources */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Course Resources
                    </h3>
                    <select
                      value={selectedCourseId || ""}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full p-2 border rounded text-blue-800 mb-4"
                    >
                      <option value="">Select a Course</option>
                      {studentData.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                    {selectedCourseId ? (
                      (() => {
                        const course = allCourses.find(
                          (c) => c.id === selectedCourseId
                        );
                        return course && course.resources && course.resources.length > 0 ? (
                          <ul className="space-y-2">
                            {course.resources.map((resource) => (
                              <li key={resource.id} className="text-blue-800">
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline"
                                >
                                  {resource.name} ({resource.type})
                                </a>{" "}
                                - Uploaded:{" "}
                                {new Date(
                                  resource.uploadDate
                                ).toLocaleString()}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-blue-800">
                            No resources available.
                          </p>
                        );
                      })()
                    ) : (
                      <p className="text-blue-800">
                        Please select a course to view resources.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teacher Dashboard */}
          {role === "teacher" && (
            <div className="space-y-6">
              {/* Course Selection */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Your Courses
                </h3>
                <select
                  value={selectedCourseId || ""}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800"
                >
                  <option value="">Select a Course</option>
                  {allCourses
                    .filter((c) => user && c.teacherId === user.uid)
                    .map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                </select>
              </div>

              {selectedCourseId && (
                <>
                  {/* Create Assignment */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Create Assignment
                    </h3>
                    <AssignmentForm
                      courseId={selectedCourseId}
                      onAddAssignment={(title, description, points) =>
                        handleAddAssignment(selectedCourseId!, title, description, points)
                      }
                    />
                  </div>

                  {/* View and Grade Assignments */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Assignments
                    </h3>
                    {(() => {
                      const course = allCourses.find(
                        (c) => c.id === selectedCourseId
                      );
                      return course && (course.assignments || []).length ? (
                        <>
                          {(course.assignments || []).map((assignment) => (
                            <div
                              key={assignment.id}
                              className="p-4 bg-gray-50 rounded mb-4"
                            >
                              <h4 className="text-md font-medium text-blue-800">
                                {assignment.title}
                              </h4>
                              <p className="text-blue-800">
                                {assignment.description || "No description"}
                              </p>
                              <p className="text-blue-800">
                                Points: {assignment.points}
                              </p>
                              <div className="mt-2">
                                <select
                                  onChange={(e) => {
                                    const studentId = e.target.value;
                                    if (studentId) {
                                      const grade = prompt(
                                        "Enter grade (0-100)"
                                      );
                                      if (
                                        grade &&
                                        !isNaN(parseInt(grade)) &&
                                        parseInt(grade) >= 0 &&
                                        parseInt(grade) <= 100
                                      ) {
                                        handleGradeAssignment(
                                          studentId,
                                          selectedCourseId,
                                          assignment.id,
                                          parseInt(grade)
                                        );
                                      } else if (grade) {
                                        alert(
                                          "Please enter a valid grade (0-100)."
                                        );
                                      }
                                    }
                                  }}
                                  className="p-2 border rounded text-blue-800"
                                  defaultValue=""
                                >
                                  <option value="">Select a Student</option>
                                  {allStudents
                                    .filter(
                                      (s) => user && s.lecturerId === user.uid
                                    )
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p className="text-blue-800">No assignments available.</p>
                      );
                    })()}
                  </div>

                  {/* Add Resource */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Add Resource
                    </h3>
                    <ResourceForm
                      courseId={selectedCourseId}
                      onAddResource={(name, type, url) =>
                        handleAddResource(selectedCourseId!, name, type, url)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Admin Dashboard */}
          {role === "admin" && (
            <div className="space-y-6">
              {/* Search Students */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Search Students
                </h3>
                <input
                  type="text"
                  placeholder="Search by student name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800"
                />
                {searchQuery && (
                  <div className="mt-4 space-y-2">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center space-x-4 p-2 border-b"
                        >
                          <div>
                            <p className="text-blue-800 font-medium">
                              {student.name}
                            </p>
                            <p className="text-blue-800 text-sm">
                              Email: {student.email}
                            </p>
                            <p className="text-blue-800 text-sm">
                              Balance: {student.balance.toLocaleString()} JMD
                            </p>
                            <p className="text-blue-800 text-sm">
                              Clearance: {student.clearance ? "Yes" : "No"}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-blue-800">No students found.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Manage Students */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Manage Students
                </h3>
                {allStudents.length > 0 ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-blue-800 text-white">
                        <th className="p-2 border">Name</th>
                        <th className="p-2 border">Email</th>
                        <th className="p-2 border">Balance</th>
                        <th className="p-2 border">Clearance</th>
                        <th className="p-2 border">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStudents.map((student) => (
                        <tr key={student.id}>
                          <td className="p-2 border text-blue-800">
                            {student.name}
                          </td>
                          <td className="p-2 border text-blue-800">
                            {student.email}
                          </td>
                          <td className="p-2 border text-blue-800">
                            {student.balance.toLocaleString()} JMD
                          </td>
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
                  <p className="text-blue-800">No students available.</p>
                )}
              </div>

              {/* Payment History */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Payment History
                </h3>
                <select
                  value={selectedStudentId || ""}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800 mb-4"
                >
                  <option value="">Select a Student</option>
                  {allStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                {selectedStudentId && (
                  (() => {
                    const student = allStudents.find(
                      (s) => s.id === selectedStudentId
                    );
                    return student && student.transactions.length > 0 ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-blue-800 text-white">
                            <th className="p-2 border">Date</th>
                            <th className="p-2 border">Amount</th>
                            <th className="p-2 border">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {student.transactions.map((txn) => (
                            <tr key={txn.id}>
                              <td className="p-2 border text-blue-800">
                                {new Date(txn.date).toLocaleString()}
                              </td>
                              <td className="p-2 border text-blue-800">
                                {txn.amount.toLocaleString()} JMD
                              </td>
                              <td className="p-2 border text-blue-800">
                                {txn.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-blue-800">No transactions available.</p>
                    );
                  })()
                )}
              </div>

              {/* Financial Report Download */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Financial Reports
                </h3>
                <button
                  onClick={downloadFinancialReport}
                  className="px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-700"
                >
                  Download Financial Report
                </button>
              </div>
            </div>
          )}

          {/* Accounts Admin Dashboard */}
          {role === "accountsadmin" && (
            <div className="space-y-6">
              {/* Search Students */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Search Students
                </h3>
                <input
                  type="text"
                  placeholder="Search by student name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800"
                />
                {searchQuery && (
                  <div className="mt-4 space-y-2">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center space-x-4 p-2 border-b"
                        >
                          <div>
                            <p className="text-blue-800 font-medium">
                              {student.name}
                            </p>
                            <p className="text-blue-800 text-sm">
                              Email: {student.email}
                            </p>
                            <p className="text-blue-800 text-sm">
                              Balance: {student.balance.toLocaleString()} JMD
                            </p>
                            <p className="text-blue-800 text-sm">
                              Clearance: {student.clearance ? "Yes" : "No"}
                            </p>
                          </div>
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
                        </div>
                      ))
                    ) : (
                      <p className="text-blue-800">No students found.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Financial Report Download */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Financial Reports
                </h3>
                <button
                  onClick={downloadFinancialReport}
                  className="px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-700"
                >
                  Download Financial Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}