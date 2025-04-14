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
  lecturerId?: string;
  subjects?: Subject[];
  description?: string;
}

interface Subject {
  name: string;
  grades?: {
    C1?: string;
    C2?: string;
    C3?: string;
    C4?: string;
    exam?: string;
    project?: string;
    participation?: string;
    attendance?: string;
    comments?: string;
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
  uploadedBy?: string;
}

interface GradeForm {
  C1: string;
  C2: string;
  C3: string;
  C4: string;
  exam: string;
  project: string;
  participation: string;
  attendance: string;
  comments: string;
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
  const [activeTab, setActiveTab] = useState("grades");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [gradeData, setGradeData] = useState<GradeForm>({
    C1: "",
    C2: "",
    C3: "",
    C4: "",
    exam: "",
    project: "",
    participation: "",
    attendance: "",
    comments: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
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

          // For teachers, fetch their assigned courses
          if (userRole === "teacher") {
            const teacherCourses = coursesList.filter(course => course.lecturerId === currentUser.uid);
            if (teacherCourses.length > 0) {
              setSelectedCourse(teacherCourses[0].id);
            }
          }
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
            subject.grades?.C3 || "N/A",
            subject.grades?.C4 || "N/A",
            subject.grades?.exam || "N/A",
            subject.grades?.project || "N/A",
            subject.grades?.final || "N/A"
          ]);
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Subject', 'C1', 'C2', 'C3', 'C4', 'Exam', 'Project', 'Final']],
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

