"use client";

import { useEffect, useState, useCallback } from "react";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  recipientId?: string; // Added for student-specific resources
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

// Resource Form Component
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
        className="w-full p-2 border rounded text-blue-800"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "video" | "pdf" | "link")}
        className="w-full p-2 border rounded text-blue-800"
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
        className="w-full p-2 border rounded text-blue-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-blue-800 min-h-[80px]"
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
  const [resources, setResources] = useState<Resource[]>([]);
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
  const [isLoading, setIsLoading] = useState(false);
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
        try {
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
              try {
                const teacherDocRef = doc(db, "users", student.teacherId);
                const teacherSnap = await getDoc(teacherDocRef);
                if (teacherSnap.exists() && teacherSnap.data().role === "teacher") {
                  teachersList.push({
                    id: teacherSnap.id,
                    ...teacherSnap.data(),
                  } as User);
                }
              } catch (err) {
                console.warn(`Failed to fetch teacher ${student.teacherId}:`, err);
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
        } catch (err) {
          console.error("Failed to fetch students:", err);
          setError("Failed to load student data.");
        }
      }

      await fetchCourses();
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(
        err.code === "permission-denied"
          ? "Permission denied. Please ensure your account is set up correctly."
          : err.message || "Failed to load dashboard data."
      );
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

  const fetchResources = async (studentId?: string) => {
    try {
      const resourcesSnapshot = await getDocs(collection(db, "resources"));
      const allResources = resourcesSnapshot.docs.map(
        (doc) => ({
          id: doc.id,
          ...doc.data(),
          uploadedAt: doc.data().uploadedAt?.toDate() || new Date(),
        }) as Resource
      );
      // Filter resources for the specific student if studentId is provided
      const filteredResources = studentId
        ? allResources.filter((r) => r.recipientId === studentId)
        : allResources;
      setResources(filteredResources);
    } catch (error) {
      console.error('Error fetching resources:', error);
    }
  };

  const handleResourceUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResource.title || !newResource.type || !newResource.url || !newResource.description || (!newResource.recipientId && role === "teacher")) {
      alert('Please fill in all required fields, including selecting a student if you are a teacher.');
      return;
    }

    try {
      const resourceRef = collection(db, 'resources');
      const resourceData = {
        ...newResource,
        uploadedBy: userData?.name || 'Unknown',
        uploadedAt: new Date(),
        id: uuidv4(),
      };
      await addDoc(resourceRef, resourceData);

      // Notify the student
      const studentRef = doc(db, "students", newResource.recipientId || "");
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const notifications = studentData.notifications || [];
        notifications.push({
          id: uuidv4(),
          message: `New resource uploaded: ${newResource.title}`,
          date: new Date().toISOString(),
          read: false,
        });
        await updateDoc(studentRef, { notifications });
      }

      setNewResource({
        title: '',
        type: 'video',
        url: '',
        description: '',
        courseCode: '',
        recipientId: '',
      });
      fetchResources(role === "student" ? user?.uid : undefined);
      alert('Resource uploaded successfully');
    } catch (error) {
      console.error('Error uploading resource:', error);
      alert('Failed to upload resource');
    }
  };

  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.studentId || !newGrade.courseCode || !newGrade.courseName || !newGrade.mark || !newGrade.grade || !newGrade.credits || !newGrade.semester) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const studentRef = doc(db, 'students', newGrade.studentId);
      const studentDoc = await getDoc(studentRef);

      if (!studentDoc.exists()) {
        alert('Student not found');
        return;
      }

      const gradeData = {
        ...newGrade,
        quality: calculateQualityPoints(newGrade.grade, newGrade.credits),
        updatedAt: new Date(),
        id: uuidv4(),
      };

      const currentGrades = studentDoc.data().grades || {};
      currentGrades[`${newGrade.courseCode}_${newGrade.semester}`] = gradeData.mark;

      await updateDoc(studentRef, { grades: currentGrades });
      setNewGrade({
        studentId: '',
        courseCode: '',
        courseName: '',
        mark: 0,
        grade: '',
        credits: 0,
        semester: '',
        comments: '',
      });
      alert('Grade submitted successfully');
    } catch (error) {
      console.error('Error submitting grade:', error);
      alert('Failed to submit grade');
    }
  };

  const calculateQualityPoints = (grade: string, credits: number): number => {
    const gradePoints: { [key: string]: number } = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'F': 0.0
    };

    const points = gradePoints[grade.toUpperCase()] || 0;
    return points * credits;
  };

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
      alert('Resource added successfully!');
    } catch (error) {
      console.error('Error adding resource:', error);
      alert('Failed to add resource');
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
      alert("Assignment created successfully!");
    } catch (err: any) {
      console.error("Error adding assignment:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to create assignments."
          : err.message || "Failed to create assignment."
      );
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
      alert("Student not found.");
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
    } catch (err: any) {
      console.error("Error grading assignment:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to update grades."
          : err.message || "Failed to update grade."
      );
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
    } catch (err: any) {
      console.error("Error granting clearance:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to grant clearance."
          : err.message || "Failed to grant clearance."
      );
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
    } catch (err: any) {
      console.error("Error removing clearance:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to remove clearance."
          : err.message || "Failed to remove clearance."
      );
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
    } catch (err: any) {
      console.error("Error deleting account:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to delete accounts."
          : err.message || "Failed to delete account."
      );
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
    } catch (err: any) {
      console.error("Error processing payment:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to process payments."
          : err.message || "Failed to process payment."
      );
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
      console.error("Error marking notification as read:", err);
      alert(
        err.code === "permission-denied"
          ? "You do not have permission to update notifications."
          : err.message || "Failed to mark notification as read."
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
    } catch (err: any) {
      console.error("Error generating financial report:", err);
      alert(err.message || "Failed to generate financial report.");
    }
  };

  const filteredStudents = allStudents.filter((student) =>
    student.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [newResource, setNewResource] = useState<Partial<Resource>>({
    title: '',
    type: 'video',
    url: '',
    description: '',
    courseCode: '',
    recipientId: '',
  });
  const [newGrade, setNewGrade] = useState<Partial<Grade>>({
    studentId: '',
    courseCode: '',
    courseName: '',
    mark: 0,
    grade: '',
    credits: 0,
    semester: '',
    comments: '',
  });

  useEffect(() => {
    fetchResources(role === "student" ? user?.uid : undefined);
  }, [role, user]);

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
                      Your Resources
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {resources.length > 0 ? (
                        resources.map((resource) => (
                          <div key={resource.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                            <h4 className="font-semibold text-blue-800">{resource.title}</h4>
                            <p className="text-sm text-gray-600 mb-2">
                              {resource.courseCode && <span className="font-semibold">[{resource.courseCode}] </span>}
                              {resource.type.toUpperCase()}
                            </p>
                            <p className="text-sm mb-2">{resource.description}</p>
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Access Resource
                            </a>
                            <p className="text-xs text-gray-500 mt-2">
                              Uploaded by {resource.uploadedBy} on {new Date(resource.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-blue-800">No resources available.</p>
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
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-6 rounded-lg shadow-md">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">Total Students</h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {allStudents.length}
                  </p>
                </div>
                <div className="bg-green-50 p-6 rounded-lg shadow-md">
                  <h3 className="text-sm font-semibold text-green-800 mb-2">Resources Uploaded</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {resources.filter(r => user && r.uploadedBy === userData?.name).length}
                  </p>
                </div>
                <div className="bg-purple-50 p-6 rounded-lg shadow-md">
                  <h3 className="text-sm font-semibold text-purple-800 mb-2">Active Assignments</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {selectedCourseId ? 
                      allCourses.find(c => c.id === selectedCourseId)?.assignments.length || 0
                      : 0
                    }
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Resource Management */}
                  <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Upload Resources
                    </h3>
                    <form onSubmit={handleResourceUpload} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <select
                          value={newResource.recipientId || ''}
                          onChange={(e) => setNewResource({ ...newResource, recipientId: e.target.value })}
                          className="p-2 border rounded"
                          required
                        >
                          <option value="">Select Student</option>
                          {allStudents.length > 0 ? (
                            allStudents.map(student => (
                              <option key={student.id} value={student.id}>
                                {student.name}
                              </option>
                            ))
                          ) : (
                            <option value="" disabled>No students available</option>
                          )}
                        </select>
                        <input
                          type="text"
                          placeholder="Resource Title"
                          value={newResource.title || ''}
                          onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                          className="p-2 border rounded"
                          required
                        />
                        <select
                          value={newResource.type || 'video'}
                          onChange={(e) => setNewResource({ ...newResource, type: e.target.value as 'video' | 'pdf' | 'link' })}
                          className="p-2 border rounded"
                          required
                        >
                          <option value="video">YouTube Video</option>
                          <option value="pdf">PDF Document</option>
                          <option value="link">External Link</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Resource URL"
                          value={newResource.url || ''}
                          onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                          className="p-2 border rounded"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Course Code (optional)"
                          value={newResource.courseCode || ''}
                          onChange={(e) => setNewResource({ ...newResource, courseCode: e.target.value })}
                          className="p-2 border rounded"
                        />
                        <textarea
                          placeholder="Resource Description"
                          value={newResource.description || ''}
                          onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                          className="p-2 border rounded"
                          rows={3}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                      >
                        Upload Resource
                      </button>
                    </form>
                  </div>

                  {/* Grade Management */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Manage Grades
                    </h3>
                    <form onSubmit={handleGradeSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <select
                          value={newGrade.studentId || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, studentId: e.target.value })}
                          className="p-2 border rounded"
                          required
                        >
                          <option value="">Select Student</option>
                          {allStudents.length > 0 ? (
                            allStudents.map(student => (
                              <option key={student.id} value={student.id}>
                                {student.name}
                              </option>
                            ))
                          ) : (
                            <option value="" disabled>No students available</option>
                          )}
                        </select>
                        <input
                          type="text"
                          placeholder="Course Code"
                          value={newGrade.courseCode || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, courseCode: e.target.value })}
                          className="p-2 border rounded"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Course Name"
                          value={newGrade.courseName || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, courseName: e.target.value })}
                          className="p-2 border rounded"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Mark (0-100)"
                          value={newGrade.mark || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, mark: parseInt(e.target.value) })}
                          min="0"
                          max="100"
                          className="p-2 border rounded"
                          required
                        />
                        <select
                          value={newGrade.grade || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                          className="p-2 border rounded"
                          required
                        >
                          <option value="">Select Grade</option>
                          <option value="A+">A+</option>
                          <option value="A">A</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B">B</option>
                          <option value="B-">B-</option>
                          <option value="C+">C+</option>
                          <option value="C">C</option>
                          <option value="C-">C-</option>
                          <option value="D+">D+</option>
                          <option value="D">D</option>
                          <option value="F">F</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Credits"
                          value={newGrade.credits || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, credits: parseInt(e.target.value) })}
                          min="1"
                          className="p-2 border rounded"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Semester (e.g., Fall 2023)"
                          value={newGrade.semester || ''}
                          onChange={(e) => setNewGrade({ ...newGrade, semester: e.target.value })}
                          className="p-2 border rounded"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                      >
                        Submit Grade
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Student Progress */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Student Progress
                    </h3>
                    <div className="space-y-4">
                      {allStudents.length > 0 ? (
                        allStudents.map(student => (
                          <div key={student.id} className="p-4 bg-gray-50 rounded">
                            <h4 className="font-medium text-blue-800">{student.name}</h4>
                            <div className="mt-2 text-sm text-gray-600">
                              <p>Assignments Completed: {student.grades ? Object.keys(student.grades).length : 0}</p>
                              <p>Average Grade: {
                                student.grades ?
                                  Object.values(student.grades).length > 0 ?
                                    (Object.values(student.grades).reduce((a, b) => a + b, 0) / Object.values(student.grades).length).toFixed(1)
                                    : 'N/A'
                                  : 'N/A'
                              }</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-blue-800">No students available.</p>
                      )}
                    </div>
                  </div>

                  {/* Course Announcements */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Course Announcements
                    </h3>
                    <div className="space-y-4">
                      <textarea
                        className="w-full p-2 border rounded text-blue-800 mb-2"
                        placeholder="Write an announcement..."
                        rows={3}
                      />
                      <button
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                        onClick={() => {
                          alert('Announcement feature coming soon!');
                        }}
                      >
                        Post Announcement
                      </button>
                    </div>
                  </div>

                  {/* View Resources */}
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Course Resources
                    </h3>
                    {(() => {
                      const course = allCourses.find(c => c.id === selectedCourseId);
                      return course && course.resources && course.resources.length ? (
                        <div className="space-y-4">
                          {course.resources.map((resource, index) => (
                            <div key={index} className="p-4 bg-gray-50 rounded">
                              <h4 className="font-medium text-blue-800">{resource.title}</h4>
                              <p className="text-sm text-gray-600">{resource.description}</p>
                              <div className="mt-2 flex items-center space-x-2">
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  View Resource
                                </a>
                                <span className="text-gray-400">|</span>
                                <button
                                  className="text-red-600 hover:text-red-800"
                                  onClick={() => {
                                    alert('Delete feature coming soon!');
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-blue-800">No resources available.</p>
                      );
                    })()}
                  </div>
                </div>
              </div>
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

              {/* Resource Management */}
              <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Upload Resources
                </h3>
                <form onSubmit={handleResourceUpload} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select
                      value={newResource.recipientId || ''}
                      onChange={(e) => setNewResource({ ...newResource, recipientId: e.target.value })}
                      className="p-2 border rounded"
                      required
                    >
                      <option value="">Select Student</option>
                      {allStudents.map(student => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Resource Title"
                      value={newResource.title || ''}
                      onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <select
                      value={newResource.type || 'video'}
                      onChange={(e) => setNewResource({ ...newResource, type: e.target.value as 'video' | 'pdf' | 'link' })}
                      className="p-2 border rounded"
                      required
                    >
                      <option value="video">YouTube Video</option>
                      <option value="pdf">PDF Document</option>
                      <option value="link">External Link</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Course Code (optional)"
                      value={newResource.courseCode || ''}
                      onChange={(e) => setNewResource({ ...newResource, courseCode: e.target.value })}
                      className="p-2 border rounded"
                    />
                    <input
                      type="text"
                      placeholder="Resource URL"
                      value={newResource.url || ''}
                      onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <textarea
                      placeholder="Description"
                      value={newResource.description || ''}
                      onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                      className="p-2 border rounded md:col-span-2"
                      required
                    />
                  </div>
                  <button type="submit" className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Upload Resource
                  </button>
                </form>
              </div>

              {/* Resources Display */}
              <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Available Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {resources.map((resource) => (
                    <div key={resource.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                      <h4 className="font-semibold text-blue-800">{resource.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">
                        {resource.courseCode && <span className="font-semibold">[{resource.courseCode}] </span>}
                        {resource.type.toUpperCase()}
                      </p>
                      <p className="text-sm mb-2">{resource.description}</p>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Access Resource
                      </a>
                      <p className="text-xs text-gray-500 mt-2">
                        Uploaded by {resource.uploadedBy} on {new Date(resource.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grade Management */}
              <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Manage Grades
                </h3>
                <form onSubmit={handleGradeSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <select
                      value={newGrade.studentId || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, studentId: e.target.value })}
                      className="p-2 border rounded"
                      required
                    >
                      <option value="">Select Student</option>
                      {allStudents.map(student => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Course Code"
                      value={newGrade.courseCode || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, courseCode: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Course Name"
                      value={newGrade.courseName || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, courseName: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Mark (%)"
                      value={newGrade.mark || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, mark: Number(e.target.value) })}
                      className="p-2 border rounded"
                      required
                      min="0"
                      max="100"
                    />
                    <input
                      type="text"
                      placeholder="Grade (A, B, C, etc.)"
                      value={newGrade.grade || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Credits"
                      value={newGrade.credits || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, credits: Number(e.target.value) })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Semester (e.g., 2023-2024 - 1)"
                      value={newGrade.semester || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, semester: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <textarea
                      placeholder="Comments (optional)"
                      value={newGrade.comments || ''}
                      onChange={(e) => setNewGrade({ ...newGrade, comments: e.target.value })}
                      className="p-2 border rounded lg:col-span-3"
                    />
                  </div>
                  <button type="submit" className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Submit Grade
                  </button>
                </form>
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