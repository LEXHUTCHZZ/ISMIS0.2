"use client";

import { useEffect, useState, useCallback } from "react";
import styles from '../styles/dashboard.module.scss';
import loadingStyles from '../styles/loading.module.css';
import { FiHome, FiUser, FiSettings, FiBook, FiDollarSign, FiCreditCard, FiSun, FiMoon, FiBell } from 'react-icons/fi';
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from "next/navigation";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import CheckoutPage from "../../components/CheckoutPage";

interface Course {
  id: string;
  name: string;
  teacherId: string | null;
  resources: Resource[];
  assignments: Assignment[];
}

interface Transaction {
  id: string;
  amount: number;
  date: string;
  status: string;
}

interface Notification {
  id: string;
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
  courses: string[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  grades: Record<string, number>;
}

// Resource Form Component
const ResourceForm = ({
  courseId,
  onAddResource,
}: {
  courseId: string;
  onAddResource: (resource: Resource) => void;
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
    onAddResource({
      id: uuidv4(),
      title,
      type,
      url,
      description,
      uploadedBy: '', // Should be set by parent component with userData
      uploadedAt: new Date(),
      courseCode: courseId,
    });
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
  onAddAssignment: (assignment: Assignment) => void;
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
    onAddAssignment({
      id: uuidv4(),
      courseId,
      title,
      description,
      points,
      createdAt: new Date().toISOString(),
    });
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
          key={notif.id}
          className="flex justify-between items-center p-2 bg-gray-50 rounded"
        >
          <div>
            <p
              className={`text-blue-800 ${notif.read ? "opacity-50" : "font-medium"}`}
            >
              {notif.message || "No message"}
            </p>
            <p className="text-sm text-gray-600">
              {new Date(notif.date).toLocaleString()}
            </p>
          </div>
          {!notif.read && (
            <button
              onClick={() => onMarkAsRead(notif.id)}
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
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData>({
    id: '',
    name: '',
    email: '',
    teacherId: null,
    courses: [],
    totalOwed: 0,
    totalPaid: 0,
    balance: 0,
    paymentStatus: '',
    clearance: false,
    transactions: [],
    notifications: [],
    grades: {},
  });
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [newResource, setNewResource] = useState<Resource>({
    id: '',
    title: '',
    type: 'pdf',
    url: '',
    description: '',
    uploadedBy: '',
    uploadedAt: new Date(),
    courseCode: '',
  });
  const [newGrade, setNewGrade] = useState<Grade>({
    id: '',
    studentId: '',
    courseCode: '',
    courseName: '',
    mark: 0,
    grade: '',
    credits: 0,
    quality: 0,
    semester: '',
    updatedAt: new Date(),
  });

  const handleResourceUpload = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const resource: Resource = {
        id: uuidv4(),
        title: formData.get('title') as string,
        type: formData.get('type') as 'video' | 'pdf' | 'link',
        url: formData.get('url') as string,
        description: formData.get('description') as string,
        uploadedBy: userData?.id || '',
        uploadedAt: new Date(),
        courseCode: selectedCourseId,
        recipientId: formData.get('recipientId') as string,
      };
      try {
        await addDoc(collection(db, 'resources'), {
          ...resource,
          uploadedAt: serverTimestamp(),
        });
        setNewResource({
          id: '',
          title: '',
          type: 'pdf',
          url: '',
          description: '',
          uploadedBy: '',
          uploadedAt: new Date(),
          courseCode: '',
        });
      } catch (err) {
        setError('Failed to upload resource');
      }
    },
    [userData?.id, selectedCourseId]
  );

  const handleGradeSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const grade: Grade = {
        id: uuidv4(),
        studentId: selectedStudentId,
        courseCode: selectedCourseId,
        courseName: allCourses.find((c) => c.id === selectedCourseId)?.name || '',
        mark: Number(formData.get('mark')),
        grade: formData.get('grade') as string,
        credits: Number(formData.get('credits')),
        quality: Number(formData.get('quality')),
        comments: formData.get('comments') as string,
        semester: formData.get('semester') as string,
        updatedAt: new Date(),
      };
      try {
        await addDoc(collection(db, 'grades'), {
          ...grade,
          updatedAt: serverTimestamp(),
        });
        setNewGrade({
          id: '',
          studentId: '',
          courseCode: '',
          courseName: '',
          mark: 0,
          grade: '',
          credits: 0,
          quality: 0,
          semester: '',
          updatedAt: new Date(),
        });
      } catch (err) {
        setError('Failed to submit grade');
      }
    },
    [selectedStudentId, selectedCourseId, allCourses]
  );

