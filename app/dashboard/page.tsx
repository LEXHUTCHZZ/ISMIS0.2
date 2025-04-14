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

// Enhanced Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
    // You could also log this to an error tracking service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-center">
          <h3 className="text-red-800 font-medium">Something went wrong</h3>
          <p className="mt-2 text-sm text-red-600">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Type definitions with enhanced validation
type Role = "student" | "teacher" | "admin" | "accountsadmin";
type PaymentStatus = "Paid" | "Partial" | "Unpaid" | "Unknown";

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
  paymentStatus?: PaymentStatus;
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

// Helper function to validate student data
function isValidStudentData(data: any): data is StudentData {
  return data && 
    typeof data.id === "string" && 
    typeof data.name === "string" && 
    typeof data.email === "string";
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
        // Fetch user data with validation
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

        // Fetch all courses with validation
        const coursesSnapshot = await getDocs(collection(db, "courses"));
        const coursesList = coursesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "Unnamed Course",
            lecturerId: data.lecturerId,
            subjects: Array.isArray(data.subjects) ? data.subjects : [],
            description: data.description || ""
          } as Course;
        });
        
        setAllCourses(coursesList);

        // Fetch student data for students with enhanced validation
        if (userRole === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          
          if (studentSnap.exists()) {
            const fetchedStudentData = studentSnap.data() as StudentData;
            
            if (!isValidStudentData(fetchedStudentData)) {
              throw new Error("Invalid student data structure");
            }
            
            // Initialize missing arrays
            const validatedStudentData: StudentData = {
              ...fetchedStudentData,
              id: currentUser.uid,
              transactions: Array.isArray(fetchedStudentData.transactions) ? fetchedStudentData.transactions : [],
              notifications: Array.isArray(fetchedStudentData.notifications) ? fetchedStudentData.notifications : [],
              courses: Array.isArray(fetchedStudentData.courses) ? fetchedStudentData.courses : [],
              balance: typeof fetchedStudentData.balance === 'number' ? fetchedStudentData.balance : 0,
              totalPaid: typeof fetchedStudentData.totalPaid === 'number' ? fetchedStudentData.totalPaid : 0,
              totalOwed: typeof fetchedStudentData.totalOwed === 'number' ? fetchedStudentData.totalOwed : 0,
              paymentStatus: ["Paid", "Partial", "Unpaid"].includes(fetchedStudentData.paymentStatus || "") 
                ? fetchedStudentData.paymentStatus as PaymentStatus 
                : "Unknown"
            };
            
            // Fetch resources for each course the student is enrolled in
            const resources: Record<string, Resource[]> = {};
            if (validatedStudentData.courses) {
              for (const course of validatedStudentData.courses) {
                try {
                  const resourcesSnapshot = await getDocs(
                    collection(db, "courses", course.id, "resources")
                  );
                  resources[course.id] = resourcesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || "Unnamed Resource",
                    url: doc.data().url || "",
                    type: doc.data().type || "Unknown",
                    uploadDate: doc.data().uploadDate || new Date().toISOString(),
                    courseId: course.id,
                    uploadedBy: doc.data().uploadedBy
                  })) as Resource[];
                } catch (err) {
                  console.error(`Error loading resources for course ${course.id}:`, err);
                  resources[course.id] = [];
                }
              }
            }
            
            setStudentData(validatedStudentData);
            setAllResources(resources);
          } else {
            console.warn("No student record found for user:", currentUser.uid);
            setStudentData({
              id: currentUser.uid,
              name: fetchedUserData.name || "",
              email: fetchedUserData.email || "",
              courses: [],
              transactions: [],
              notifications: [],
              balance: 0,
              totalPaid: 0,
              totalOwed: 0,
              paymentStatus: "Unknown"
            });
          }
        }

        // Fetch all students for admin/teacher with validation
        if (["teacher", "admin"].includes(userRole)) {
          const studentsSnapshot = await getDocs(collection(db, "students"));
          const studentsList = studentsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || "Unnamed Student",
              email: data.email || "",
              courses: Array.isArray(data.courses) ? data.courses : [],
              balance: typeof data.balance === 'number' ? data.balance : 0,
              totalPaid: typeof data.totalPaid === 'number' ? data.totalPaid : 0,
              totalOwed: typeof data.totalOwed === 'number' ? data.totalOwed : 0,
              paymentStatus: ["Paid", "Partial", "Unpaid"].includes(data.paymentStatus || "") 
                ? data.paymentStatus as PaymentStatus 
                : "Unknown",
              transactions: Array.isArray(data.transactions) ? data.transactions : [],
              notifications: Array.isArray(data.notifications) ? data.notifications : [],
              clearance: !!data.clearance
            } as StudentData;
          });
          
          setAllStudents(studentsList);

          // For teachers, fetch their assigned courses and set default selection
          if (userRole === "teacher") {
            const teacherCourses = coursesList.filter(course => 
              course.lecturerId === currentUser.uid && course.id
            );
            
            if (teacherCourses.length > 0) {
              setSelectedCourse(teacherCourses[0].id);
            } else {
              console.warn("No courses assigned to teacher:", currentUser.uid);
              setSelectedCourse("");
            }
          }
        }

        // Admin-specific data fetching with validation
        if (userRole === "admin") {
          const resources: Record<string, Resource[]> = {};
          for (const course of coursesList) {
            try {
              const resourcesSnapshot = await getDocs(
                collection(db, "courses", course.id, "resources")
              );
              resources[course.id] = resourcesSnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || "Unnamed Resource",
                url: doc.data().url || "",
                type: doc.data().type || "Unknown",
                uploadDate: doc.data().uploadDate || new Date().toISOString(),
                courseId: course.id,
                uploadedBy: doc.data().uploadedBy
              })) as Resource[];
            } catch (err) {
              console.error(`Error loading resources for course ${course.id}:`, err);
              resources[course.id] = [];
            }
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

  // Enhanced loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-800"></div>
        <span className="ml-3 text-red-800">Loading your dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-center max-w-md mx-auto mt-10">
        <h3 className="text-red-800 font-medium">Error Loading Dashboard</h3>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!userData || !role) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-center max-w-md mx-auto mt-10">
        <h3 className="text-yellow-800 font-medium">User Data Not Found</h3>
        <p className="mt-2 text-sm text-yellow-600">
          We couldn't retrieve your user information. Please try logging in again.
        </p>
        <button 
          onClick={() => router.push("/auth/login")}
          className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // TEACHER FUNCTIONS with enhanced validation
  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher") {
      console.error("Unauthorized resource addition attempt by non-teacher");
      return;
    }
    
    try {
      if (!name || !url || !type) {
        throw new Error("All fields are required");
      }
      
      if (!url.startsWith("http")) {
        throw new Error("URL must start with http:// or https://");
      }
      
      if (!courseId || !allCourses.some(c => c.id === courseId)) {
        throw new Error("Invalid course selected");
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
        student.id && student.courses?.some(c => c.id === courseId)
      );
      
      for (const student of enrolledStudents) {
        try {
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
        } catch (err) {
          console.error(`Failed to notify student ${student.id}:`, err);
        }
      }

      alert("Resource added successfully");
    } catch (err: any) {
      console.error("Error adding resource:", err);
      alert("Failed to add resource: " + (err.message || "Unknown error"));
    }
  };

  const handleGenerateGradeReport = () => {
    if (!studentData || !studentData.courses) {
      alert("No student data or courses available to generate report");
      return;
    }
    
    try {
      const doc = new jsPDF();
      doc.text("Grade Report", 20, 20);
      doc.text(`Student: ${studentData.name || username}`, 20, 30);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 40);

      let yPosition = 60;
      
      studentData.courses.forEach((course) => {
        if (!course.name) return;
        
        doc.text(`Course: ${course.name}`, 20, yPosition);
        yPosition += 10;
        
        if (course.subjects && course.subjects.length) {
          const gradeData = course.subjects.map(subject => [
            subject.name || "Unnamed Subject",
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
    if (!selectedStudent || !selectedStudent.id || !selectedCourse || !selectedSubject) {
      alert("Please select a student, course, and subject before submitting grades");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "students", selectedStudent.id);
      const studentSnap = await getDoc(studentRef);
      
      if (studentSnap.exists()) {
        const studentData = studentSnap.data() as StudentData;
        
        // Validate and update courses data
        const updatedCourses = (studentData.courses || []).map(course => {
          if (course.id === selectedCourse) {
            const updatedSubjects = (course.subjects || []).map(subject => {
              if (subject.name === selectedSubject) {
                const finalGrade = calculateFinalGrade(gradeData);
                return {
                  ...subject,
                  grades: {
                    ...subject.grades,
                    ...gradeData,
                    final: finalGrade === "Error" ? "N/A" : finalGrade
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
            ? { ...student, courses: updatedCourses } 
            : student
        ));
        
        alert("Grades updated successfully!");
      } else {
        throw new Error("Student record not found");
      }
    } catch (error: any) {
      console.error("Error updating grades:", error);
      alert("Failed to update grades: " + (error.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateFinalGrade = (grades: GradeForm): string => {
    try {
      const courseworkKeys = Object.keys(grades)
        .filter(k => k.startsWith("C") && grades[k as keyof GradeForm] && !isNaN(parseFloat(grades[k as keyof GradeForm])));
      
      if (courseworkKeys.length === 0) return "N/A";
      
      const courseworkAvg = courseworkKeys
        .map(k => {
          const val = parseFloat(grades[k as keyof GradeForm] || "0");
          return Math.max(0, Math.min(100, val)); // Clamp between 0-100
        })
        .reduce((sum, val) => sum + val, 0) / courseworkKeys.length;
      
      const exam = Math.max(0, Math.min(100, parseFloat(grades.exam || "0")));
      const project = Math.max(0, Math.min(100, parseFloat(grades.project || "0")));
      const participation = Math.max(0, Math.min(100, parseFloat(grades.participation || "0")));
      const attendance = Math.max(0, Math.min(100, parseFloat(grades.attendance || "0")));
      
      // Weighted calculation (customize weights as needed)
      return (
        (courseworkAvg * 0.3) + 
        (exam * 0.4) + 
        (project * 0.15) + 
        (participation * 0.1) + 
        (attendance * 0.05)
      ).toFixed(2);
    } catch (err) {
      console.error("Grade calculation error:", err);
      return "Error";
    }
  };

  const loadStudentGrades = async (studentId: string) => {
    if (!studentId) {
      setSelectedStudent(null);
      return;
    }
    
    try {
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
      } else {
        setSelectedStudent(null);
        console.error("Student document not found:", studentId);
      }
    } catch (err) {
      console.error("Error loading student grades:", err);
      setSelectedStudent(null);
    }
  };

  // ADMIN FUNCTIONS with enhanced validation
  const handleClearanceToggle = async (studentId: string, hasClearance: boolean) => {
    if (role !== "admin") {
      console.error("Unauthorized clearance toggle attempt by non-admin");
      return;
    }
    
    if (!studentId) {
      alert("Invalid student selection");
      return;
    }
    
    try {
      await updateDoc(doc(db, "students", studentId), {
        clearance: !hasClearance
      });
      
      setAllStudents(allStudents.map(student => 
        student.id === studentId ? { ...student, clearance: !hasClearance } : student
      ));
      
      alert(`Clearance ${!hasClearance ? "granted" : "revoked"} successfully`);
    } catch (err: any) {
      console.error("Error updating clearance:", err);
      alert("Failed to update clearance: " + err.message);
    }
  };

  const handleDeleteAccount = async (userId: string) => {
    if (role !== "admin") {
      console.error("Unauthorized delete attempt by non-admin");
      return;
    }
    
    if (!userId) {
      alert("Invalid user selection");
      return;
    }
    
    if (!confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
      return;
    }
    
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

  // STUDENT FUNCTIONS with enhanced validation
  const handlePaymentSuccess = async (amount: number) => {
    if (!studentData || !user?.uid) {
      alert("Payment failed: Invalid student data");
      return;
    }
    
    if (isNaN(amount)) {
      alert("Please enter a valid payment amount");
      return;
    }
    
    try {
      const paymentAmount = parseFloat(amount.toFixed(2));
      const updatedBalance = (studentData.balance || 0) - paymentAmount;
      const updatedTotalPaid = (studentData.totalPaid || 0) + paymentAmount;
      const paymentStatus = updatedBalance <= 0 ? "Paid" : "Partial";
      
      const newTransaction: Transaction = {
        id: new Date().toISOString(),
        amount: paymentAmount,
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
      
      alert(`Payment of $${paymentAmount.toFixed(2)} processed successfully!`);
    } catch (err: any) {
      console.error("Payment processing error:", err);
      alert("Failed to process payment: " + err.message);
    }
  };

  const markNotificationAsRead = async (studentId: string, notificationId: string) => {
    if (!studentId || !notificationId) return;
    
    try {
      const studentRef = doc(db, "students", studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) return;

      const studentData = studentSnap.data() as StudentData;
      const updatedNotifications = (studentData.notifications || []).map(notification => 
        notification.id === notificationId ? { ...notification, read: true } : notification
      );

      await updateDoc(studentRef, { notifications: updatedNotifications });
      
      if (studentData.id === studentId) {
        setStudentData({
          ...studentData,
          notifications: updatedNotifications
        });
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

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
            {role === "student" && (
              <li>
                <Link href="/courses" className="text-red-800 hover:underline">
                  Browse Courses
                </Link>
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
                      <p className={`text-lg font-bold ${
                        (studentData.balance || 0) > 0 ? "text-red-600" : "text-green-600"
                      }`}>
                        ${(studentData.balance || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {(studentData.balance ?? 0) > 0 ? (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Make Payment</h3>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          placeholder="Enter amount"
                          min="0.01"
                          max={(studentData.balance || 0).toFixed(2)}
                          step="0.01"
                          className="p-2 border rounded text-red-800 w-40"
                        />
                        <button
                          onClick={() => {
                            const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
                            const amount = parseFloat(amountInput.value);
                            if (!isNaN(amount)) {
                              handlePaymentSuccess(amount);
                            } else {
                              alert("Please enter a valid amount");
                            }
                          }}
                          className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-50 rounded text-green-800">
                      <p>Your account is fully paid. Thank you!</p>
                    </div>
                  )}
                </div>

                {/* Courses and Grades */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-red-800">Your Courses</h2>
                    {studentData.courses?.length ? (
                      <button
                        onClick={handleGenerateGradeReport}
                        className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                      >
                        Download Grade Report
                      </button>
                    ) : null}
                  </div>
                  {studentData.courses?.length ? (
                    studentData.courses.map((course) => (
                      <div key={course.id} className="mb-6 border-b pb-4">
                        <h3 className="text-lg font-medium text-red-800">{course.name || "Unnamed Course"}</h3>
                        
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
                                  {resource.uploadDate && (
                                    <span className="text-xs text-gray-500 ml-2">
                                      {new Date(resource.uploadDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-3 bg-gray-50 rounded text-gray-600">
                              No resources available for this course
                            </div>
                          )}
                        </div>
                        
                        {/* Grades */}
                        <div className="mt-4">
                          <h4 className="font-medium text-red-800">Grades</h4>
                          {course.subjects?.length ? (
                            <div className="mt-2 space-y-4">
                              {course.subjects.map((subject) => (
                                <div key={subject.name} className="border-b pb-2">
                                  <h5 className="font-medium">{subject.name || "Unnamed Subject"}</h5>
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
                                  {subject.grades?.comments && (
                                    <div className="mt-2">
                                      <p className="text-gray-600">Comments:</p>
                                      <p className="text-sm italic">{subject.grades.comments}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-3 bg-gray-50 rounded text-gray-600">
                              No grades available for this course
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-gray-50 rounded text-center">
                      <p className="text-gray-600">You are not enrolled in any courses yet.</p>
                      <Link href="/courses" className="text-red-800 hover:underline mt-2 inline-block">
                        Browse available courses
                      </Link>
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-red-800">Notifications</h2>
                    {studentData.notifications?.length ? (
                      <button
                        onClick={async () => {
                          if (!studentData.id) return;
                          try {
                            await updateDoc(doc(db, "students", studentData.id), {
                              notifications: (studentData.notifications || []).map(n => ({ ...n, read: true }))
                            });
                            setStudentData({
                              ...studentData,
                              notifications: (studentData.notifications || []).map(n => ({ ...n, read: true }))
                            });
                          } catch (err) {
                            console.error("Error marking all as read:", err);
                          }
                        }}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Mark All as Read
                      </button>
                    ) : null}
                  </div>
                  {studentData.notifications?.length ? (
                    <div className="mt-4 space-y-2">
                      {studentData.notifications
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-3 rounded ${notification.read ? "bg-white" : "bg-blue-50"}`}
                          >
                            <p className={`${notification.read ? "text-gray-800" : "text-blue-800 font-medium"}`}>
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(notification.date).toLocaleString()}
                            </p>
                            {!notification.read && (
                              <button
                                onClick={() => markNotificationAsRead(studentData.id, notification.id)}
                                className="text-xs text-blue-600 hover:underline mt-1"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded text-center text-gray-600">
                      No notifications
                    </div>
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
                    
                    {/* Show message if no courses assigned */}
                    {allCourses.filter(course => course.lecturerId === user?.uid).length === 0 && (
                      <div className="p-4 bg-gray-50 rounded text-center">
                        <p className="text-gray-600">You haven't been assigned to any courses yet.</p>
                        <p className="text-sm mt-2">Please contact administration.</p>
                      </div>
                    )}
                    
                    {/* Student Selection */}
                    {selectedCourse && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Student</label>
                        <select
                          value={selectedStudent?.id || ""}
                          onChange={async (e) => {
                            const studentId = e.target.value;
                            if (!studentId) {
                              setSelectedStudent(null);
                              return;
                            }
                            await loadStudentGrades(studentId);
                          }}
                          className="w-full p-2 border rounded"
                        >
                          <option value="">Select a student</option>
                          {allStudents
                            .filter(student => 
                              student.id && 
                              student.name && 
                              student.courses?.some(c => c.id === selectedCourse)
                            )
                            .map(student => (
                              <option key={student.id} value={student.id}>
                                {student.name} ({student.email})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    
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
                    
                    {/* Show message if no students enrolled */}
                    {selectedCourse && allStudents.filter(student => 
                      student.courses?.some(c => c.id === selectedCourse)).length === 0 && (
                      <div className="p-4 bg-gray-50 rounded text-center">
                        <p className="text-gray-600">No students enrolled in this course yet.</p>
                      </div>
                    )}
                    
                    {/* Grade Input Form */}
                    {selectedStudent && selectedCourse && selectedSubject ? (
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
                    ) : (
                      selectedCourse && (
                        <div className="p-4 bg-gray-50 rounded text-center">
                          <p className="text-gray-600">
                            {!selectedStudent ? "Select a student" : !selectedSubject ? "Select a subject" : ""}
                          </p>
                        </div>
                      )
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
                                  
                                  {/* Show resources for this course */}
                                  {allResources[course.id]?.length ? (
                                    <div className="mt-2 mb-4">
                                      <h5 className="text-sm font-medium text-red-800 mb-1">Existing Resources</h5>
                                      <ul className="list-disc pl-5">
                                        {allResources[course.id].map(resource => (
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
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-600 mb-2">No resources added yet</p>
                                  )}
                                  
                                  {/* Add Resource Form */}
                                  <div className="mt-2">
                                    <h5 className="text-sm font-medium text-red-800 mb-1">Add New Resource</h5>
                                    <input
                                      type="text"
                                      placeholder="Resource Name"
                                      className="p-2 border rounded text-red-800 w-full mb-2"
                                      id={`resource-name-${course.id}-${student.id}`}
                                    />
                                    <input
                                      type="url"
                                      placeholder="Resource URL (https://...)"
                                      className="p-2 border rounded text-red-800 w-full mb-2"
                                      id={`resource-url-${course.id}-${student.id}`}
                                    />
                                    <select 
                                      className="p-2 border rounded text-red-800 w-full mb-2"
                                      id={`resource-type-${course.id}-${student.id}`}
                                    >
                                      <option value="">Select resource type</option>
                                      <option value="Video">Video</option>
                                      <option value="Document">Document</option>
                                      <option value="Link">Link</option>
                                      <option value="Assignment">Assignment</option>
                                    </select>
                                    <button
                                      onClick={() => {
                                        const nameInput = document.getElementById(`resource-name-${course.id}-${student.id}`) as HTMLInputElement;
                                        const urlInput = document.getElementById(`resource-url-${course.id}-${student.id}`) as HTMLInputElement;
                                        const typeSelect = document.getElementById(`resource-type-${course.id}-${student.id}`) as HTMLSelectElement;
                                        
                                        if (nameInput && urlInput && typeSelect) {
                                          handleAddResource(
                                            course.id,
                                            nameInput.value,
                                            urlInput.value,
                                            typeSelect.value
                                          );
                                          nameInput.value = "";
                                          urlInput.value = "";
                                          typeSelect.value = "";
                                        }
                                      }}
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
                      <div className="p-4 bg-gray-50 rounded text-center">
                        <p className="text-gray-600">No matching students found</p>
                      </div>
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
                  {allStudents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white">
                        <thead>
                          <tr className="bg-red-800 text-white">
                            <th className="py-2 px-4">Name</th>
                            <th className="py-2 px-4">Email</th>
                            <th className="py-2 px-4">Courses</th>
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
                                {student.courses?.length || 0}
                              </td>
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
                  ) : (
                    <div className="p-4 bg-gray-50 rounded text-center">
                      <p className="text-gray-600">No students in the system</p>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-red-800 mt-6 mb-2">Recent Resources</h3>
                  {Object.values(allResources).flat().length > 0 ? (
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
                          {Object.entries(allResources)
                            .flatMap(([courseId, resources]) =>
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
                            )
                            .sort((a, b) => 
                              new Date(b.props.children[3].props.children).getTime() - 
                              new Date(a.props.children[3].props.children).getTime()
                            )
                            .slice(0, 10) // Show only 10 most recent
                          }
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded text-center">
                      <p className="text-gray-600">No resources uploaded yet</p>
                    </div>
                  )}
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
                  
                  {allStudents.length > 0 ? (
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
                                <td className={`py-2 px-4 ${
                                  (student.balance || 0) > 0 ? "text-red-600 font-medium" : "text-green-600"
                                }`}>
                                  ${(student.balance || 0).toFixed(2)}
                                </td>
                                <td className="py-2 px-4">
                                  {student.transactions?.length
                                    ? new Date(student.transactions[student.transactions.length - 1].date).toLocaleDateString()
                                    : "None"}
                                </td>
                                <td className="py-2 px-4">
                                  {student.paymentStatus === "Paid" ? (
                                    <span className="text-green-600">Paid</span>
                                  ) : student.paymentStatus === "Partial" ? (
                                    <span className="text-yellow-600">Partial</span>
                                  ) : (
                                    <span className="text-red-600">Unpaid</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded text-center">
                      <p className="text-gray-600">No student records found</p>
                    </div>
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