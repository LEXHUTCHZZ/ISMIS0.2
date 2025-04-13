"use client";

import { useEffect, useState, Component, ReactNode } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  StudentData,
  Course,
  Transaction,
  Notification,
  Resource,
  Test,
  TestResponse,
  User,
  Subject,
} from "../../models";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <p className="text-red-800 text-center">Something went wrong. Please try again.</p>;
    }
    return this.props.children;
  }
}

// Reusable Components
const NotificationList = ({
  notifications,
  onMarkAsRead,
}: {
  notifications: Notification[];
  onMarkAsRead: (notificationId: string) => void;
}) => (
  <div className="mt-4">
    <h3 className="text-lg font-semibold text-red-800">Notifications</h3>
    {notifications.length === 0 ? (
      <p className="text-gray-600">No notifications</p>
    ) : (
      <ul className="space-y-2">
        {notifications.map((notification) => (
          <li key={notification.id} className="p-2 bg-white rounded shadow">
            <p className="text-red-800">{notification.message}</p>
            <p className="text-sm text-gray-500">{new Date(notification.date).toLocaleString()}</p>
            {!notification.read && (
              <button
                onClick={() => onMarkAsRead(notification.id)}
                className="text-blue-600 hover:underline text-sm"
              >
                Mark as Read
              </button>
            )}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const ResourceForm = ({
  courseId,
  onAddResource,
}: {
  courseId: string;
  onAddResource: (courseId: string, name: string, url: string, type: string) => void;
}) => {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("Video");

  const handleSubmit = () => {
    if (!name.trim() || !url.trim() || !type) {
      alert("Please fill in all fields.");
      return;
    }
    if (!/^https?:\/\/[^\s$.?#].[^\s]*$/.test(url)) {
      alert("Invalid URL format.");
      return;
    }
    onAddResource(courseId, name, url, type);
    setName("");
    setUrl("");
    setType("Video");
  };

  return (
    <div className="mt-4">
      <input
        type="text"
        placeholder="Resource Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="p-2 border rounded text-red-800 w-full mb-2"
      />
      <input
        type="text"
        placeholder="Resource URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="p-2 border rounded text-red-800 w-full mb-2"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="p-2 border rounded text-red-800 w-full mb-2"
      >
        <option value="Video">Video</option>
        <option value="Document">Document</option>
        <option value="Link">Link</option>
      </select>
      <button
        onClick={handleSubmit}
        className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 w-full"
      >
        Add Resource
      </button>
    </div>
  );
};

const GradeForm = ({
  studentId,
  courseId,
  subject,
  onGradeUpdate,
}: {
  studentId: string;
  courseId: string;
  subject: Subject;
  onGradeUpdate: (
    studentId: string,
    courseId: string,
    subjectName: string,
    field: string,
    value: string
  ) => void;
}) => {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-24">Classwork 1:</span>
        <input
          type="number"
          min="0"
          max="100"
          value={subject.grades?.C1 || ""}
          onChange={(e) => onGradeUpdate(studentId, courseId, subject.name, "C1", e.target.value)}
          className="p-1 border rounded text-red-800 w-20"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24">Classwork 2:</span>
        <input
          type="number"
          min="0"
          max="100"
          value={subject.grades?.C2 || ""}
          onChange={(e) => onGradeUpdate(studentId, courseId, subject.name, "C2", e.target.value)}
          className="p-1 border rounded text-red-800 w-20"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24">Exam:</span>
        <input
          type="number"
          min="0"
          max="100"
          value={subject.grades?.exam || ""}
          onChange={(e) => onGradeUpdate(studentId, courseId, subject.name, "exam", e.target.value)}
          className="p-1 border rounded text-red-800 w-20"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24">Final Grade:</span>
        <span className="font-medium">
          {subject.grades?.final || "N/A"}
        </span>
      </div>
    </div>
  );
};

// Main Dashboard Component
type Role = "student" | "teacher" | "admin" | "accountsadmin";

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<Role | "">("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<Role>("student");
  const [newSubject, setNewSubject] = useState("");
  const [activeStatus, setActiveStatus] = useState<Record<string, boolean>>({});
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

      setIsLoading(true);
      try {
        // Fetch user data
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
          throw new Error("User document does not exist");
        }

        const fetchedUserData = userSnap.data() as User;
        const userRole = fetchedUserData.role as Role;
        if (!["student", "teacher", "admin", "accountsadmin"].includes(userRole)) {
          throw new Error("Invalid user role");
        }
        setRole(userRole);
        setUsername(fetchedUserData.name || "Unnamed");
        setUserData(fetchedUserData);
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening");

        // Fetch student data for students
        if (userRole === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          if (studentSnap.exists()) {
            const fetchedStudentData = studentSnap.data() as StudentData;
            setStudentData({
              ...fetchedStudentData,
              id: currentUser.uid,
              transactions: fetchedStudentData.transactions || [],
              notifications: fetchedStudentData.notifications || [],
              courses: fetchedStudentData.courses || [],
            });
          }
        }

        // Fetch all courses
        const coursesSnapshot = await getDocs(collection(db, "courses"));
        const coursesList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        setAllCourses(coursesList);

        // Fetch all students for admin/teacher/accountsadmin
        if (["teacher", "admin", "accountsadmin"].includes(userRole)) {
          const studentsSnapshot = await getDocs(collection(db, "students"));
          const studentsList = studentsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as StudentData[];
          setAllStudents(studentsList);

          // Set initial active status (simulating online status)
          const statuses: Record<string, boolean> = {};
          studentsList.forEach((student) => {
            statuses[student.id] = Math.random() > 0.5; // Random status for demo
          });
          setActiveStatus(statuses);
        }
      } catch (err: any) {
        console.error("Error loading dashboard:", err);
        setError("Failed to load dashboard: " + err.message);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  // ADMIN FUNCTIONS
  const handleDeleteAccount = async (studentId: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "students", studentId));
      await deleteDoc(doc(db, "users", studentId));
      setAllStudents(allStudents.filter((s) => s.id !== studentId));
      alert("Account deleted successfully");
    } catch (err: any) {
      alert("Failed to delete account: " + err.message);
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents(allStudents.map((s) => 
        s.id === studentId ? { ...s, clearance: true } : s
      ));
      alert("Clearance granted");
    } catch (err: any) {
      alert("Failed to grant clearance: " + err.message);
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents(allStudents.map((s) => 
        s.id === studentId ? { ...s, clearance: false } : s
      ));
      alert("Clearance removed");
    } catch (err: any) {
      alert("Failed to remove clearance: " + err.message);
    }
  };

  // TEACHER FUNCTIONS
  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher") return;
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
      setAllCourses(allCourses.map((c) => 
        c.id === courseId ? { ...c, resources: [...(c.resources || []), newResource] } : c
      ));
      alert("Resource added successfully");
    } catch (err: any) {
      alert("Failed to add resource: " + err.message);
    }
  };

  const handleGradeUpdate = async (
    studentId: string,
    courseId: string,
    subjectName: string,
    field: string,
    value: string
  ) => {
    if (role !== "teacher") return;
    
    try {
      const studentRef = doc(db, "students", studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) return;

      const studentData = studentSnap.data() as StudentData;
      const updatedCourses = studentData.courses?.map((course) => {
        if (course.id === courseId) {
          const updatedSubjects = course.subjects?.map((subject) => {
            if (subject.name === subjectName) {
              const updatedGrades = { ...subject.grades, [field]: value };
              
              // Calculate final grade (40% classwork, 60% exam)
              const classworkKeys = Object.keys(updatedGrades).filter(k => k.startsWith("C"));
              const classworkValues = classworkKeys
                .map(k => parseFloat(updatedGrades[k] || "0"))
                .filter(v => !isNaN(v));
              const exam = parseFloat(updatedGrades.exam || "0");
              
              if (classworkValues.length && !isNaN(exam)) {
                const classworkAvg = classworkValues.reduce((sum, v) => sum + v, 0) / classworkValues.length;
                updatedGrades.final = (classworkAvg * 0.4 + exam * 0.6).toFixed(2);
              }
              
              return { ...subject, grades: updatedGrades };
            }
            return subject;
          });
          return { ...course, subjects: updatedSubjects };
        }
        return course;
      });

      await updateDoc(studentRef, { courses: updatedCourses });
      setAllStudents(allStudents.map((s) => 
        s.id === studentId ? { ...s, courses: updatedCourses || [] } : s
      ));
    } catch (err: any) {
      console.error("Error updating grade:", err);
    }
  };

  const handleAddSubject = async (studentId: string, courseId: string, subjectName: string) => {
    if (role !== "teacher") return;
    try {
      const studentRef = doc(db, "students", studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) return;

      const studentData = studentSnap.data() as StudentData;
      const updatedCourses = studentData.courses?.map((course) => {
        if (course.id === courseId) {
          const newSubject: Subject = {
            name: subjectName,
            grades: {},
          };
          return {
            ...course,
            subjects: [...(course.subjects || []), newSubject],
          };
        }
        return course;
      });

      await updateDoc(studentRef, { courses: updatedCourses });
      setAllStudents(allStudents.map((s) => 
        s.id === studentId ? { ...s, courses: updatedCourses || [] } : s
      ));
      setNewSubject("");
      alert("Subject added successfully");
    } catch (err: any) {
      alert("Failed to add subject: " + err.message);
    }
  };

  // STUDENT FUNCTIONS
  const handlePaymentSuccess = async (amount: number) => {
    if (!studentData || !user) return;
    try {
      const updatedBalance = (studentData.balance || 0) - amount;
      const updatedTotalPaid = (studentData.totalPaid || 0) + amount;
      const paymentStatus = updatedBalance <= 0 ? "Paid" : "Partial";
      
      const newTransaction: Transaction = {
        id: new Date().toISOString(),
        amount,
        date: new Date().toISOString(),
        status: "Completed",
      };
      
      const updatedTransactions = [...(studentData.transactions || []), newTransaction];
      
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
      alert("Failed to process payment: " + err.message);
    }
  };

  // ACCOUNTS ADMIN FUNCTIONS
  const handleGenerateFinancialReport = () => {
    if (role !== "accountsadmin") return;
    try {
      const doc = new jsPDF();
      doc.text("Financial Report", 20, 20);
      
      const data = allStudents.map((student) => [
        student.name || "Unknown",
        `$${(student.totalOwed || 0).toFixed(2)}`,
        `$${(student.totalPaid || 0).toFixed(2)}`,
        `$${(student.balance || 0).toFixed(2)}`,
        student.paymentStatus || "N/A",
        student.clearance ? "Yes" : "No",
      ]);
      
      autoTable(doc, {
        head: [["Student", "Total Owed", "Total Paid", "Balance", "Status", "Clearance"]],
        body: data,
      });
      
      doc.save("financial_report.pdf");
    } catch (err: any) {
      alert("Failed to generate report: " + err.message);
    }
  };

  // COMMON FUNCTIONS
  const handleMarkNotificationAsRead = async (notificationId: string) => {
    if (!user || !studentData) return;
    try {
      await markNotificationAsRead(user.uid, notificationId);
      setStudentData({
        ...studentData,
        notifications: studentData.notifications?.map((n) => 
          n.id === notificationId ? { ...n, read: true } : n
        ) || [],
      });
    } catch (err: any) {
      console.error("Error marking notification as read:", err);
    }
  };

  // Filter students based on search term
  const filteredStudents = allStudents.filter((student) =>
    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <p className="text-red-800 text-center">Loading...</p>;
  }

  if (error) {
    return <p className="text-red-800 text-center">{error}</p>;
  }

  if (!userData || !role) {
    return <p className="text-red-800 text-center">User data not found.</p>;
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-gray-100">
        {/* Sidebar */}
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
            {role === "admin" && (
              <li>
                <Link href="/admin/management" className="text-red-800 hover:underline">
                  Management
                </Link>
              </li>
            )}
            {role === "accountsadmin" && (
              <li>
                <button
                  onClick={handleGenerateFinancialReport}
                  className="text-red-800 hover:underline"
                >
                  Financial Report
                </button>
              </li>
            )}
          </ul>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
              {greeting}, {username}!
            </h1>

            {/* STUDENT DASHBOARD */}
            {role === "student" && studentData && (
              <div className="space-y-6">
                {/* Payment Section */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Payment Information</h2>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-gray-600">Total Owed:</p>
                      <p className="text-lg font-bold">${(studentData.totalOwed || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Paid:</p>
                      <p className="text-lg font-bold">${(studentData.totalPaid || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Balance:</p>
                      <p className="text-lg font-bold">${(studentData.balance || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <CheckoutPage 
                    studentId={user?.uid || ""} 
                    onPaymentSuccess={handlePaymentSuccess} 
                  />
                </div>

                {/* Courses and Grades */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Your Courses</h2>
                  {studentData.courses?.length ? (
                    studentData.courses.map((course) => (
                      <div key={course.id} className="mb-6">
                        <h3 className="text-lg font-medium text-red-800">{course.name}</h3>
                        
                        {/* Resources */}
                        <div className="mt-2">
                          <h4 className="font-medium text-red-800">Resources</h4>
                          {course.resources?.length ? (
                            <ul className="list-disc pl-5 mt-2">
                              {course.resources.map((resource) => (
                                <li key={resource.id} className="mb-1">
                                  <a 
                                    href={resource.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {resource.name} ({resource.type})
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-gray-600">No resources available</p>
                          )}
                        </div>
                        
                        {/* Grades */}
                        <div className="mt-4">
                          <h4 className="font-medium text-red-800">Grades</h4>
                          {course.subjects?.length ? (
                            <div className="mt-2 space-y-4">
                              {course.subjects.map((subject) => (
                                <div key={subject.name} className="border-b pb-2">
                                  <h5 className="font-medium">{subject.name}</h5>
                                  <div className="grid grid-cols-4 gap-4 mt-2">
                                    <div>
                                      <p className="text-gray-600">Classwork 1:</p>
                                      <p>{subject.grades?.C1 || "N/A"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600">Classwork 2:</p>
                                      <p>{subject.grades?.C2 || "N/A"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600">Exam:</p>
                                      <p>{subject.grades?.exam || "N/A"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600">Final Grade:</p>
                                      <p className="font-bold">{subject.grades?.final || "N/A"}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-600">No grades available</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No courses enrolled</p>
                  )}
                </div>

                {/* Notifications */}
                {studentData.notifications?.length > 0 && (
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-red-800 mb-4">Notifications</h2>
                    <NotificationList
                      notifications={studentData.notifications}
                      onMarkAsRead={handleMarkNotificationAsRead}
                    />
                  </div>
                )}
              </div>
            )}

            {/* TEACHER DASHBOARD */}
            {role === "teacher" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Manage Students</h2>
                  
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded text-red-800 w-full mb-4"
                  />
                  
                  {filteredStudents.length ? (
                    filteredStudents.map((student) => (
                      <div key={student.id} className="mb-6 border-b pb-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-medium text-red-800">
                            {student.name} ({student.email})
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs ${
                            activeStatus[student.id] ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                          }`}>
                            {activeStatus[student.id] ? "Online" : "Offline"}
                          </span>
                        </div>
                        
                        {student.courses?.length ? (
                          student.courses.map((course) => (
                            <div key={course.id} className="mt-4 pl-4">
                              <h4 className="font-medium">{course.name}</h4>
                              
                              {/* Add Resource Form */}
                              <div className="mt-2">
                                <ResourceForm 
                                  courseId={course.id} 
                                  onAddResource={handleAddResource} 
                                />
                              </div>
                              
                              {/* Subjects and Grades */}
                              {course.subjects?.length ? (
                                <div className="mt-4 space-y-4">
                                  {course.subjects.map((subject) => (
                                    <div key={subject.name} className="border-l-2 border-red-200 pl-4">
                                      <h5 className="font-medium">{subject.name}</h5>
                                      <GradeForm
                                        studentId={student.id}
                                        courseId={course.id}
                                        subject={subject}
                                        onGradeUpdate={handleGradeUpdate}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600 mt-2">No subjects</p>
                              )}
                              
                              {/* Add Subject Form */}
                              <div className="mt-4 flex gap-2">
                                <input
                                  type="text"
                                  placeholder="New subject name"
                                  value={newSubject}
                                  onChange={(e) => setNewSubject(e.target.value)}
                                  className="p-2 border rounded text-red-800 flex-1"
                                />
                                <button
                                  onClick={() => handleAddSubject(student.id, course.id, newSubject)}
                                  className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                                  disabled={!newSubject.trim()}
                                >
                                  Add Subject
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-600 mt-2">No courses</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No students found</p>
                  )}
                </div>
              </div>
            )}

            {/* ADMIN DASHBOARD */}
            {role === "admin" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Student Management</h2>
                  
                  <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                      <h3 className="font-medium text-red-800 mb-2">Add New Student</h3>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Name"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          className="p-2 border rounded text-red-800 w-full"
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                          className="p-2 border rounded text-red-800 w-full"
                        />
                        <button
                          onClick={async () => {
                            if (!userName.trim() || !userEmail.trim()) {
                              alert("Please fill in all fields");
                              return;
                            }
                            
                            try {
                              const userRef = doc(collection(db, "users"));
                              const newUser: User = {
                                id: userRef.id,
                                name: userName,
                                email: userEmail,
                                role: "student",
                              };
                              await setDoc(userRef, newUser);
                              
                              const newStudent: StudentData = {
                                id: userRef.id,
                                name: userName,
                                email: userEmail,
                                lecturerId: "", // Provide a default or appropriate value for lecturerId
                                courses: [],
                                transactions: [],
                                notifications: [],
                                totalOwed: 0,
                                totalPaid: 0,
                                balance: 0,
                                paymentStatus: "Unpaid",
                                clearance: false,
                              };
                              await setDoc(doc(db, "students", userRef.id), newStudent);
                              
                              setAllStudents([...allStudents, newStudent]);
                              setUserName("");
                              setUserEmail("");
                              alert("Student added successfully");
                            } catch (err: any) {
                              alert("Failed to add student: " + err.message);
                            }
                          }}
                          className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700 w-full"
                        >
                          Add Student
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="font-medium text-red-800 mb-2">Add New Course</h3>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Course Name"
                          value={courseName}
                          onChange={(e) => setCourseName(e.target.value)}
                          className="p-2 border rounded text-red-800 w-full"
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={courseDesc}
                          onChange={(e) => setCourseDesc(e.target.value)}
                          className="p-2 border rounded text-red-800 w-full"
                        />
                        <button
                          onClick={async () => {
                            if (!courseName.trim() || !courseDesc.trim()) {
                              alert("Please fill in all fields");
                              return;
                            }
                            
                            try {
                              const courseRef = doc(collection(db, "courses"));
                              const newCourse: Course = {
                                id: courseRef.id,
                                name: courseName,
                                description: courseDesc,
                                resources: [],
                                tests: [],
                                fee: 0, // Default fee value
                                subjects: [], // Default empty subjects array
                                coursework: [], // Default empty coursework array
                              };
                              await setDoc(courseRef, newCourse);
                              
                              setAllCourses([...allCourses, newCourse]);
                              setCourseName("");
                              setCourseDesc("");
                              alert("Course added successfully");
                            } catch (err: any) {
                              alert("Failed to add course: " + err.message);
                            }
                          }}
                          className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700 w-full"
                        >
                          Add Course
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded text-red-800 w-full mb-4"
                  />
                  
                  {filteredStudents.length ? (
                    <div className="space-y-4">
                      {filteredStudents.map((student) => (
                        <div key={student.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-medium text-red-800">
                                {student.name} ({student.email})
                              </h3>
                              <p className="text-gray-600">
                                Status: {activeStatus[student.id] ? "Online" : "Offline"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGrantClearance(student.id)}
                                disabled={student.clearance}
                                className={`px-3 py-1 rounded text-sm ${
                                  student.clearance 
                                    ? "bg-gray-200 text-gray-600 cursor-not-allowed" 
                                    : "bg-green-600 text-white hover:bg-green-700"
                                }`}
                              >
                                Grant Clearance
                              </button>
                              <button
                                onClick={() => handleRemoveClearance(student.id)}
                                disabled={!student.clearance}
                                className={`px-3 py-1 rounded text-sm ${
                                  !student.clearance 
                                    ? "bg-gray-200 text-gray-600 cursor-not-allowed" 
                                    : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                              >
                                Remove Clearance
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(student.id)}
                                className="px-3 py-1 bg-red-800 text-white rounded text-sm hover:bg-red-700"
                              >
                                Delete Account
                              </button>
                            </div>
                          </div>
                          
                          <div className="mt-4 grid grid-cols-4 gap-4">
                            <div>
                              <p className="text-gray-600">Total Owed:</p>
                              <p>${(student.totalOwed || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Total Paid:</p>
                              <p>${(student.totalPaid || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Balance:</p>
                              <p>${(student.balance || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Payment Status:</p>
                              <p>{student.paymentStatus || "N/A"}</p>
                            </div>
                          </div>
                          
                          {student.courses?.length ? (
                            <div className="mt-4">
                              <h4 className="font-medium text-red-800">Enrolled Courses</h4>
                              <ul className="list-disc pl-5 mt-2">
                                {student.courses.map((course) => (
                                  <li key={course.id}>{course.name}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-gray-600 mt-4">No courses enrolled</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">No students found</p>
                  )}
                </div>
              </div>
            )}

            {/* ACCOUNTS ADMIN DASHBOARD */}
            {role === "accountsadmin" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Financial Management</h2>
                  
                  <div className="flex justify-between items-center mb-4">
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="p-2 border rounded text-red-800 w-64"
                    />
                    <button
                      onClick={handleGenerateFinancialReport}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Generate Report
                    </button>
                  </div>
                  
                  {filteredStudents.length ? (
                    <div className="space-y-4">
                      {filteredStudents.map((student) => (
                        <div key={student.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-medium text-red-800">
                                {student.name} ({student.email})
                              </h3>
                              <p className="text-gray-600">
                                Status: {student.paymentStatus || "N/A"} | 
                                Clearance: {student.clearance ? "Granted" : "Not Granted"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGrantClearance(student.id)}
                                disabled={student.clearance}
                                className={`px-3 py-1 rounded text-sm ${
                                  student.clearance 
                                    ? "bg-gray-200 text-gray-600 cursor-not-allowed" 
                                    : "bg-green-600 text-white hover:bg-green-700"
                                }`}
                              >
                                Grant Clearance
                              </button>
                              <button
                                onClick={() => handleRemoveClearance(student.id)}
                                disabled={!student.clearance}
                                className={`px-3 py-1 rounded text-sm ${
                                  !student.clearance 
                                    ? "bg-gray-200 text-gray-600 cursor-not-allowed" 
                                    : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                              >
                                Remove Clearance
                              </button>
                            </div>
                          </div>
                          
                          <div className="mt-4 grid grid-cols-4 gap-4">
                            <div>
                              <p className="text-gray-600">Total Owed:</p>
                              <p>${(student.totalOwed || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Total Paid:</p>
                              <p>${(student.totalPaid || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Balance:</p>
                              <p>${(student.balance || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Payment Status:</p>
                              <p>{student.paymentStatus || "N/A"}</p>
                            </div>
                          </div>
                          
                          {student.transactions?.length ? (
                            <div className="mt-4">
                              <h4 className="font-medium text-red-800">Transaction History</h4>
                              <div className="mt-2 space-y-2">
                                {student.transactions.map((txn) => (
                                  <div key={txn.id} className="border-b pb-2">
                                    <p>
                                      <span className="font-medium">${txn.amount.toFixed(2)}</span> - 
                                      {new Date(txn.date).toLocaleString()} - 
                                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                                        txn.status === "Completed" 
                                          ? "bg-green-100 text-green-800" 
                                          : "bg-yellow-100 text-yellow-800"
                                      }`}>
                                        {txn.status}
                                      </span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-600 mt-4">No transactions</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">No students found</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}