  const handleDeleteAccount = useCallback(async () => {
    try {
      if (!userData?.id) return;
      await deleteDoc(doc(db, 'users', userData.id));
      await auth.currentUser?.delete();
      router.push('/');
    } catch (err) {
      setError('Failed to delete account');
    }
  }, [userData?.id, router]);

  const handlePaymentSuccess = useCallback(
    async (transaction: Transaction): Promise<void> => {
      if (!studentData) {
        setError("Student data is not available to process payment.");
        console.error("handlePaymentSuccess: studentData is null or undefined.");
        return; 
      }
      try {
        const studentId = studentData.id; 
        if (!studentId) {
            setError("Student ID is missing, cannot process payment.");
            console.error("handlePaymentSuccess: studentData.id is null or undefined.");
            return;
        }

        const newTransactionWithId = { ...transaction, studentId };
        const updatedTransactions = [...studentData.transactions, newTransactionWithId];
        
        setStudentData(prevStudentData => {
          if (!prevStudentData) {
            console.error("handlePaymentSuccess: prevStudentData for setStudentData is null.");
            return prevStudentData; // or some default/initial state if appropriate
          }
          return {
            ...prevStudentData,
            transactions: updatedTransactions,
            balance: prevStudentData.balance - transaction.amount,
          };
        });
      } catch (err) {
        console.error('Failed to process payment:', err); 
        setError('Failed to process payment. Please try again later.');
      }
    }, 
    [studentData, setStudentData, setError]
  );

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      const updatedNotifications = studentData.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      setStudentData({ ...studentData, notifications: updatedNotifications });
      // Update Firestore if necessary
    } catch (err) {
      setError('Failed to mark notification as read');
    }
  };

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
    document.documentElement.classList.toggle('dark-mode');
  };

  const handleGrantClearance = async (studentId: string) => {
    try {
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, { clearance: true });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
      );
    } catch (err) {
      setError('Failed to grant clearance');
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    try {
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, { clearance: false });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
      );
    } catch (err) {
      setError('Failed to remove clearance');
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    const tableData = allStudents.map((student) => [
      student.name,
      student.email,
      `${student.balance.toLocaleString()} JMD`,
      student.clearance ? 'Yes' : 'No',
    ]);
    autoTable(doc, {
      head: [['Name', 'Email', 'Balance', 'Clearance']],
      body: tableData,
    });
    doc.save('financial_report.pdf');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          setLoading(true);
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData: User = { id: firebaseUser.uid, ...userDoc.data() } as User;
            setUserData(userData);
            setRole(userData.role);
            setUsername(userData.name);

            if (userData.role === 'student') {
              const studentDoc = await getDoc(doc(db, 'students', firebaseUser.uid));
              if (studentDoc.exists()) {
                setStudentData(studentDoc.data() as StudentData);
              }
            } else if (userData.role === 'teacher' || userData.role === 'admin' || userData.role === 'accountsadmin') {
              const studentsQuery = await getDocs(collection(db, 'students'));
              const studentsData = studentsQuery.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as StudentData[];
              setAllStudents(studentsData);
              setFilteredStudents(studentsData);

              const coursesQuery = await getDocs(collection(db, 'courses'));
              const coursesData = coursesQuery.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as Course[];
              setAllCourses(coursesData);
            }
          } else {
            setError('User data not found');
            await signOut(auth);
            router.push('/login');
          }
        } catch (err) {
          setError('Failed to load user data');
        } finally {
          setLoading(false);
        }
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (searchQuery) {
      setFilteredStudents(
        allStudents.filter((student) =>
          student.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    } else {
      setFilteredStudents(allStudents);
    }
  }, [searchQuery, allStudents]);

  if (loading) {
    return (
      <div className={styles.app}>
        <header className={styles.appHeader}>
          <div className={styles.logo}>
            <img src="/logo.svg" alt="ISMIS Logo" />
            <h1>ISMIS</h1>
          </div>
          <nav className={styles.navigation}>
            <a href="#" className={styles.active}>Overview</a>
            <a href="#">Students</a>
            <a href="#">Courses</a>
            <a href="#">Payments</a>
            <a href="#">Reports</a>
          </nav>
          <div className={styles.userActions}>
            <button className={styles.themeToggle} onClick={toggleTheme}>
              {isDarkMode ? <FiSun /> : <FiMoon />}
            </button>
            <button className={`${styles.button} ${styles.secondary}`}>
              <FiBell />
              <span className={styles.badge}>
                {studentData.notifications.filter((n) => !n.read).length}
              </span>
            </button>
            <div className={styles.userProfile}>
              <img src={userData?.profilePicture || '/default-avatar.png'} alt="User" />
              <div className={styles.userInfo}>
                <span>{username}</span>
                <span>{role}</span>
              </div>
            </div>
          </div>
        </header>
        <main className={styles.mainContent}>
          <aside className={styles.sidebar}>
            <nav>
              <a href="#" className={styles.active}><FiHome /> Dashboard</a>
              <a href="#"><FiUser /> Profile</a>
              <a href="#"><FiBook /> Courses</a>
              <a href="#"><FiDollarSign /> Payments</a>
              <a href="#"><FiCreditCard /> Billing</a>
              <a href="#"><FiSettings /> Settings</a>
            </nav>
          </aside>
          <div className={styles.centerContent}>
            <div className={loadingStyles.loadingContainer}>
              <div className={loadingStyles.loader}></div>
              <div className={loadingStyles.loadingText}>Loading your dashboard...</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.logo}>
          <img src="/logo.svg" alt="ISMIS Logo" />
          <h1>ISMIS</h1>
        </div>
        <nav className={styles.navigation}>
          <a href="#" className={styles.active}>Overview</a>
          <a href="#">Students</a>
          <a href="#">Courses</a>
          <a href="#">Payments</a>
          <a href="#">Reports</a>
        </nav>
        <div className={styles.userActions}>
          <button className={styles.themeToggle} onClick={toggleTheme}>
            {isDarkMode ? <FiSun /> : <FiMoon />}
          </button>
          <button className={`${styles.button} ${styles.secondary}`}>
            <FiBell />
            <span className={styles.badge}>
              {studentData.notifications.filter((n) => !n.read).length}
            </span>
          </button>
          <div className={styles.userProfile}>
            <img src={userData?.profilePicture || '/default-avatar.png'} alt="User" />
            <div className={styles.userInfo}>
              <span>{username}</span>
              <span>{role}</span>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.mainContent}>
        <aside className={styles.sidebar}>
          <nav>
            <a href="#" className={styles.active}><FiHome /> Dashboard</a>
            <a href="#"><FiUser /> Profile</a>
            <a href="#"><FiBook /> Courses</a>
            <a href="#"><FiDollarSign /> Payments</a>
            <a href="#"><FiCreditCard /> Billing</a>
            <a href="#"><FiSettings /> Settings</a>
          </nav>
        </aside>
        <div className={styles.centerContent}>
          {error && <p className="text-red-600">{error}</p>}
          {role === "student" && (<>
              <div className={styles.section}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Notifications
                </h3>
                <NotificationList
                  notifications={studentData.notifications}
                  onMarkAsRead={markNotificationAsRead}
                />
              </div>
              
              <div className={styles.section}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Payments
                </h3>
                <p className="text-blue-800">Balance: {studentData.balance.toLocaleString()} JMD</p>
                <p className="text-blue-800">Status: {studentData.paymentStatus}</p>
                <p className="text-blue-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                {studentData.transactions.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-blue-800 font-medium">Transaction History</h4>
                    {studentData.transactions.map((txn) => (
                      <p key={txn.id} className="text-blue-800">
                        {new Date(txn.date).toLocaleString()}: {txn.amount.toLocaleString()} JMD - {txn.status}
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
                  <p className="text-green-600 mt-2">No outstanding balance.</p>
                )}
              </div>
              <div className={styles.section}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Your Grades
                </h3>
                {Object.keys(studentData.grades).length > 0 ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-blue-800 text-white">
                        <th className="p-2 border">Assignment</th>
                        <th className="p-2 border">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(studentData.grades).map(([key, grade]) => (
                        <tr key={key}>
                          <td className="p-2 border text-blue-800">{key}</td>
                          <td className="p-2 border text-blue-800">{grade}/100</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-blue-800">No grades available.</p>
                )}
              </div>
              <div className={styles.section}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Your Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {studentData.courses.length > 0 ? (
 studentData.courses.map((courseId) => {
 const course = allCourses.find((c) => c.id === courseId);
 if (!course) return null; // Skip if course not found
 return (
 <div key={course.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
 <h4 className="font-semibold text-blue-800">{course.name}</h4>
                        <p className="text-gray-600">Course materials and resources</p>
 <div className="flex flex-col space-y-2">
 <Link href={`/courses/${course.id}/materials`} className="text-blue-600 hover:underline">
 View Materials
 </Link>
 <Link href={`/courses/${course.id}/assignments`} className="text-blue-600 hover:underline">
 View Assignments
                        </Link>
                      </div>
 <p className="text-xs text-gray-500 mt-2">
 Grade: {studentData.grades[course.id] || 'Not Available'}
 </p>
 </div>
 );
 })
                  ) : (
                    <p className="text-blue-800">No resources available.</p>
                  )}
                </div>
              </div>
            </>
          )}
                {/* Teacher Statistics Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 p-4 bg-gray-100 rounded-lg shadow">
                  <div className="p-4 bg-blue-50 rounded-lg shadow-sm">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">Total Students</h3>
                    <p className="text-2xl font-bold text-blue-600">{allStudents.length}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg shadow-sm">
                    <h3 className="text-sm font-semibold text-green-800 mb-2">Resources Uploaded</h3>
                    <p className="text-2xl font-bold text-green-600">
                      {allCourses.reduce((acc, course) => acc + (course.resources?.length || 0), 0)}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg shadow-sm">
                    <h3 className="text-sm font-semibold text-purple-800 mb-2">Active Assignments</h3>
                    <p className="text-2xl font-bold text-purple-600">
                      {selectedCourseId ? allCourses.find((c) => c.id === selectedCourseId)?.assignments?.length || 0 : 0}
                    </p>
                  </div>
                </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={styles.section}>
                  <div className={styles.section}>
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Upload Resources
                    </h3>
                    <form onSubmit={handleResourceUpload} className="space-y-4">
                      <select
                        value={newResource.recipientId || ''}
                        onChange={(e) => setNewResource({ ...newResource, recipientId: e.target.value })}
                        className="p-2 border rounded"
                        required
                      >
                        <option value="">Select Student</option>
                        {allStudents.map((student) => (
                          <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Resource Title"
                        value={newResource.title}
                        onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                        className="p-2 border rounded"
                        required
                      />
                      <select
                        value={newResource.type}
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
                        value={newResource.url}
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
                        value={newResource.description}
                        onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                        className="p-2 border rounded"
                        rows={3}
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Upload Resource
                      </button>
                    </form>
                  </div>
                  <div className={styles.section}>
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Manage Grades
                    </h3>
                    <form onSubmit={handleGradeSubmit} className="space-y-4">
                      <select
                        value={newGrade.studentId}
                        onChange={(e) => setNewGrade({ ...newGrade, studentId: e.target.value })}
                        className="p-2 border rounded"
                        required
                      >
                        <option value="">Select Student</option>
                        {allStudents.map((student) => (
                          <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Course Code"
                        value={newGrade.courseCode}
                        onChange={(e) => setNewGrade({ ...newGrade, courseCode: e.target.value })}
                        className="p-2 border rounded"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Course Name"
                        value={newGrade.courseName}
                        onChange={(e) => setNewGrade({ ...newGrade, courseName: e.target.value })}
                        className="p-2 border rounded"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Mark (0-100)"
                        value={newGrade.mark}
                        onChange={(e) => setNewGrade({ ...newGrade, mark: parseInt(e.target.value) || 0 })}
                        min="0"
                        max="100"
                        className="p-2 border rounded"
                        required
                      />
                      <select
                        value={newGrade.grade}
                        onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                        className="p-2 border rounded"
                        required
                      >
                        <option value="">Select Grade</option>
                        {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'].map((grade) => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Credits"
                        value={newGrade.credits}
                        onChange={(e) => setNewGrade({ ...newGrade, credits: parseInt(e.target.value) || 0 })}
                        min="1"
                        className="p-2 border rounded"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Semester (e.g., Fall 2023)"
                        value={newGrade.semester}
                        onChange={(e) => setNewGrade({ ...newGrade, semester: e.target.value })}
                        className="p-2 border rounded"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Submit Grade
                      </button>
                    </form>
                  </div>
                </div>
                <div className={styles.section}>
                  <div className={styles.section}>
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Student Progress
                    </h3>
                    <div className="space-y-4">
                      {allStudents.length > 0 ? (
                        allStudents.map((student) => (
                          <div key={student.id} className="p-4 bg-gray-50 rounded">
                            <h4 className="font-medium text-blue-800">{student.name}</h4>
                            <div className="mt-2 text-sm text-gray-600">
                              <p>Assignments Completed: {Object.keys(student.grades).length}</p>
                              <p>
                                Average Grade:{' '}
                                {Object.values(student.grades).length > 0
                                  ? (Object.values(student.grades).reduce((a, b) => a + b, 0) / Object.values(student.grades).length).toFixed(1)
                                  : 'N/A'}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-blue-800">No students available.</p>
                      )}
                    </div>
                  </div>
                  <div className={styles.section}>
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
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        onClick={() => alert('Announcement feature coming soon!')}
                      >
                        Post Announcement
                      </button>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">
                      Available Resources
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {allCourses.length > 0 ? (
 allCourses.map((course) => (
 <div key={course.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
 <h4 className="font-semibold text-blue-800">{course.name}</h4>
 <p className="text-sm text-gray-600 mb-2">Course Materials and Resources</p>
 <div className="flex flex-col space-y-2">
 <Link href={`/courses/${course.id}/materials`} className="text-blue-600 hover:underline">
 View Materials
 </Link>
 <Link href={`/courses/${course.id}/assignments`} className="text-blue-600 hover:underline">
 View Assignments
 </Link>
 </div>
 {course.resources && course.resources.length > 0 && (
 <div className="mt-4">
 <h5 className="text-sm font-medium text-blue-800 mb-2">Resources:</h5>
 <ul className="list-disc list-inside text-sm text-gray-600">
 {course.resources.map((resource) => (
 <li key={resource.id}>
 <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
 {resource.title} ({resource.type})
 </a>
 </li>
 ))}
 </ul>
                            </div>
 )}
 {course.assignments && course.assignments.length > 0 && (
 <div className="mt-4">
 <h5 className="text-sm font-medium text-blue-800 mb-2">Assignments:</h5>
 <ul className="list-disc list-inside text-sm text-gray-600">
 {course.assignments.map((assignment) => (
 <li key={assignment.id}>{assignment.title} ({assignment.points} points)</li>
 ))}
 </ul>
                            </div>
 )}
                        </div>
 ))
 ) : (
 <p className="text-blue-800">No courses available.</p>
 )}
                </div>
          {(role === "admin" || role === "accountsadmin") && (
            <div className={styles.section}>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
 {/* Admin/Accounts Admin Overview Metrics (optional) */}
 </div>
              <div className={`${styles.section} ${role === 'accountsadmin' ? 'hidden' : ''}`}>
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
                        <div key={student.id} className="flex items-center space-x-4 p-2 border-b">
                          <div>
                            <p className="text-blue-800 font-medium">{student.name}</p>
                            <p className="text-blue-800 text-sm">Email: {student.email}</p>
                            <p className="text-blue-800 text-sm">Balance: {student.balance.toLocaleString()} JMD</p>
                            <p className="text-blue-800 text-sm">Clearance: {student.clearance ? "Yes" : "No"}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-blue-800">No students found.</p>
                    )}
                  </div>
                )}
              </div>
              <div className={`${styles.section} ${role === 'accountsadmin' ? 'hidden' : ''}`}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Upload Resources
                </h3>
                <form onSubmit={handleResourceUpload} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <select
                      value={newResource.recipientId || ''}
                      onChange={(e) => setNewResource({ ...newResource, recipientId: e.target.value })}
                      className="p-2 border rounded"
                      required
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((student) => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Resource Title"
                      value={newResource.title}
                      onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <select
                      value={newResource.type}
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
                      value={newResource.url}
                      onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <textarea
                      placeholder="Description"
                      value={newResource.description}
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
              <div className={styles.section}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Available Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {allCourses.length > 0 ? (
 allCourses.map((course) => (
 <div key={course.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
 <h4 className="font-semibold text-blue-800">{course.name}</h4>
                        <p className="text-sm text-gray-600 mb-2">Course Materials and Resources</p>
                        <div className="flex flex-col space-y-2">
 <Link href={`/courses/${course.id}/materials`} className="text-blue-600 hover:underline">
                            View Materials
                          </Link>
 <Link href={`/courses/${course.id}/assignments`} className="text-blue-600 hover:underline">
                            View Assignments
                          </Link>
                        </div>
 {course.resources && course.resources.length > 0 && (
 <div className="mt-4">
 <h5 className="text-sm font-medium text-blue-800 mb-2">Resources:</h5>
 <ul className="list-disc list-inside text-sm text-gray-600">
 {course.resources.map((resource) => (
 <li key={resource.id}>
 <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
 {resource.title} ({resource.type})
 </a>
 </li>
 ))}
 </ul>
                            </div>
 )}
 {course.assignments && course.assignments.length > 0 && (
 <div className="mt-4">
 <h5 className="text-sm font-medium text-blue-800 mb-2">Assignments:</h5>
 <ul className="list-disc list-inside text-sm text-gray-600">
 {course.assignments.map((assignment) => (
 <li key={assignment.id}>{assignment.title} ({assignment.points} points)</li>
 ))}
 </ul>
                            </div>
 )}
                      </div>
                    ))
                  ) : (
                    <p className="text-blue-800">No courses available.</p>
                  )}
                </div>
              </div>
              <div className={`${styles.section} ${role === 'accountsadmin' ? 'hidden' : ''}`}>
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Manage Grades
                </h3>
                <form onSubmit={handleGradeSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <select
                      value={newGrade.studentId}
                      onChange={(e) => setNewGrade({ ...newGrade, studentId: e.target.value })}
                      className="p-2 border rounded"
                      required
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((student) => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Course Code"
                      value={newGrade.courseCode}
                      onChange={(e) => setNewGrade({ ...newGrade, courseCode: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Course Name"
                      value={newGrade.courseName}
                      onChange={(e) => setNewGrade({ ...newGrade, courseName: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Mark (%)"
                      value={newGrade.mark}
                      onChange={(e) => setNewGrade({ ...newGrade, mark: Number(e.target.value) })}
                      className="p-2 border rounded"
                      required
                      min="0"
                      max="100"
                    />
                    <input
                      type="text"
                      placeholder="Grade (A, B, C, etc.)"
                      value={newGrade.grade}
                      onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Credits"
                      value={newGrade.credits}
                      onChange={(e) => setNewGrade({ ...newGrade, credits: Number(e.target.value) })}
                      className="p-2 border rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Semester (e.g., 2023-2024 - 1)"
                      value={newGrade.semester}
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
              <div className={`${styles.section} ${role === 'accountsadmin' ? 'hidden' : ''}`}>
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
                          <td className="p-2 border text-blue-800">{student.name}</td>
                          <td className="p-2 border text-blue-800">{student.email}</td>
                          <td className="p-2 border text-blue-800">{student.balance.toLocaleString()} JMD</td>
                          <td className="p-2 border">
                            <button
                              onClick={() =>
                                student.clearance
                                  ? handleRemoveClearance(student.id)
                                  : handleGrantClearance(student.id)
                              }
                              className={`px-2 py-1 rounded text-white ${
                                student.clearance ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                              }`}
                            >
                              {student.clearance ? "Revoke" : "Grant"}
                            </button>
                          </td>
                          <td className="p-2 border">
                            <button
                              onClick={() => handleDeleteAccount()}
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
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Payment History
                </h3>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800 mb-4"
                >
                  <option value="">Select a Student</option>
                  {allStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
                {selectedStudentId && (
                  (() => {
                    const student = allStudents.find((s) => s.id === selectedStudentId);
                    return student?.transactions.length ? (
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
                              <td className="p-2 border text-blue-800">{new Date(txn.date).toLocaleString()}</td>
                              <td className="p-2 border text-blue-800">{txn.amount.toLocaleString()} JMD</td>
                              <td className="p-2 border text-blue-800">{txn.status}</td>
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
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  Payment History
                </h3>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2 border rounded text-blue-800 mb-4"
                >
                  <option value="">Select a Student</option>
                  {allStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
                {selectedStudentId && (
                  (() => {
                    const student = allStudents.find((s) => s.id === selectedStudentId);
                    return student?.transactions.length ? (
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
                              <td className="p-2 border text-blue-800">{new Date(txn.date).toLocaleString()}</td>
                              <td className="p-2 border text-blue-800">{txn.amount.toLocaleString()} JMD</td>
                              <td className="p-2 border text-blue-800">{txn.status}</td>
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
      </main>
    </div>
  );
}