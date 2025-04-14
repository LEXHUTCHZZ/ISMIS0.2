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
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  StudentData,
  Course,
  Notification,
  Resource,
  Test,
  TestQuestion,
  TestResponse,
  User,
} from "../../models";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";
import {
  sanitizeStudentData,
  sanitizeCourse,
  sanitizeUser,
  sanitizeResource,
  sanitizeTest,
  sanitizeNotification,
} from "../../utils/firestoreSanitizer";

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
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p>Something went wrong.</p>
          {this.state.error && (
            <details className="mt-2 text-sm">
              <summary>Error details</summary>
              <pre>{this.state.error.toString()}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// Notification List Component
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
            <p className="text-sm text-gray-500">
              {new Date(notification.date).toLocaleString()}
            </p>
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

// Resource Form Component
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
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || !type) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/^https?:\/\/[^\s$.?#].[^\s]*$/.test(url)) {
      setError("Invalid URL format. Please use http:// or https://");
      return;
    }
    onAddResource(courseId, name, url, type);
    setName("");
    setUrl("");
    setType("Video");
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-2">
      <input
        type="text"
        placeholder="Resource Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="p-2 border rounded text-red-800 w-full"
        required
      />
      <input
        type="url"
        placeholder="Resource URL (https://...)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="p-2 border rounded text-red-800 w-full"
        required
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="p-2 border rounded text-red-800 w-full"
        required
      >
        <option value="Video">Video</option>
        <option value="Document">Document</option>
        <option value="Link">Link</option>
      </select>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 w-full"
      >
        Add Resource
      </button>
    </form>
  );
};

// Test Form Component
const TestForm = ({
  courseId,
  onAddTest,
}: {
  courseId: string;
  onAddTest: (courseId: string, title: string, questions: TestQuestion[]) => void;
}) => {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([{ question: "", options: [], correctAnswer: "" }]);
  const [error, setError] = useState("");

  const addQuestion = () => setQuestions([...questions, { question: "", options: [], correctAnswer: "" }]);
  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };
  const updateQuestion = (index: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], question: value };
    setQuestions(newQuestions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a test title.");
      return;
    }
    if (questions.some((q) => !q.question.trim())) {
      setError("Please fill in all questions.");
      return;
    }
    onAddTest(courseId, title, questions);
    setTitle("");
    setQuestions([{ question: "", options: [], correctAnswer: "" }]);
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-2">
      <input
        type="text"
        placeholder="Test Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="p-2 border rounded text-red-800 w-full"
        required
      />
      {questions.map((question, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={`Question ${index + 1}`}
            value={question.question}
            onChange={(e) => updateQuestion(index, e.target.value)}
            className="p-2 border rounded text-red-800 flex-1"
            required
          />
          <button
            type="button"
            onClick={() => removeQuestion(index)}
            className="p-2 text-red-800 hover:text-red-600"
            disabled={questions.length <= 1}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addQuestion}
          className="px-4 py-2 bg-gray-200 text-red-800 rounded-md hover:bg-gray-300 flex-1"
        >
          Add Question
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 flex-1"
        >
          Create Test
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
};

// Test Submission Form Component
const TestSubmissionForm = ({
  courseId,
  test,
  onSubmit,
}: {
  courseId: string;
  test: Test;
  onSubmit: (courseId: string, testId: string, answers: string[]) => void;
}) => {
  const [answers, setAnswers] = useState<string[]>(test.questions.map(() => ""));
  const [error, setError] = useState("");

  const updateAnswer = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answers.some((a) => !a.trim())) {
      setError("Please answer all questions.");
      return;
    }
    onSubmit(courseId, test.id, answers);
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      {test.questions.map((question, index) => (
        <div key={index} className="mb-2">
          <p className="text-gray-600">{`Question ${index + 1}: ${question.question}`}</p>
          <textarea
            placeholder={`Your answer for question ${index + 1}`}
            value={answers[index]}
            onChange={(e) => updateAnswer(index, e.target.value)}
            className="p-2 border rounded text-red-800 w-full min-h-[80px]"
            required
          />
        </div>
      ))}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
      >
        Submit Test
      </button>
    </form>
  );
};

