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
  addDoc
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
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("Please enter a resource name");
      return;
    }
    if (!url.trim() || !url.match(/^https?:\/\//)) {
      alert("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setIsUploading(true);
    try {
      await onAddResource(courseId, name, url, type);
      setName("");
      setUrl("");
      setType("Video");
    } catch (err) {
      console.error("Error adding resource:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mt-4">
      <input
        type="text"
        placeholder="Resource Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="p-2 border rounded text-red-800 w-full mb-2"
        required
      />
      <input
        type="url"
        placeholder="Resource URL (must start with http:// or https://)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="p-2 border rounded text-red-800 w-full mb-2"
        required
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
        disabled={isUploading}
        className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 w-full disabled:bg-gray-400"
      >
        {isUploading ? "Uploading..." : "Add Resource"}
      </button>
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

        // Fetch all students for admin/teacher
        if (["teacher", "admin"].includes(userRole)) {
          const studentsSnapshot = await getDocs(collection(db, "students"));
          const studentsList = studentsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as StudentData[];
          setAllStudents(studentsList);
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

  // TEACHER FUNCTIONS
  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher") return;
    try {
      if (!name || !url || !type) {
        throw new Error("All fields are required");
      }
      if (!url.startsWith("http")) {
        throw new Error("URL must start with http:// or https://");
      }

      const resourceData = {
        courseId,
        name,
        url,
        type,
        uploadDate: new Date().toISOString(),
        uploadedBy: user?.uid
      };

      // Add to the course's resources subcollection
      const resourceRef = await addDoc(
        collection(db, "courses", courseId, "resources"), 
        resourceData
      );

      // Update local state
      setAllCourses(allCourses.map(c => 
        c.id === courseId ? { 
          ...c, 
          resources: [...(c.resources || []), { ...resourceData, id: resourceRef.id }] 
        } : c
      ));

      alert("Resource added successfully");
    } catch (err: any) {
      console.error("Error adding resource:", err);
      alert("Failed to add resource: " + (err.message || "Unknown error"));
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
        {/* Sidebar - Simplified */}
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
                  {studentData.balance > 0 && (
                    <CheckoutPage 
                      studentId={user?.uid || ""} 
                      onPaymentSuccess={handlePaymentSuccess} 
                    />
                  )}
                </div>

                {/* Courses and Grades */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Your Courses</h2>
                  {studentData.courses?.length ? (
                    studentData.courses.map((course) => (
                      <div key={course.id} className="mb-6 border-b pb-4">
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
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Notifications</h2>
                  {studentData.notifications?.length ? (
                    <NotificationList
                      notifications={studentData.notifications}
                      onMarkAsRead={(id) => markNotificationAsRead(user?.uid || "", id)}
                    />
                  ) : (
                    <p className="text-gray-600">No notifications</p>
                  )}
                </div>
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
                  
                  {allStudents.length ? (
                    allStudents.map((student) => (
                      <div key={student.id} className="mb-6 border-b pb-4">
                        <h3 className="text-lg font-medium text-red-800">
                          {student.name} ({student.email})
                        </h3>
                        
                        {allCourses.map((course) => (
                          <div key={course.id} className="mt-4 pl-4">
                            <h4 className="font-medium">{course.name}</h4>
                            
                            {/* Add Resource Form */}
                            <div className="mt-2">
                              <ResourceForm 
                                courseId={course.id} 
                                onAddResource={handleAddResource} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
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