  // Enhanced grade management functions
  const handleGradeChange = (field: string, value: string) => {
    setGradeData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const submitGrades = async () => {
    if (!selectedStudent || !selectedCourse || !selectedSubject) return;
    
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "students", selectedStudent.id);
      const studentSnap = await getDoc(studentRef);
      
      if (studentSnap.exists()) {
        const studentData = studentSnap.data() as StudentData;
        const updatedCourses = studentData.courses?.map(course => {
          if (course.id === selectedCourse) {
            const updatedSubjects = course.subjects?.map(subject => {
              if (subject.name === selectedSubject) {
                return {
                  ...subject,
                  grades: {
                    ...subject.grades,
                    ...gradeData,
                    final: calculateFinalGrade(gradeData)
                  }
                };
              }
              return subject;
            });
            return { ...course, subjects: updatedSubjects };
          }
          return course;
        });

        await updateDoc(studentRef, { courses: updatedCourses });
        
        // Update local state
        setAllStudents(allStudents.map(student => 
          student.id === selectedStudent.id 
            ? { ...student, courses: updatedCourses || [] } 
            : student
        ));
        
        alert("Grades updated successfully!");
      }
    } catch (error) {
      console.error("Error updating grades:", error);
      alert("Failed to update grades");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateFinalGrade = (grades: GradeForm): string => {
    const courseworkKeys = Object.keys(grades)
      .filter(k => k.startsWith("C") && grades[k as keyof GradeForm]);
    const courseworkAvg = courseworkKeys.length > 0 
      ? courseworkKeys
        .map(k => parseFloat(grades[k as keyof GradeForm] || "0"))
        .reduce((sum, val) => sum + val, 0) / courseworkKeys.length
      : 0;
    
    const exam = parseFloat(grades.exam || "0");
    const project = parseFloat(grades.project || "0");
    const participation = parseFloat(grades.participation || "0");
    const attendance = parseFloat(grades.attendance || "0");
    
    // Weighted calculation (customize weights as needed)
    return (
      (courseworkAvg * 0.3) + 
      (exam * 0.4) + 
      (project * 0.15) + 
      (participation * 0.1) + 
      (attendance * 0.05)
    ).toFixed(2);
  };

  const loadStudentGrades = async (studentId: string) => {
    const studentDoc = await getDoc(doc(db, "students", studentId));
    if (studentDoc.exists()) {
      const student = studentDoc.data() as StudentData;
      setSelectedStudent(student);
      
      // Load existing grades if available
      const course = student.courses?.find(c => c.id === selectedCourse);
      const subject = course?.subjects?.find(s => s.name === selectedSubject);
      if (subject?.grades) {
        setGradeData({
          C1: subject.grades.C1 || "",
          C2: subject.grades.C2 || "",
          C3: subject.grades.C3 || "",
          C4: subject.grades.C4 || "",
          exam: subject.grades.exam || "",
          project: subject.grades.project || "",
          participation: subject.grades.participation || "",
          attendance: subject.grades.attendance || "",
          comments: subject.grades.comments || ""
        });
      } else {
        setGradeData({
          C1: "", C2: "", C3: "", C4: "",
          exam: "", project: "", participation: "", 
          attendance: "", comments: ""
        });
      }
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
                <div className="flex space-x-4 mb-6">
                  <button
                    onClick={() => setActiveTab("grades")}
                    className={`px-4 py-2 rounded ${activeTab === "grades" ? "bg-red-800 text-white" : "bg-gray-200"}`}
                  >
                    Grade Management
                  </button>
                  <button
                    onClick={() => setActiveTab("resources")}
                    className={`px-4 py-2 rounded ${activeTab === "resources" ? "bg-red-800 text-white" : "bg-gray-200"}`}
                  >
                    Resource Management
                  </button>
                </div>

                {activeTab === "grades" ? (
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-red-800 mb-4">Grade Management</h2>
                    
                    {/* Course Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Select Course</label>
                      <select
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        className="w-full p-2 border rounded"
                      >
                        {allCourses
                          .filter(course => course.lecturerId === user?.uid)
                          .map(course => (
                            <option key={course.id} value={course.id}>{course.name}</option>
                          ))}
                      </select>
                    </div>
                    
                    {/* Student Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Select Student</label>
                      <select
                        value={selectedStudent?.id || ""}
                        onChange={async (e) => {
                          const studentId = e.target.value;
                          if (!studentId) return;
                          await loadStudentGrades(studentId);
                        }}
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select a student</option>
                        {allStudents
                          .filter(student => student.courses?.some(c => c.id === selectedCourse))
                          .map(student => (
                            <option key={student.id} value={student.id}>
                              {student.name} ({student.email})
                            </option>
                          ))}
                      </select>
                    </div>
                    
                    {/* Subject Selection */}
                    {selectedCourse && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Subject</label>
                        <select
                          value={selectedSubject}
                          onChange={(e) => {
                            setSelectedSubject(e.target.value);
                            if (selectedStudent) {
                              loadStudentGrades(selectedStudent.id);
                            }
                          }}
                          className="w-full p-2 border rounded"
                        >
                          <option value="">Select a subject</option>
                          {allCourses
                            .find(c => c.id === selectedCourse)
                            ?.subjects?.map(subject => (
                              <option key={subject.name} value={subject.name}>{subject.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                    
                    {/* Grade Input Form */}
                    {selectedStudent && selectedCourse && selectedSubject && (
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-medium text-red-800 mb-4">
                          Enter Grades for {selectedStudent.name} - {selectedSubject}
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Classwork Grades */}
                          <div className="space-y-4">
                            <h4 className="font-medium">Classwork</h4>
                            {[1, 2, 3, 4].map(num => (
                              <div key={`C${num}`} className="flex items-center">
                                <label className="w-16">C{num}:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={gradeData[`C${num}` as keyof GradeForm]}
                                  onChange={(e) => handleGradeChange(`C${num}`, e.target.value)}
                                  className="p-1 border rounded w-20"
                                  placeholder="0-100"
                                />
                              </div>
                            ))}
                          </div>
                          
                          {/* Other Assessments */}
                          <div className="space-y-4">
                            <div className="flex items-center">
                              <label className="w-32">Exam:</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={gradeData.exam}
                                onChange={(e) => handleGradeChange("exam", e.target.value)}
                                className="p-1 border rounded w-20"
                                placeholder="0-100"
                              />
                            </div>
                            
                            <div className="flex items-center">
                              <label className="w-32">Project:</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={gradeData.project}
                                onChange={(e) => handleGradeChange("project", e.target.value)}
                                className="p-1 border rounded w-20"
                                placeholder="0-100"
                              />
                            </div>
                            
                            <div className="flex items-center">
                              <label className="w-32">Participation:</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={gradeData.participation}
                                onChange={(e) => handleGradeChange("participation", e.target.value)}
                                className="p-1 border rounded w-20"
                                placeholder="0-100"
                              />
                            </div>
                            
                            <div className="flex items-center">
                              <label className="w-32">Attendance:</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={gradeData.attendance}
                                onChange={(e) => handleGradeChange("attendance", e.target.value)}
                                className="p-1 border rounded w-20"
                                placeholder="0-100"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Comments */}
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                          <textarea
                            value={gradeData.comments}
                            onChange={(e) => handleGradeChange("comments", e.target.value)}
                            className="w-full p-2 border rounded"
                            rows={3}
                            placeholder="Additional feedback..."
                          />
                        </div>
                        
                        {/* Final Grade Preview */}
                        <div className="mt-4 p-3 bg-gray-50 rounded">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Calculated Final Grade:</span>
                            <span className="text-xl font-bold">
                              {gradeData.exam || gradeData.C1 ? calculateFinalGrade(gradeData) : "N/A"}
                            </span>
                          </div>
                        </div>
                        
                        {/* Submit Button */}
                        <div className="mt-6">
                          <button
                            onClick={submitGrades}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {isSubmitting ? "Saving..." : "Save Grades"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-red-800 mb-4">Resource Management</h2>
                    
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
                            
                            {allCourses
                              .filter(course => course.lecturerId === user?.uid)
                              .map((course) => (
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
                                </div>
                              ))}
                          </div>
                        ))
                    ) : (
                      <p className="text-gray-600">No matching students found</p>
                    )}
                  </div>
                )}
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