// Main Dashboard Component
type Role = "student" | "teacher" | "admin";

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<Role | "">("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [testResponses, setTestResponses] = useState<Record<string, TestResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

        const fetchedUserData = sanitizeUser(userSnap.data() as User);
        const userRole = fetchedUserData.role as Role;
        
        if (!["student", "teacher", "admin"].includes(userRole)) {
          throw new Error("Invalid user role");
        }
        
        setRole(userRole);
        setUsername(fetchedUserData.name || "User");
        setUserData(fetchedUserData);
        
        const hour = new Date().getHours();
        setGreeting(
          hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"
        );

        // Fetch student data if student
        if (userRole === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          
          let studentData: StudentData;
          if (studentSnap.exists()) {
            studentData = sanitizeStudentData(studentSnap.data() as StudentData);
          } else {
            studentData = {
              id: currentUser.uid,
              name: fetchedUserData.name || "Student",
              email: fetchedUserData.email || "",
              courses: [],
              notifications: [],
              testResponses: {},
              lecturerId: "",
              totalOwed: 0,
              totalPaid: 0,
              balance: 0,
              enrollmentDate: new Date().toISOString(),
              status: "active",
            };
            await setDoc(studentDocRef, studentData);
          }
          setStudentData(studentData);
        }

        // Fetch courses
        const coursesSnapshot = await getDocs(collection(db, "courses"));
        const coursesList: Course[] = [];
        
        for (const courseDoc of coursesSnapshot.docs) {
          const courseData = courseDoc.data();
          
          // Fetch resources
          const resourcesSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "resources")
          );
          const resources = resourcesSnapshot.docs.map((doc) =>
            sanitizeResource({ id: doc.id, ...doc.data() } as Resource)
          );
          
          // Fetch tests
          const testsSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "tests")
          );
          const tests: Test[] = [];
          
          for (const testDoc of testsSnapshot.docs) {
            const testData = sanitizeTest(testDoc.data() as Test);
            
            if (userRole === "student") {
              const responseSnap = await getDoc(
                doc(db, "courses", courseDoc.id, "tests", testDoc.id, "responses", currentUser.uid)
              );
              if (responseSnap.exists()) {
                const response = responseSnap.data() as TestResponse;
                setTestResponses((prev) => ({ ...prev, [testDoc.id]: response }));
              }
            }
            
            tests.push({ ...testData, id: testDoc.id });
          }
          
          coursesList.push(
            sanitizeCourse({
              id: courseDoc.id,
              name: courseData.name || "Unnamed Course",
              description: courseData.description || "No description",
              resources,
              tests,
              teacherId: courseData.teacherId || "",
            })
          );
        }
        
        setAllCourses(coursesList);
      } catch (err) {
        console.error("Error loading dashboard:", err);
        setError(`Failed to load dashboard: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  const handleAddResource = async (courseId: string, name: string, url: string, type: string) => {
    if (role !== "teacher" || !courseId) return;
    
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
          c.id === courseId
            ? { ...c, resources: [...(c.resources || []), newResource] }
            : c
        )
      );
    } catch (err) {
      console.error("Error adding resource:", err);
      setError(`Failed to add resource: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleAddTest = async (courseId: string, title: string, questions: TestQuestion[]) => {
    if (role !== "teacher" || !courseId) return;
    
    try {
      const testRef = doc(collection(db, "courses", courseId, "tests"));
      const newTest: Test = {
        id: testRef.id,
        courseId,
        title,
        questions,
        createdAt: new Date().toISOString(),
      };
      
      await setDoc(testRef, newTest);
      
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, tests: [...(c.tests || []), newTest] }
            : c
        )
      );
    } catch (err) {
      console.error("Error adding test:", err);
      setError(`Failed to add test: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleSubmitTestResponse = async (
    courseId: string,
    testId: string,
    answers: string[]
  ) => {
    if (role !== "student" || !user || !courseId || !testId) return;
    
    try {
      const responseRef = doc(
        db,
        "courses",
        courseId,
        "tests",
        testId,
        "responses",
        user.uid
      );
      
      const response: TestResponse = {
        id: `${testId}-${user.uid}`,
        studentId: user.uid,
        answers,
        submittedAt: new Date().toISOString(),
        grade: null,
        score: 0,
      };
      
      await setDoc(responseRef, response);
      
      setTestResponses((prev) => ({ ...prev, [testId]: response }));
      
      if (studentData) {
        setStudentData({
          ...studentData,
          testResponses: { ...studentData.testResponses, [testId]: response },
        });
      }
    } catch (err) {
      console.error("Error submitting test:", err);
      setError(`Failed to submit test: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleGradeTest = async (
    courseId: string,
    testId: string,
    studentId: string,
    grade: number
  ) => {
    if (role !== "teacher" || !courseId || !testId || !studentId) return;
    
    if (grade < 0 || grade > 100 || isNaN(grade)) {
      setError("Grade must be between 0 and 100.");
      return;
    }
    
    try {
      const responseRef = doc(
        db,
        "courses",
        courseId,
        "tests",
        testId,
        "responses",
        studentId
      );
      
      await updateDoc(responseRef, { grade });
      
      setTestResponses((prev) =>
        prev[testId] && prev[testId].studentId === studentId
          ? { ...prev, [testId]: { ...prev[testId], grade } }
          : prev
      );
    } catch (err) {
      console.error("Error grading test:", err);
      setError(`Failed to grade test: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    if (!user || role !== "student" || !studentData) return;
    
    try {
      await markNotificationAsRead(user.uid, notificationId);
      
      setStudentData((prev) =>
        prev
          ? {
              ...prev,
              notifications: prev.notifications.map((n) =>
                n.id === notificationId ? { ...n, read: true } : n
              ),
            }
          : null
      );
    } catch (err) {
      console.error("Error marking notification as read:", err);
      setError(
        `Failed to mark notification as read: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-800 text-xl">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded max-w-md">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!userData || !role) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded max-w-md">
          <p>User data not found. Please try logging in again.</p>
          <button
            onClick={() => router.push("/auth/login")}
            className="mt-2 px-3 py-1 bg-red-800 text-white rounded hover:bg-red-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-gray-100">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-md p-4">
          <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
          <ul className="space-y-2">
            <li>
              <Link
                href="/dashboard"
                className="block p-2 text-red-800 hover:bg-red-50 rounded"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/profile"
                className="block p-2 text-red-800 hover:bg-red-50 rounded"
              >
                Profile
              </Link>
            </li>
            <li>
              <button
                onClick={() => auth.signOut()}
                className="w-full text-left p-2 text-red-800 hover:bg-red-50 rounded"
              >
                Logout
              </button>
            </li>
          </ul>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
              {greeting}, {username}!
            </h1>

            {/* Student Dashboard */}
            {role === "student" && studentData && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-red-800">Your Courses</h2>
                {allCourses
                  .filter((course) =>
                    studentData.courses?.some((c) => c.id === course.id)
                  )
                  .map((course) => (
                    <div
                      key={course.id}
                      className="p-4 bg-white rounded shadow"
                    >
                      <h3 className="text-lg font-medium text-red-800">
                        {course.name}
                      </h3>
                      <p className="text-gray-600">{course.description}</p>
                      
                      {/* Resources Section */}
                      <div className="mt-4">
                        <h4 className="text-red-800 font-medium">Resources</h4>
                        {course.resources?.length ? (
                          <ul className="list-disc pl-5 space-y-1">
                            {course.resources.map((resource) => (
                              <li key={resource.id}>
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
                          <p className="text-gray-600">No resources available.</p>
                        )}
                      </div>
                      
                      {/* Tests Section */}
                      <div className="mt-4">
                        <h4 className="text-red-800 font-medium">Tests</h4>
                        {course.tests?.length ? (
                          <ul className="space-y-4">
                            {course.tests.map((test) => (
                              <li key={test.id} className="p-3 bg-gray-50 rounded">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-red-800 font-medium">
                                      {test.title}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      {test.questions.length} questions
                                    </p>
                                  </div>
                                  {testResponses[test.id] ? (
                                    <span
                                      className={`px-2 py-1 rounded text-sm ${
                                        testResponses[test.id].grade !== null
                                          ? "bg-green-100 text-green-800"
                                          : "bg-blue-100 text-blue-800"
                                      }`}
                                    >
                                      {testResponses[test.id].grade !== null
                                        ? `Grade: ${testResponses[test.id].grade}%`
                                        : "Submitted"}
                                    </span>
                                  ) : null}
                                </div>
                                {!testResponses[test.id] ? (
                                  <TestSubmissionForm
                                    courseId={course.id}
                                    test={test}
                                    onSubmit={handleSubmitTestResponse}
                                  />
                                ) : (
                                  <div className="mt-2 text-sm">
                                    <p>
                                      Submitted on:{" "}
                                      {new Date(
                                        testResponses[test.id].submittedAt ? new Date(testResponses[test.id].submittedAt as string) : new Date()
                                      ).toLocaleString()}
                                    </p>
                                    {testResponses[test.id].grade !== null && (
                                      <p>
                                        Grade: {testResponses[test.id].grade}%
                                      </p>
                                    )}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-600">No tests available.</p>
                        )}
                      </div>
                    </div>
                  ))}
                
                {/* Payment Section */}
                {user && (
                  <div className="p-4 bg-white rounded shadow">
                    <h3 className="text-lg font-medium text-red-800 mb-2">
                      Payment
                    </h3>
                    <CheckoutPage
                      studentId={user.uid}
                      onPaymentSuccess={async (amount: number) => {
                        console.log(`Payment of ${amount} was successful.`);
                        // Update student balance or payment status
                      }}
                    />
                  </div>
                )}
                
                {/* Notifications Section */}
                {studentData.notifications?.length > 0 && (
                  <div className="p-4 bg-white rounded shadow">
                    <NotificationList
                      notifications={studentData.notifications}
                      onMarkAsRead={handleMarkNotificationAsRead}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Teacher Dashboard */}
            {role === "teacher" && user && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-red-800">Your Courses</h2>
                {allCourses
                  .filter((course) => course.teacherId === user.uid)
                  .map((course) => (
                    <div
                      key={course.id}
                      className="p-4 bg-white rounded shadow"
                    >
                      <h3 className="text-lg font-medium text-red-800">
                        {course.name}
                      </h3>
                      <p className="text-gray-600">{course.description}</p>
                      
                      {/* Add Resource Form */}
                      <div className="mt-4">
                        <h4 className="text-red-800 font-medium">
                          Add New Resource
                        </h4>
                        <ResourceForm
                          courseId={course.id}
                          onAddResource={handleAddResource}
                        />
                      </div>
                      
                      {/* Add Test Form */}
                      <div className="mt-4">
                        <h4 className="text-red-800 font-medium">Create New Test</h4>
                        <TestForm
                          courseId={course.id}
                          onAddTest={handleAddTest}
                        />
                      </div>
                      
                      {/* Existing Tests */}
                      {course.tests?.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-red-800 font-medium">
                            Grade Tests
                          </h4>
                          <div className="space-y-4">
                            {course.tests.map((test) => (
                              <div
                                key={test.id}
                                className="p-3 bg-gray-50 rounded"
                              >
                                <p className="text-red-800 font-medium">
                                  {test.title}
                                </p>
                                <div className="mt-2 space-y-3">
                                  {test.questions.map((q, i) => (
                                    <p key={i} className="text-sm text-gray-600">
                                      Q{i + 1}: {q.question}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Admin Dashboard */}
            {role === "admin" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-red-800">Admin Panel</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allCourses.map((course) => (
                    <div
                      key={course.id}
                      className="p-4 bg-white rounded shadow"
                    >
                      <h3 className="text-lg font-medium text-red-800">
                        {course.name}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {course.description}
                      </p>
                      <div className="mt-2 text-sm">
                        <p>
                          <span className="font-medium">Teacher ID:</span>{" "}
                          {course.teacherId || "Not assigned"}
                        </p>
                        <p>
                          <span className="font-medium">Resources:</span>{" "}
                          {course.resources?.length || 0}
                        </p>
                        <p>
                          <span className="font-medium">Tests:</span>{" "}
                          {course.tests?.length || 0}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}