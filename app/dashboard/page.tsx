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

// Main Dashboard Component
type Role = "student" | "teacher" | "admin" | "accountsadmin";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  courses?: Course[];
  balance?: number;
  totalPaid?: number;
  totalOwed?: number;
  paymentStatus?: string;
  transactions?: Transaction[];
  notifications?: Notification[];
  clearance?: boolean;
}

interface Course {
  id: string;
  name: string;
  subjects?: Subject[];
}

interface Subject {
  name: string;
  grades?: {
    C1?: string;
    C2?: string;
    exam?: string;
    final?: string;
  };
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
  type: string;
}

interface Resource {
  id: string;
  name: string;
  url: string;
  type: string;
  uploadDate: string;
  courseId: string;
}

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allResources, setAllResources] = useState<Record<string, Resource[]>>({});
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

        // Fetch all courses
        const coursesSnapshot = await getDocs(collection(db, "courses"));
        const coursesList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        setAllCourses(coursesList);

        // Fetch student data for students
        if (userRole === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          if (studentSnap.exists()) {
            const fetchedStudentData = studentSnap.data() as StudentData;
            
            // Fetch resources for each course the student is enrolled in
            const resources: Record<string, Resource[]> = {};
            if (fetchedStudentData.courses) {
              for (const course of fetchedStudentData.courses) {
                const resourcesSnapshot = await getDocs(
                  collection(db, "courses", course.id, "resources")
                );
                resources[course.id] = resourcesSnapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                })) as Resource[];
              }
            }
            
            setStudentData({
              ...fetchedStudentData,
              id: currentUser.uid,
              transactions: fetchedStudentData.transactions || [],
              notifications: fetchedStudentData.notifications || [],
              courses: fetchedStudentData.courses || [],
            });
            setAllResources(resources);
          }
        }

        // Fetch all students for admin/teacher
        if (["teacher", "admin"].includes(userRole)) {
          const studentsSnapshot = await getDocs(collection(db, "students"));
          const studentsList = studentsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as StudentData[];
          setAllStudents(studentsList);
        }

        // Admin-specific data fetching
        if (userRole === "admin") {
          // Fetch all resources for admin view
          const resources: Record<string, Resource[]> = {};
          for (const course of coursesList) {
            const resourcesSnapshot = await getDocs(
              collection(db, "courses", course.id, "resources")
            );
            resources[course.id] = resourcesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Resource[];
          }
          setAllResources(resources);
        }
      } catch (err: any) {
        console.error("Error loading dashboard:", err);
        setError("Failed to load dashboard: " + (err.message || "Unknown error"));
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
      setAllResources(prev => ({
        ...prev,
        [courseId]: [...(prev[courseId] || []), { ...resourceData, id: resourceRef.id }]
      }));

      // Notify students enrolled in this course
      const enrolledStudents = allStudents.filter(student => 
        student.courses?.some(c => c.id === courseId)
      );
      
      for (const student of enrolledStudents) {
        const notification: Notification = {
          id: new Date().getTime().toString(),
          message: `New resource available for ${allCourses.find(c => c.id === courseId)?.name || "a course"}: ${name}`,
          date: new Date().toISOString(),
          read: false,
          type: "resource"
        };
        
        await updateDoc(doc(db, "students", student.id), {
          notifications: [...(student.notifications || []), notification]
        });
      }

      alert("Resource added successfully");
    } catch (err: any) {
      console.error("Error adding resource:", err);
      alert("Failed to add resource: " + (err.message || "Unknown error"));
    }
  };

  const handleGenerateGradeReport = () => {
    if (!studentData || !studentData.courses) return;
    
    try {
      const doc = new jsPDF();
      doc.text("Grade Report", 20, 20);
      doc.text(`Student: ${studentData.name || username}`, 20, 30);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 40);

      let yPosition = 60;
      
      studentData.courses.forEach((course) => {
        doc.text(`Course: ${course.name}`, 20, yPosition);
        yPosition += 10;
        
        if (course.subjects && course.subjects.length) {
          const gradeData = course.subjects.map(subject => [
            subject.name,
            subject.grades?.C1 || "N/A",
            subject.grades?.C2 || "N/A",
            subject.grades?.exam || "N/A",
            subject.grades?.final || "N/A"
          ]);
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Subject', 'Classwork 1', 'Classwork 2', 'Exam', 'Final Grade']],
            body: gradeData,
          });
          
          yPosition = (doc as any).lastAutoTable.finalY + 15;
        } else {
          doc.text("No grades available", 25, yPosition);
          yPosition += 15;
        }
      });

      doc.save(`${studentData.name || username}_grade_report.pdf`);
    } catch (err: any) {
      console.error("Error generating grade report:", err);
      alert("Failed to generate grade report: " + err.message);
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
                .map(k => parseFloat(updatedGrades[k as keyof typeof updatedGrades] || "0"))
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
      alert("Failed to update grade: " + err.message);
    }
  };

  // ADMIN FUNCTIONS
  const handleClearanceToggle = async (studentId: string, hasClearance: boolean) => {
    if (role !== "admin") return;
    try {
      await updateDoc(doc(db, "students", studentId), {
        hasClearance: !hasClearance
      });
      setAllStudents(allStudents.map(student => 
        student.id === studentId ? { ...student, hasClearance: !hasClearance } : student
      ));
      alert(`Clearance ${!hasClearance ? "granted" : "revoked"} successfully`);
    } catch (err: any) {
      console.error("Error updating clearance:", err);
      alert("Failed to update clearance: " + err.message);
    }
  };

  const handleDeleteAccount = async (userId: string) => {
    if (role !== "admin") return;
    if (!confirm("Are you sure you want to delete this account? This action cannot be undone.")) return;
    
    try {
      // Delete user document
      await deleteDoc(doc(db, "users", userId));
      
      // Delete student document if exists
      await deleteDoc(doc(db, "students", userId));
      
      setAllStudents(allStudents.filter(student => student.id !== userId));
      alert("Account deleted successfully");
    } catch (err: any) {
      console.error("Error deleting account:", err);
      alert("Failed to delete account: " + err.message);
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

  const markNotificationAsRead = async (studentId: string, notificationId: string) => {
    try {
      const studentRef = doc(db, "students", studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) return;

      const studentData = studentSnap.data() as StudentData;
      const updatedNotifications = studentData.notifications?.map(notification => 
        notification.id === notificationId ? { ...notification, read: true } : notification
      );

      await updateDoc(studentRef, { notifications: updatedNotifications });
      
      if (studentData.id === studentId) {
        setStudentData({
          ...studentData,
          notifications: updatedNotifications || []
        });
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
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
                  {(studentData.balance ?? 0) > 0 && (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Make Payment</h3>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          placeholder="Enter amount"
                          className="p-2 border rounded text-red-800 w-40"
                        />
                        <button
                          onClick={() => handlePaymentSuccess(parseFloat((studentData.balance || 0).toFixed(2)))}
                          className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Courses and Grades */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-red-800">Your Courses</h2>
                    <button
                      onClick={handleGenerateGradeReport}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Download Grade Report
                    </button>
                  </div>
                  {studentData.courses?.length ? (
                    studentData.courses.map((course) => (
                      <div key={course.id} className="mb-6 border-b pb-4">
                        <h3 className="text-lg font-medium text-red-800">{course.name}</h3>
                        
                        {/* Resources */}
                        <div className="mt-2">
                          <h4 className="font-medium text-red-800">Resources</h4>
                          {allResources[course.id]?.length ? (
                            <ul className="list-disc pl-5 mt-2">
                              {allResources[course.id].map((resource) => (
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
                    <div className="mt-4">
                      {studentData.notifications.map((notification) => (
                        <div key={notification.id} className="p-2 bg-white rounded shadow mb-2">
                          <p className="text-red-800">{notification.message}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(notification.date).toLocaleString()}
                          </p>
                          {!notification.read && (
                            <button
                              onClick={() => markNotificationAsRead(studentData.id, notification.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              Mark as Read
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
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
                    placeholder="Search students by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded text-red-800 w-full mb-4"
                  />
                  
                  {/* Filter students based on search term */}
                  {allStudents.filter(student => 
                    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    student.email?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length > 0 ? (
                    allStudents
                      .filter(student => 
                        student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        student.email?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((student) => (
                        <div key={student.id} className="mb-6 border-b pb-4">
                          <h3 className="text-lg font-medium text-red-800">
                            {student.name} ({student.email})
                          </h3>
                          
                          {allCourses.map((course) => (
                            <div key={course.id} className="mt-4 pl-4">
                              <h4 className="font-medium">{course.name}</h4>
                              
                              {/* Add Resource Form */}
                              <div className="mt-2">
                                <h5 className="text-sm font-medium text-red-800 mb-1">Add Resource</h5>
                                <input
                                  type="text"
                                  placeholder="Resource Name"
                                  className="p-2 border rounded text-red-800 w-full mb-2"
                                />
                                <input
                                  type="url"
                                  placeholder="Resource URL"
                                  className="p-2 border rounded text-red-800 w-full mb-2"
                                />
                                <select className="p-2 border rounded text-red-800 w-full mb-2">
                                  <option value="Video">Video</option>
                                  <option value="Document">Document</option>
                                  <option value="Link">Link</option>
                                </select>
                                <button
                                  onClick={() => handleAddResource(
                                    course.id,
                                    "Sample Resource",
                                    "https://example.com",
                                    "Document"
                                  )}
                                  className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700 w-full"
                                >
                                  Add Resource
                                </button>
                              </div>

                              {/* Grade Input Section */}
                              {student.courses?.find(c => c.id === course.id)?.subjects?.map((subject) => (
                                <div key={subject.name} className="mt-4 border-l-2 border-red-200 pl-4">
                                  <h5 className="font-medium">{subject.name}</h5>
                                  <div className="mt-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="w-24">Classwork 1:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={subject.grades?.C1 || ""}
                                        onChange={(e) => handleGradeUpdate(
                                          student.id,
                                          course.id,
                                          subject.name,
                                          "C1",
                                          e.target.value
                                        )}
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
                                        onChange={(e) => handleGradeUpdate(
                                          student.id,
                                          course.id,
                                          subject.name,
                                          "C2",
                                          e.target.value
                                        )}
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
                                        onChange={(e) => handleGradeUpdate(
                                          student.id,
                                          course.id,
                                          subject.name,
                                          "exam",
                                          e.target.value
                                        )}
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
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))
                  ) : (
                    <p className="text-gray-600">No matching students found</p>
                  )}
                </div>
              </div>
            )}

            {/* ADMIN DASHBOARD */}
            {role === "admin" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">System Overview</h2>
                  
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-red-100 p-4 rounded">
                      <h3 className="font-medium text-red-800">Total Students</h3>
                      <p className="text-2xl font-bold">{allStudents.length}</p>
                    </div>
                    <div className="bg-red-100 p-4 rounded">
                      <h3 className="font-medium text-red-800">Total Courses</h3>
                      <p className="text-2xl font-bold">{allCourses.length}</p>
                    </div>
                    <div className="bg-red-100 p-4 rounded">
                      <h3 className="font-medium text-red-800">Total Resources</h3>
                      <p className="text-2xl font-bold">
                        {Object.values(allResources).reduce((sum, resources) => sum + resources.length, 0)}
                      </p>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-red-800 mb-2">Student Management</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead>
                        <tr className="bg-red-800 text-white">
                          <th className="py-2 px-4">Name</th>
                          <th className="py-2 px-4">Email</th>
                          <th className="py-2 px-4">Clearance</th>
                          <th className="py-2 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allStudents.map((student) => (
                          <tr key={student.id} className="border-b">
                            <td className="py-2 px-4">{student.name}</td>
                            <td className="py-2 px-4">{student.email}</td>
                            <td className="py-2 px-4">
                              {student.clearance ? (
                                <span className="text-green-600">Granted</span>
                              ) : (
                                <span className="text-red-600">Not Granted</span>
                              )}
                            </td>
                            <td className="py-2 px-4 space-x-2">
                              <button
                                onClick={() => handleClearanceToggle(student.id, student.clearance || false)}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                {student.clearance ? "Revoke" : "Grant"} Clearance
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(student.id)}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete Account
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h3 className="text-lg font-semibold text-red-800 mt-6 mb-2">Recent Resources</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead>
                        <tr className="bg-red-800 text-white">
                          <th className="py-2 px-4">Course</th>
                          <th className="py-2 px-4">Resource Name</th>
                          <th className="py-2 px-4">Type</th>
                          <th className="py-2 px-4">Date Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(allResources).flatMap(([courseId, resources]) =>
                          resources.map(resource => {
                            const course = allCourses.find(c => c.id === courseId);
                            return (
                              <tr key={resource.id} className="border-b">
                                <td className="py-2 px-4">{course?.name || "Unknown Course"}</td>
                                <td className="py-2 px-4">
                                  <a 
                                    href={resource.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {resource.name}
                                  </a>
                                </td>
                                <td className="py-2 px-4">{resource.type}</td>
                                <td className="py-2 px-4">
                                  {new Date(resource.uploadDate).toLocaleDateString()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ACCOUNTS ADMIN DASHBOARD */}
            {role === "accountsadmin" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Financial Overview</h2>
                  
                  <input
                    type="text"
                    placeholder="Search students by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded text-red-800 w-full mb-4"
                  />
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead>
                        <tr className="bg-red-800 text-white">
                          <th className="py-2 px-4">Student ID</th>
                          <th className="py-2 px-4">Name</th>
                          <th className="py-2 px-4">Balance</th>
                          <th className="py-2 px-4">Last Payment</th>
                          <th className="py-2 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allStudents
                          .filter(student => 
                            student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            student.id?.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .map((student) => (
                            <tr key={student.id} className="border-b">
                              <td className="py-2 px-4">{student.id}</td>
                              <td className="py-2 px-4">{student.name}</td>
                              <td className="py-2 px-4">
                                ${(student.balance || 0).toFixed(2)}
                              </td>
                              <td className="py-2 px-4">
                                {student.transactions?.length
                                  ? new Date(student.transactions[student.transactions.length - 1].date).toLocaleDateString()
                                  : "None"}
                              </td>
                              <td className="py-2 px-4">
                                {student.paymentStatus || "Unknown"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}