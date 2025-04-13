"use client";

import { useEffect, useState, Component, ReactNode } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  StudentData,
  Course,
  Subject,
  Transaction,
  Notification,
  Resource,
  Test,
  TestResponse,
  User,
} from "../../models";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  sanitizeStudentData,
  sanitizeCourse,
  sanitizeUser,
  sanitizeResource,
  sanitizeTest,
  sanitizeTransaction,
  sanitizeNotification,
} from "../../utils/firestoreSanitizer";

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

  render() {
    if (this.state.hasError) {
      return <p className="text-red-800 text-center">Something went wrong. Please try again.</p>;
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminStudentSearch, setAdminStudentSearch] = useState("");
  const [teacherStudentSearch, setTeacherStudentSearch] = useState("");
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
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
          console.error("User document does not exist");
          setError("User profile not found. Please contact support.");
          return;
        }

        const fetchedUserData = sanitizeUser(userSnap.data() as User);
        setRole(fetchedUserData.role || "");
        setUsername(fetchedUserData.name || "Unnamed");
        setUserData(fetchedUserData);
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening");

        if (fetchedUserData.role === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          if (studentSnap.exists()) {
            const fetchedStudentData = sanitizeStudentData(studentSnap.data() as StudentData);
            setStudentData({
              ...fetchedStudentData,
              transactions: fetchedStudentData.transactions || [],
              notifications: fetchedStudentData.notifications || [],
            });
          } else {
            console.warn("Student document not found");
            setStudentData(null);
          }

          const coursesSnapshot = await getDocs(collection(db, "courses"));
          const coursesList = await Promise.all(
            coursesSnapshot.docs.map(async (courseDoc) => {
              const courseData = courseDoc.data();
              const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
              const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
              const resources = resourcesSnapshot.docs.map((doc) => sanitizeResource({ id: doc.id, ...doc.data() }));
              const tests = await Promise.all(
                testsSnapshot.docs.map(async (testDoc) => {
                  const testData = sanitizeTest(testDoc.data());
                  const responseSnap = await getDoc(doc(db, "courses", courseDoc.id, "tests", testDoc.id, "responses", currentUser.uid));
                  const response = responseSnap.exists() ? (responseSnap.data() as TestResponse) : null;
                  if (response) {
                    setTestResponses((prev) => ({ ...prev, [testDoc.id]: response }));
                  }
                  return { ...testData, id: testDoc.id };
                })
              );
              return sanitizeCourse({ id: courseDoc.id, ...courseData, resources, tests });
            })
          );
          setAllCourses(coursesList);
        }

        if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role)) {
          const studentsSnapshot = await getDocs(collection(db, "students"));
          const studentsList = await Promise.all(
            studentsSnapshot.docs.map(async (studentDoc) => {
              const studentData = studentDoc.data();
              const transactionsSnap = await getDocs(collection(studentDoc.ref, "transactions"));
              const notificationsSnap = await getDocs(collection(studentDoc.ref, "notifications"));
              const transactions = transactionsSnap.docs.map((doc) => sanitizeTransaction({ id: doc.id, ...doc.data() }));
              const notifications = notificationsSnap.docs.map((doc) => sanitizeNotification({ id: doc.id, ...doc.data() }));
              return sanitizeStudentData({
                id: studentDoc.id,
                ...studentData,
                transactions,
                notifications,
              });
            })
          );
          setAllStudents(studentsList);

          const coursesSnapshot = await getDocs(collection(db, "courses"));
          const coursesList = await Promise.all(
            coursesSnapshot.docs.map(async (courseDoc) => {
              const courseData = courseDoc.data();
              const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
              const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
              const resources = resourcesSnapshot.docs.map((doc) => sanitizeResource({ id: doc.id, ...doc.data() }));
              const tests = testsSnapshot.docs.map((doc) => sanitizeTest({ id: doc.id, ...doc.data() }));
              return sanitizeCourse({ id: courseDoc.id, ...courseData, resources, tests });
            })
          );
          setAllCourses(coursesList);
        }
      } catch (err) {
        console.error("Error in useEffect:", err);
        setError("Failed to load dashboard data.");
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  // ... (Other functions like calculateCourseAverage, handlePaymentSuccess, etc., remain unchanged unless specified)

  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (!["teacher", "admin"].includes(role)) return;
    if (!name.trim() || !url.trim()) {
      alert("Please enter a valid resource name and URL.");
      return;
    }
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
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, resources: [...(c.resources || []), newResource] } : c
        )
      );
      alert("Resource added!");
    } catch (err: any) {
      console.error("Error adding resource:", err);
      alert("Failed to add resource: " + err.message);
    }
  };

  // Example of controlled form for adding resources
  const [resourceForm, setResourceForm] = useState({ name: "", url: "", type: "Video" });

  // ... (Rest of the component logic)

  if (isLoading) return <p className="text-red-800 text-center">Loading...</p>;
  if (error) return <p className="text-red-800 text-center">{error}</p>;
  if (!userData || !role) return null;

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-gray-100">
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
                <Link href="/admin/settings" className="text-red-800 hover:underline">
                  Settings
                </Link>
              </li>
            )}
          </ul>
        </div>

        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {/* ... (Rest of the UI remains similar, with improvements below) */}

            {/* Example: Controlled form for adding resources */}
            {["teacher", "admin"].includes(role) && allCourses.map((course) => (
              <div key={course.id} className="mt-4">
                <h4 className="text-red-800 font-medium">Add Resource for {course.name}</h4>
                <input
                  type="text"
                  placeholder="Resource Name"
                  value={resourceForm.name}
                  onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                  className="p-2 border rounded text-red-800 w-full mt-2"
                />
                <input
                  type="text"
                  placeholder="Resource URL"
                  value={resourceForm.url}
                  onChange={(e) => setResourceForm({ ...resourceForm, url: e.target.value })}
                  className="p-2 border rounded text-red-800 w-full mt-2"
                />
                <select
                  value={resourceForm.type}
                  onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })}
                  className="p-2 border rounded text-red-800 w-full mt-2"
                >
                  <option value="Video">Video</option>
                  <option value="Document">Document</option>
                  <option value="Link">Link</option>
                </select>
                <button
                  onClick={() => {
                    handleAddResource(course.id, resourceForm.name, resourceForm.url, resourceForm.type);
                    setResourceForm({ name: "", url: "", type: "Video" });
                  }}
                  className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 w-full mt-2"
                >
                  Add Resource
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}