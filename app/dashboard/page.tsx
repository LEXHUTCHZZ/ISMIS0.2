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
  addDoc,
  QueryDocumentSnapshot
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
  error?: Error;
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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center max-w-md mx-auto mt-10">
          <h3 className="text-red-800 font-semibold">Something went wrong</h3>
          <p className="mt-2 text-sm text-red-600">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Type Definitions
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

// Data Validation Helper
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
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [gradeData, setGradeData] = useState<GradeForm>({
    C1: "", C2: "", C3: "", C4: "", exam: "", project: "",
    participation: "", attendance: "", comments: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const router = useRouter();
  const { user } = useAuth();

  // Data Fetching with Retry Logic
  const fetchDataWithRetry = async (fetchFn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fetchFn();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

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
        const userSnap = await fetchDataWithRetry(() => getDoc(userDocRef));
        
        if (!userSnap.exists()) {
          throw new Error("User profile not found. Please contact support.");
        }

        const fetchedUserData = userSnap.data() as User;
        const userRole = fetchedUserData.role as Role;
        
        if (!["student", "teacher", "admin", "accountsadmin"].includes(userRole)) {
          throw new Error("Invalid user role detected.");
        }
        
        setRole(userRole);
        setUsername(fetchedUserData.name || "User");
        setUserData(fetchedUserData);
        
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening");

        // Fetch courses
        const coursesSnapshot = await fetchDataWithRetry(() => getDocs(collection(db, "courses")));
        const coursesList = coursesSnapshot.docs.map((docSnapshot: QueryDocumentSnapshot) => ({
          id: docSnapshot.id,
          name: docSnapshot.data().name || "Unnamed Course",
          lecturerId: docSnapshot.data().lecturerId,
          subjects: Array.isArray(docSnapshot.data().subjects) ? docSnapshot.data().subjects : [],
          description: docSnapshot.data().description || ""
        } as Course));
        
        setAllCourses(coursesList);

        // Student-specific data
        if (userRole === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await fetchDataWithRetry(() => getDoc(studentDocRef));
          
          if (studentSnap.exists()) {
            const fetchedStudentData = studentSnap.data() as StudentData;
            
            if (!isValidStudentData(fetchedStudentData)) {
              throw new Error("Invalid student data structure.");
            }
            
            const validatedStudentData: StudentData = {
              ...fetchedStudentData,
              id: currentUser.uid,
              transactions: Array.isArray(fetchedStudentData.transactions) ? fetchedStudentData.transactions : [],
              notifications: Array.isArray(fetchedStudentData.notifications) ? fetchedStudentData.notifications : [],
              courses: Array.isArray(fetchedStudentData.courses) ? fetchedStudentData.courses : [],
              balance: Number(fetchedStudentData.balance) || 0,
              totalPaid: Number(fetchedStudentData.totalPaid) || 0,
              totalOwed: Number(fetchedStudentData.totalOwed) || 0,
              paymentStatus: ["Paid", "Partial", "Unpaid"].includes(fetchedStudentData.paymentStatus || "") 
                ? fetchedStudentData.paymentStatus as PaymentStatus 
                : "Unknown"
            };
            
            // Fetch resources with error handling
            const resources: Record<string, Resource[]> = {};
            for (const course of validatedStudentData.courses || []) {
              try {
                const resourcesSnapshot = await fetchDataWithRetry(() => 
                  getDocs(collection(db, "courses", course.id, "resources"))
                );
                resources[course.id] = resourcesSnapshot.docs.map((docSnapshot: QueryDocumentSnapshot) => ({
                  id: docSnapshot.id,
                  name: docSnapshot.data().name || "Unnamed Resource",
                  url: docSnapshot.data().url || "",
                  type: docSnapshot.data().type || "Unknown",
                  uploadDate: docSnapshot.data().uploadDate || new Date().toISOString(),
                  courseId: course.id,
                  uploadedBy: docSnapshot.data().uploadedBy
                })) as Resource[];
              } catch (err) {
                console.warn(`Failed to load resources for course ${course.id}:`, err);
                resources[course.id] = [];
              }
            }
            
            setStudentData(validatedStudentData);
            setAllResources(resources);
          } else {
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

        // Teacher/Admin data
        if (["teacher", "admin"].includes(userRole)) {
          const studentsSnapshot = await fetchDataWithRetry(() => getDocs(collection(db, "students")));
          const studentsList = studentsSnapshot.docs.map((docSnapshot: QueryDocumentSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name || "Unnamed Student",
            email: docSnapshot.data().email || "",
            courses: Array.isArray(docSnapshot.data().courses) ? docSnapshot.data().courses : [],
            balance: Number(docSnapshot.data().balance) || 0,
            totalPaid: Number(docSnapshot.data().totalPaid) || 0,
            totalOwed: Number(docSnapshot.data().totalOwed) || 0,
            paymentStatus: ["Paid", "Partial", "Unpaid"].includes(docSnapshot.data().paymentStatus || "") 
              ? docSnapshot.data().paymentStatus as PaymentStatus 
              : "Unknown",
            transactions: Array.isArray(docSnapshot.data().transactions) ? docSnapshot.data().transactions : [],
            notifications: Array.isArray(docSnapshot.data().notifications) ? docSnapshot.data().notifications : [],
            clearance: !!docSnapshot.data().clearance
          } as StudentData));
          
          setAllStudents(studentsList);

          if (userRole === "teacher") {
            const teacherCourses = coursesList.filter((course: Course) => course.lecturerId === currentUser.uid);
            setSelectedCourse(teacherCourses[0]?.id || "");
          }
        }

        // Admin resources
        if (userRole === "admin") {
          const resources: Record<string, Resource[]> = {};
          for (const course of coursesList) {
            try {
              const resourcesSnapshot = await fetchDataWithRetry(() => 
                getDocs(collection(db, "courses", course.id, "resources"))
              );
              resources[course.id] = resourcesSnapshot.docs.map((docSnapshot: QueryDocumentSnapshot) => ({
                id: docSnapshot.id,
                name: docSnapshot.data().name || "Unnamed Resource",
                url: docSnapshot.data().url || "",
                type: docSnapshot.data().type || "Unknown",
                uploadDate: docSnapshot.data().uploadDate || new Date().toISOString(),
                courseId: course.id,
                uploadedBy: docSnapshot.data().uploadedBy
              })) as Resource[];
            } catch (err) {
              console.warn(`Failed to load resources for course ${course.id}:`, err);
              resources[course.id] = [];
            }
          }
          setAllResources(resources);
        }
      } catch (err: any) {
        console.error("Dashboard initialization failed:", err);
        setError(`Failed to load dashboard: ${err.message || "Please try again later"}`);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  // Loading State
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-800"></div>
        <span className="ml-3 text-lg text-red-800">Loading dashboard...</span>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center max-w-md mx-auto mt-10">
        <h3 className="text-red-800 font-semibold">Error Loading Dashboard</h3>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <div className="mt-4 space-x-4">
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
          <button 
            onClick={() => router.push("/auth/login")}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // No User Data
  if (!userData || !role) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center max-w-md mx-auto mt-10">
        <h3 className="text-yellow-800 font-semibold">User Data Not Found</h3>
        <p className="mt-2 text-sm text-yellow-600">
          Unable to load your profile. Please try logging in again.
        </p>
        <button 
          onClick={() => router.push("/auth/login")}
          className="mt-4 px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // Teacher Functions
  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher") return;
    
    try {
      if (!name || !url || !type || !courseId) {
        throw new Error("All fields are required.");
      }
      
      if (!url.match(/^https?:\/\/.+/)) {
        throw new Error("Please enter a valid URL starting with http:// or https://");
      }

      const resourceData = {
        courseId,
        name,
        url,
        type,
        uploadDate: new Date().toISOString(),
        uploadedBy: user?.uid
      };

      const resourceRef = await addDoc(
        collection(db, "courses", courseId, "resources"), 
        resourceData
      );

      setAllResources(prev => ({
        ...prev,
        [courseId]: [...(prev[courseId] || []), { ...resourceData, id: resourceRef.id }]
      }));

      const course = allCourses.find(c => c.id === courseId);
      const enrolledStudents = allStudents.filter(student => 
        student.courses?.some(c => c.id === courseId)
      );
      
      for (const student of enrolledStudents) {
        try {
          const notification: Notification = {
            id: crypto.randomUUID(),
            message: `New resource "${name}" added to ${course?.name || "course"}`,
            date: new Date().toISOString(),
            read: false,
            type: "resource"
          };
          
          await updateDoc(doc(db, "students", student.id), {
            notifications: [...(student.notifications || []), notification]
          });
        } catch (err) {
          console.warn(`Failed to notify student ${student.id}:`, err);
        }
      }

      alert("Resource added successfully!");
    } catch (err: any) {
      alert(`Failed to add resource: ${err.message || "Please try again"}`);
    }
  };

  const handleGenerateGradeReport = () => {
    if (!studentData?.courses?.length) {
      alert("No courses available to generate report.");
      return;
    }
    
    try {
      const pdfDoc = new jsPDF();
      pdfDoc.setFontSize(16);
      pdfDoc.text("Grade Report", 20, 20);
      pdfDoc.setFontSize(12);
      pdfDoc.text(`Student: ${studentData.name || username}`, 20, 30);
      pdfDoc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 40);

      let yPosition = 60;
      
      studentData.courses.forEach((course) => {
        pdfDoc.text(`Course: ${course.name || "Unnamed Course"}`, 20, yPosition);
        yPosition += 10;
        
        if (course.subjects?.length) {
          const gradeData = course.subjects.map(subject => [
            subject.name || "Unnamed Subject",
            subject.grades?.C1 || "-",
            subject.grades?.C2 || "-",
            subject.grades?.C3 || "-",
            subject.grades?.C4 || "-",
            subject.grades?.exam || "-",
            subject.grades?.project || "-",
            subject.grades?.final || "-"
          ]);
          
          autoTable(pdfDoc, {
            startY: yPosition,
            head: [['Subject', 'C1', 'C2', 'C3', 'C4', 'Exam', 'Project', 'Final']],
            body: gradeData,
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [128, 0, 0] },
          });
          
          yPosition = (pdfDoc as any).lastAutoTable.finalY + 15;
        } else {
          pdfDoc.text("No grades available", 25, yPosition);
          yPosition += 15;
        }
      });

      pdfDoc.save(`${studentData.name || username}_grades_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert(`Failed to generate report: ${err.message}`);
    }
  };

  // Grade Management
  const handleGradeChange = (field: keyof GradeForm, value: string) => {
    setGradeData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const submitGrades = async () => {
    if (!selectedStudent?.id || !selectedCourse || !selectedSubject) {
      alert("Please select a student, course, and subject.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "students", selectedStudent.id);
      const studentSnap = await getDoc(studentRef);
      
      if (!studentSnap.exists()) {
        throw new Error("Student record not found.");
      }

      const studentData = studentSnap.data() as StudentData;
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
      
      setAllStudents(allStudents.map(student => 
        student.id === selectedStudent.id 
          ? { ...student, courses: updatedCourses } 
          : student
      ));
      
      alert("Grades saved successfully!");
      setGradeData({
        C1: "", C2: "", C3: "", C4: "", exam: "", project: "",
        participation: "", attendance: "", comments: ""
      });
    } catch (error: any) {
      alert(`Failed to save grades: ${error.message || "Please try again"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateFinalGrade = (grades: GradeForm): string => {
    try {
      const numericFields = ['C1', 'C2', 'C3', 'C4', 'exam', 'project', 'participation', 'attendance']
        .filter(k => grades[k as keyof GradeForm] && !isNaN(parseFloat(grades[k as keyof GradeForm])));
      
      if (!numericFields.length) return "N/A";
      
      const scores = numericFields.map(k => {
        const value = parseFloat(grades[k as keyof GradeForm]);
        return Math.max(0, Math.min(100, value));
      });
      
      const weights = {
        C1: 0.1, C2: 0.1, C3: 0.1, C4: 0.1,
        exam: 0.3, project: 0.15, participation: 0.1, attendance: 0.05
      };
      
      const weightedSum = scores.reduce((sum, score, i) => 
        sum + score * (weights[numericFields[i] as keyof typeof weights] || 0), 0
      );
      
      return (Math.round(weightedSum * 100) / 100).toFixed(2);
    } catch {
      return "Error";
    }
  };

  const loadStudentGrades = async (studentId: string) => {
    if (!studentId) {
      setSelectedStudent(null);
      setGradeData({
        C1: "", C2: "", C3: "", C4: "", exam: "", project: "",
        participation: "", attendance: "", comments: ""
      });
      return;
    }
    
    try {
      const studentDoc = await getDoc(doc(db, "students", studentId));
      if (studentDoc.exists()) {
        const student = studentDoc.data() as StudentData;
        setSelectedStudent(student);
        
        const course = student.courses?.find(c => c.id === selectedCourse);
        const subject = course?.subjects?.find(s => s.name === selectedSubject);
        
        setGradeData({
          C1: subject?.grades?.C1 || "",
          C2: subject?.grades?.C2 || "",
          C3: subject?.grades?.C3 || "",
          C4: subject?.grades?.C4 || "",
          exam: subject?.grades?.exam || "",
          project: subject?.grades?.project || "",
          participation: subject?.grades?.participation || "",
          attendance: subject?.grades?.attendance || "",
          comments: subject?.grades?.comments || ""
        });
      } else {
        setSelectedStudent(null);
        alert("Student record not found.");
      }
    } catch (err) {
      console.error("Failed to load student grades:", err);
      setSelectedStudent(null);
      alert("Failed to load student grades.");
    }
  };

  // Admin Functions
  const handleClearanceToggle = async (studentId: string, hasClearance: boolean) => {
    if (role !== "admin") return;
    
    try {
      await updateDoc(doc(db, "students", studentId), {
        clearance: !hasClearance
      });
      
      setAllStudents(allStudents.map(student => 
        student.id === studentId ? { ...student, clearance: !hasClearance } : student
      ));
      
      alert(`Clearance ${!hasClearance ? "granted" : "revoked"} successfully`);
    } catch (err: any) {
      alert(`Failed to update clearance: ${err.message}`);
    }
  };

  const handleDeleteAccount = async (userId: string) => {
    if (role !== "admin") return;
    
    if (!confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
      return;
    }
    
    try {
      await Promise.all([
        deleteDoc(doc(db, "users", userId)),
        deleteDoc(doc(db, "students", userId))
      ]);
      
      setAllStudents(allStudents.filter(student => student.id !== userId));
      alert("Account deleted successfully");
    } catch (err: any) {
      alert(`Failed to delete account: ${err.message}`);
    }
  };

  // Student Functions
  const handlePaymentSuccess = async () => {
    if (!studentData || !user?.uid) {
      alert("Unable to process payment: Invalid student data");
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid payment amount");
      return;
    }
    
    if (amount > (studentData.balance || 0)) {
      alert("Payment amount cannot exceed outstanding balance");
      return;
    }
    
    try {
      const updatedBalance = (studentData.balance || 0) - amount;
      const updatedTotalPaid = (studentData.totalPaid || 0) + amount;
      const paymentStatus = updatedBalance <= 0 ? "Paid" : "Partial";
      
      const newTransaction: Transaction = {
        id: crypto.randomUUID(),
        amount,
        date: new Date().toISOString(),
        status: "Completed"
      };
      
      await updateDoc(doc(db, "students", user.uid), {
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: [...(studentData.transactions || []), newTransaction]
      });
      
      setStudentData({
        ...studentData,
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: [...(studentData.transactions || []), newTransaction]
      });
      
      setPaymentAmount("");
      alert(`Payment of $${amount.toFixed(2)} processed successfully!`);
    } catch (err: any) {
      alert(`Failed to process payment: ${err.message}`);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    if (!studentData?.id) return;
    
    try {
      const updatedNotifications = (studentData.notifications || []).map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      );
      
      await updateDoc(doc(db, "students", studentData.id), {
        notifications: updatedNotifications
      });
      
      setStudentData({
        ...studentData,
        notifications: updatedNotifications
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-gray-50">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg p-6 fixed h-full">
          <h3 className="text-2xl font-bold text-red-800 mb-6">SMIS Portal</h3>
          <nav className="space-y-3">
            <Link href="/dashboard" className="block text-red-800 hover:bg-red-50 p-2 rounded-lg">
              Dashboard
            </Link>
            <Link href="/profile" className="block text-red-800 hover:bg-red-50 p-2 rounded-lg">
              Profile
            </Link>
            {role === "student" && (
              <Link href="/courses" className="block text-red-800 hover:bg-red-50 p-2 rounded-lg">
                Browse Courses
              </Link>
            )}
            {(role === "admin" || role === "teacher") && (
              <Link href="/reports" className="block text-red-800 hover:bg-red-50 p-2 rounded-lg">
                Reports
              </Link>
            )}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-red-800">
                {greeting}, {username}!
              </h1>
              <button
                onClick={() => auth.signOut()}
                className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>

            {/* STUDENT DASHBOARD */}
            {role === "student" && studentData && (
              <div className="space-y-8">
                {/* Overview Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Current Balance</p>
                      <p className={`text-2xl font-bold ${studentData.balance && studentData.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        ${(studentData.balance || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Enrolled Courses</p>
                      <p className="text-2xl font-bold">{studentData.courses?.length || 0}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Unread Notifications</p>
                      <p className="text-2xl font-bold">
                        {studentData.notifications?.filter(n => !n.read).length || 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h2 className="text-xl font-semibold text-red-800 mb-4">Payment Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div>
                      <p className="text-gray-600">Total Owed</p>
                      <p className="text-lg font-semibold">${(studentData.totalOwed || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Paid</p>
                      <p className="text-lg font-semibold">${(studentData.totalPaid || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Payment Status</p>
                      <p className={`text-lg font-semibold ${
                        studentData.paymentStatus === "Paid" ? "text-green-600" :
                        studentData.paymentStatus === "Partial" ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {studentData.paymentStatus || "Unknown"}
                      </p>
                    </div>
                  </div>
                  {(studentData.balance ?? 0) > 0 ? (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-red-800 mb-3">Make a Payment</h3>
                      <div className="flex items-center gap-4 max-w-md">
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Enter amount"
                          min="0.01"
                          max={studentData.balance?.toFixed(2)}
                          step="0.01"
                          className="p-2 border rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-red-800"
                        />
                        <button
                          onClick={handlePaymentSuccess}
                          disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                          className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-green-50 rounded-lg text-green-800">
                      Your account is fully paid. Thank you!
                    </div>
                  )}
                </div>

                {/* Courses and Grades */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-red-800">Your Courses</h2>
                    {studentData.courses?.length ? (
                      <button
                        onClick={handleGenerateGradeReport}
                        className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
                      >
                        Download Grade Report
                      </button>
                    ) : null}
                  </div>
                  {studentData.courses?.length ? (
                    studentData.courses.map((course) => (
                      <div key={course.id} className="mb-8 border-b pb-6 last:border-b-0">
                        <h3 className="text-lg font-semibold text-red-800">{course.name || "Unnamed Course"}</h3>
                        
                        {/* Resources */}
                        <div className="mt-4">
                          <h4 className="font-medium text-gray-700">Resources</h4>
                          {allResources[course.id]?.length ? (
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {allResources[course.id].map((resource) => (
                                <div key={resource.id} className="p-3 bg-gray-50 rounded-lg">
                                  <a 
                                    href={resource.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline font-medium"
                                  >
                                    {resource.name}
                                  </a>
                                  <p className="text-sm text-gray-500 mt-1">
                                    {resource.type} • {new Date(resource.uploadDate).toLocaleDateString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 bg-gray-50 rounded-lg text-gray-600">
                              No resources available for this course
                            </div>
                          )}
                        </div>
                        
                        {/* Grades */}
                        <div className="mt-6">
                          <h4 className="font-medium text-gray-700">Grades</h4>
                          {course.subjects?.length ? (
                            <div className="mt-3 space-y-4">
                              {course.subjects.map((subject) => (
                                <div key={subject.name} className="p-4 bg-gray-50 rounded-lg">
                                  <h5 className="font-medium text-gray-800">{subject.name || "Unnamed Subject"}</h5>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                                    <div>
                                      <p className="text-gray-600 text-sm">Classwork 1</p>
                                      <p className="font-semibold">{subject.grades?.C1 || "-"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 text-sm">Classwork 2</p>
                                      <p className="font-semibold">{subject.grades?.C2 || "-"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 text-sm">Exam</p>
                                      <p className="font-semibold">{subject.grades?.exam || "-"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 text-sm">Final Grade</p>
                                      <p className="font-bold text-red-800">{subject.grades?.final || "-"}</p>
                                    </div>
                                  </div>
                                  {subject.grades?.comments && (
                                    <div className="mt-3">
                                      <p className="text-gray-600 text-sm">Comments</p>
                                      <p className="text-sm text-gray-700 italic">{subject.grades.comments}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 bg-gray-50 rounded-lg text-gray-600">
                              No grades available for this course
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 bg-gray-50 rounded-lg text-center">
                      <p className="text-gray-600 mb-2">You are not enrolled in any courses.</p>
                      <Link href="/courses" className="text-red-800 hover:underline font-medium">
                        Browse available courses
                      </Link>
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-red-800">Notifications</h2>
                    {studentData.notifications?.length ? (
                      <button
                        onClick={async () => {
                          if (!studentData.id) return;
                          try {
                            const updatedNotifications = (studentData.notifications ?? []).map(n => ({ ...n, read: true }));
                            await updateDoc(doc(db, "students", studentData.id), {
                              notifications: updatedNotifications
                            });
                            setStudentData({ ...studentData, notifications: updatedNotifications });
                          } catch {
                            alert("Failed to mark notifications as read.");
                          }
                        }}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Mark All as Read
                      </button>
                    ) : null}
                  </div>
                  {studentData.notifications?.length ? (
                    <div className="space-y-3">
                      {studentData.notifications
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-4 rounded-lg ${notification.read ? "bg-gray-50" : "bg-blue-50"}`}
                          >
                            <p className={`font-medium ${notification.read ? "text-gray-700" : "text-blue-800"}`}>
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(notification.date).toLocaleString()}
                            </p>
                            {!notification.read && (
                              <button
                                onClick={() => markNotificationAsRead(notification.id)}
                                className="text-xs text-blue-600 hover:underline mt-2"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-600">
                      No notifications to display
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TEACHER DASHBOARD */}
            {role === "teacher" && (
              <div className="space-y-8">
                <div className="flex space-x-4 mb-6 border-b">
                  {["overview", "grades", "resources"].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 font-medium ${
                        activeTab === tab
                          ? "border-b-2 border-red-800 text-red-800"
                          : "text-gray-600 hover:text-red-800"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {activeTab === "overview" && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-semibold text-red-800 mb-4">Teaching Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-gray-600">Assigned Courses</p>
                        <p className="text-2xl font-bold">
                          {allCourses.filter(c => c.lecturerId === user?.uid).length}
                        </p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-gray-600">Total Students</p>
                        <p className="text-2xl font-bold">
                          {allStudents.filter(s => s.courses?.some(c => allCourses.find(ac => ac.id === c.id && ac.lecturerId === user?.uid))).length}
                        </p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-gray-600">Resources Shared</p>
                        <p className="text-2xl font-bold">
                          {Object.values(allResources).flat().filter(r => r.uploadedBy === user?.uid).length}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "grades" && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-semibold text-red-800 mb-6">Grade Management</h2>
                    
                    {/* Course Selection */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Select Course</label>
                      <select
                        value={selectedCourse}
                        onChange={(e) => {
                          setSelectedCourse(e.target.value);
                          setSelectedStudent(null);
                          setSelectedSubject("");
                        }}
                        className="w-full max-w-xs p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                      >
                        <option value="">Select a course</option>
                        {allCourses
                          .filter(course => course.lecturerId === user?.uid)
                          .map(course => (
                            <option key={course.id} value={course.id}>{course.name}</option>
                          ))}
                      </select>
                    </div>
                    
                    {!selectedCourse && (
                      <div className="p-6 bg-gray-50 rounded-lg text-center">
                        <p className="text-gray-600">
                          {allCourses.filter(c => c.lecturerId === user?.uid).length === 0
                            ? "No courses assigned. Contact administration."
                            : "Please select a course to manage grades."}
                        </p>
                      </div>
                    )}
                    
                    {selectedCourse && (
                      <>
                        {/* Student Selection */}
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Select Student</label>
                          <select
                            value={selectedStudent?.id || ""}
                            onChange={(e) => loadStudentGrades(e.target.value)}
                            className="w-full max-w-xs p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                          >
                            <option value="">Select a student</option>
                            {allStudents
                              .filter(student => student.courses?.some(c => c.id === selectedCourse))
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(student => (
                                <option key={student.id} value={student.id}>
                                  {student.name} ({student.email})
                                </option>
                              ))}
                          </select>
                        </div>
                        
                        {/* Subject Selection */}
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Select Subject</label>
                          <select
                            value={selectedSubject}
                            onChange={(e) => {
                              setSelectedSubject(e.target.value);
                              if (selectedStudent) loadStudentGrades(selectedStudent.id);
                            }}
                            className="w-full max-w-xs p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                          >
                            <option value="">Select a subject</option>
                            {allCourses
                              .find(c => c.id === selectedCourse)
                              ?.subjects?.map(subject => (
                                <option key={subject.name} value={subject.name}>{subject.name}</option>
                              ))}
                          </select>
                        </div>
                        
                        {selectedStudent && selectedSubject ? (
                          <div className="mt-8 border-t pt-6">
                            <h3 className="text-lg font-semibold text-red-800 mb-6">
                              Grades for {selectedStudent.name} - {selectedSubject}
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Classwork */}
                              <div className="space-y-4">
                                <h4 className="font-medium text-gray-700">Classwork</h4>
                                {[1, 2, 3, 4].map(num => (
                                  <div key={`C${num}`} className="flex items-center gap-3">
                                    <label className="w-20 text-sm">C{num}</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={gradeData[`C${num}` as keyof GradeForm]}
                                      onChange={(e) => handleGradeChange(`C${num}` as keyof GradeForm, e.target.value)}
                                      className="p-2 border rounded-lg w-24 focus:outline-none focus:ring-2 focus:ring-red-800"
                                      placeholder="0-100"
                                    />
                                  </div>
                                ))}
                              </div>
                              
                              {/* Assessments */}
                              <div className="space-y-4">
                                {["Exam", "Project", "Participation", "Attendance"].map(field => (
                                  <div key={field} className="flex items-center gap-3">
                                    <label className="w-20 text-sm">{field}</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={gradeData[field.toLowerCase() as keyof GradeForm]}
                                      onChange={(e) => handleGradeChange(field.toLowerCase() as keyof GradeForm, e.target.value)}
                                      className="p-2 border rounded-lg w-24 focus:outline-none focus:ring-2 focus:ring-red-800"
                                      placeholder="0-100"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            {/* Comments */}
                            <div className="mt-6">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                              <textarea
                                value={gradeData.comments}
                                onChange={(e) => handleGradeChange("comments", e.target.value)}
                                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                                rows={4}
                                placeholder="Provide feedback..."
                              />
                            </div>
                            
                            {/* Final Grade */}
                            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-700">Final Grade</span>
                                <span className="text-xl font-bold text-red-800">
                                  {gradeData.exam || gradeData.C1 ? calculateFinalGrade(gradeData) : "-"}
                                </span>
                              </div>
                            </div>
                            
                            {/* Submit */}
                            <div className="mt-6">
                              <button
                                onClick={submitGrades}
                                disabled={isSubmitting}
                                className="px-6 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                              >
                                {isSubmitting ? "Saving..." : "Save Grades"}
                              </button>
                            </div>
                          </div>
                        ) : selectedCourse && (
                          <div className="p-6 bg-gray-50 rounded-lg text-center">
                            <p className="text-gray-600">
                              Please select a student and subject to enter grades.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {activeTab === "resources" && (
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-semibold text-red-800 mb-6">Resource Management</h2>
                    
                    <input
                      type="text"
                      placeholder="Search students by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="p-2 border rounded-lg w-full mb-6 focus:outline-none focus:ring-2 focus:ring-red-800"
                    />
                    
                    {allStudents
                      .filter(student => 
                        student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        student.email?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((student) => (
                        <div key={student.id} className="mb-8 border-b pb-6 last:border-b-0">
                          <h3 className="text-lg font-semibold text-red-800 mb-4">
                            {student.name} ({student.email})
                          </h3>
                          
                          {allCourses
                            .filter(course => 
                              course.lecturerId === user?.uid && 
                              student.courses?.some(c => c.id === course.id)
                            )
                            .map((course) => (
                              <div key={course.id} className="mt-4 pl-4">
                                <h4 className="font-medium text-gray-700 mb-3">{course.name}</h4>
                                
                                {/* Existing Resources */}
                                {allResources[course.id]?.length ? (
                                  <div className="mb-6">
                                    <h5 className="text-sm font-medium text-gray-700 mb-2">Resources</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {allResources[course.id].map(resource => (
                                        <div key={resource.id} className="p-3 bg-gray-50 rounded-lg">
                                          <a 
                                            href={resource.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline font-medium"
                                          >
                                            {resource.name}
                                          </a>
                                          <p className="text-sm text-gray-500 mt-1">
                                            {resource.type} • {new Date(resource.uploadDate).toLocaleDateString()}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-600 mb-4">No resources added yet</p>
                                )}
                                
                                {/* Add Resource */}
                                <div className="mt-4">
                                  <h5 className="text-sm font-medium text-gray-700 mb-2">Add New Resource</h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input
                                      type="text"
                                      placeholder="Resource Name"
                                      className="p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                                      id={`resource-name-${course.id}-${student.id}`}
                                    />
                                    <input
                                      type="url"
                                      placeholder="Resource URL (https://...)"
                                      className="p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                                      id={`resource-url-${course.id}-${student.id}`}
                                    />
                                    <select 
                                      className="p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-800"
                                      id={`resource-type-${course.id}-${student.id}`}
                                    >
                                      <option value="">Select type</option>
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
                                        
                                        handleAddResource(
                                          course.id,
                                          nameInput.value,
                                          urlInput.value,
                                          typeSelect.value
                                        );
                                        nameInput.value = "";
                                        urlInput.value = "";
                                        typeSelect.value = "";
                                      }}
                                      className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700"
                                    >
                                      Add Resource
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      ))}
                    
                    {allStudents.filter(student => 
                      student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      student.email?.toLowerCase().includes(searchTerm.toLowerCase())
                    ).length === 0 && (
                      <div className="p-6 bg-gray-50 rounded-lg text-center">
                        <p className="text-gray-600">No matching students found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ADMIN DASHBOARD */}
            {role === "admin" && (
              <div className="space-y-8">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h2 className="text-xl font-semibold text-red-800 mb-6">System Administration</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Students</p>
                      <p className="text-2xl font-bold">{allStudents.length}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Courses</p>
                      <p className="text-2xl font-bold">{allCourses.length}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Resources</p>
                      <p className="text-2xl font-bold">
                        {Object.values(allResources).reduce((sum, resources) => sum + resources.length, 0)}
                      </p>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-red-800 mb-4">Student Management</h3>
                  <input
                    type="text"
                    placeholder="Search students by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded-lg w-full mb-6 focus:outline-none focus:ring-2 focus:ring-red-800"
                  />
                  
                  {allStudents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white rounded-lg shadow-sm">
                        <thead>
                          <tr className="bg-red-800 text-white">
                            <th className="py-3 px-4 text-left">Name</th>
                            <th className="py-3 px-4 text-left">Email</th>
                            <th className="py-3 px-4 text-left">Courses</th>
                            <th className="py-3 px-4 text-left">Clearance</th>
                            <th className="py-3 px-4 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allStudents
                            .filter(student => 
                              student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              student.email?.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map((student) => (
                              <tr key={student.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{student.name}</td>
                                <td className="py-3 px-4">{student.email}</td>
                                <td className="py-3 px-4">{student.courses?.length || 0}</td>
                                <td className="py-3 px-4">
                                  <span className={student.clearance ? "text-green-600" : "text-red-600"}>
                                    {student.clearance ? "Granted" : "Not Granted"}
                                  </span>
                                </td>
                                <td className="py-3 px-4 space-x-3">
                                  <button
                                    onClick={() => handleClearanceToggle(student.id, student.clearance || false)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                  >
                                    {student.clearance ? "Revoke" : "Grant"}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAccount(student.id)}
                                    className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-50 rounded-lg text-center">
                      <p className="text-gray-600">No students in the system</p>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-red-800 mt-8 mb-4">Recent Resources</h3>
                  {Object.values(allResources).flat().length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white rounded-lg shadow-sm">
                        <thead>
                          <tr className="bg-red-800 text-white">
                            <th className="py-3 px-4 text-left">Course</th>
                            <th className="py-3 px-4 text-left">Resource Name</th>
                            <th className="py-3 px-4 text-left">Type</th>
                            <th className="py-3 px-4 text-left">Date Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(allResources)
                            .flatMap(([courseId, resources]) =>
                              resources.map(resource => ({
                                resource,
                                course: allCourses.find(c => c.id === courseId)
                              }))
                            )
                            .sort((a, b) => new Date(b.resource.uploadDate).getTime() - new Date(a.resource.uploadDate).getTime())
                            .slice(0, 10)
                            .map(({ resource, course }) => (
                              <tr key={resource.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{course?.name || "Unknown Course"}</td>
                                <td className="py-3 px-4">
                                  <a 
                                    href={resource.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {resource.name}
                                  </a>
                                </td>
                                <td className="py-3 px-4">{resource.type}</td>
                                <td className="py-3 px-4">
                                  {new Date(resource.uploadDate).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-50 rounded-lg text-center">
                      <p className="text-gray-600">No resources uploaded yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ACCOUNTS ADMIN DASHBOARD */}
            {role === "accountsadmin" && (
              <div className="space-y-8">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h2 className="text-xl font-semibold text-red-800 mb-6">Financial Management</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Students</p>
                      <p className="text-2xl font-bold">{allStudents.length}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Outstanding</p>
                      <p className="text-2xl font-bold">
                        ${allStudents.reduce((sum, s) => sum + (s.balance || 0), 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-gray-600">Total Paid</p>
                      <p className="text-2xl font-bold">
                        ${allStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Search students by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded-lg w-full mb-6 focus:outline-none focus:ring-2 focus:ring-red-800"
                  />
                  
                  {allStudents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white rounded-lg shadow-sm">
                        <thead>
                          <tr className="bg-red-800 text-white">
                            <th className="py-3 px-4 text-left">Student ID</th>
                            <th className="py-3 px-4 text-left">Name</th>
                            <th className="py-3 px-4 text-left">Balance</th>
                            <th className="py-3 px-4 text-left">Last Payment</th>
                            <th className="py-3 px-4 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allStudents
                            .filter(student => 
                              student.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              student.id?.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map((student) => (
                              <tr key={student.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{student.id.slice(0, 8)}</td>
                                <td className="py-3 px-4">{student.name}</td>
                                <td className={`py-3 px-4 ${
                                  (student.balance || 0) > 0 ? "text-red-600 font-medium" : "text-green-600"
                                }`}>
                                  ${(student.balance || 0).toFixed(2)}
                                </td>
                                <td className="py-3 px-4">
                                  {student.transactions?.length
                                    ? new Date(student.transactions[student.transactions.length - 1].date).toLocaleDateString()
                                    : "-"}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={
                                    student.paymentStatus === "Paid" ? "text-green-600" :
                                    student.paymentStatus === "Partial" ? "text-yellow-600" : "text-red-600"
                                  }>
                                    {student.paymentStatus || "Unknown"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-50 rounded-lg text-center">
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