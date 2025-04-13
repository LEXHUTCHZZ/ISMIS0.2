"use client";

import { useEffect, useState, useMemo } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import {
  User,
  StudentData,
  Course,
  Resource,
  Test,
  TestResponse,
  Subject,
  Notification,
  TestCreation,
  Coursework,
  Submission,
} from "../../models";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

// Define Role type
type Role = "student" | "teacher" | "admin" | "accountsadmin";

// Utility to validate URLs
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Centralized role-based permissions
const hasPermission = (role: Role, allowedRoles: Role[]): boolean => allowedRoles.includes(role);

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allLecturers, setAllLecturers] = useState<User[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [newResource, setNewResource] = useState<Resource>({
    id: "",
    name: "",
    type: "",
    url: "",
    uploadDate: "",
    courseId: "",
  });
  const [newTest, setNewTest] = useState<TestCreation>({
    id: "",
    courseId: "",
    title: "",
    questions: [{ question: "", options: [""], correctAnswer: "" }],
    createdAt: "",
  });
  const [newCoursework, setNewCoursework] = useState<Coursework>({
    id: "",
    title: "",
    description: "",
    dueDate: "",
    weight: 0,
    type: "activity",
  });
  const [submissions, setSubmissions] = useState<{ [courseworkId: string]: Submission }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  // Controlled inputs for adding students and courses
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentLecturer, setNewStudentLecturer] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseFee, setNewCourseFee] = useState("");

  // Memoized greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Night";
  }, []);

  // Fetch data with proper cleanup
  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setLoading(true);
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser: FirebaseUser | null) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      try {
        const userDoc = doc(db, "users", currentUser.uid);
        const unsubscribeUser = onSnapshot(userDoc, async (snap) => {
          if (!snap.exists()) {
            setError("User not found");
            setLoading(false);
            return;
          }

          const data = snap.data() as User;
          setUserData(data);
          setRole(data.role as Role);
          setUsername(data.name || "Unnamed");
          setGreeting(greetingText);

          // Fetch student data for student/teacher roles
          let unsubscribeStudent: (() => void) | undefined;
          if (hasPermission(data.role as Role, ["student", "teacher"])) {
            const studentDoc = doc(db, "students", currentUser.uid);
            unsubscribeStudent = onSnapshot(studentDoc, (snap) => {
              if (snap.exists()) {
                const student = snap.data() as StudentData;
                setStudentData({
                  ...student,
                  transactions: student.transactions || [],
                  notifications: student.notifications || [],
                });
              } else {
                setStudentData(null);
              }
              setLoading(false);
            });
          }

          // Fetch additional data for teacher/admin/accountsadmin
          if (hasPermission(data.role as Role, ["teacher", "admin", "accountsadmin"])) {
            // Fetch students
            const studentsSnap = await getDocs(collection(db, "students"));
            const students = studentsSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              transactions: d.data().transactions || [],
              notifications: d.data().notifications || [],
            })) as StudentData[];
            setAllStudents(students);

            // Set default selected student for teacher
            if (data.role === "teacher" && students.length) {
              setSelectedStudentId(students[0].id);
              if (students[0].courses?.length) {
                setSelectedCourseName(students[0].courses[0].name);
              }
            }

            // Fetch lecturers
            const lecturersSnap = await getDocs(collection(db, "users"));
            const lecturers = lecturersSnap.docs
              .map((d) => ({ id: d.id, ...d.data() } as User))
              .filter((u) => u.role === "teacher");
            setAllLecturers(lecturers);

            // Fetch courses
            const coursesSnap = await getDocs(collection(db, "courses"));
            const courses = await Promise.all(
              coursesSnap.docs.map(async (d) => {
                const course = d.data() as Omit<Course, "id" | "resources" | "tests" | "coursework">;
                const resourcesSnap = await getDocs(collection(db, "courses", d.id, "resources"));
                const resources = resourcesSnap.docs.map((r) => ({
                  id: r.id,
                  ...r.data(),
                })) as Resource[];

                const testsSnap = await getDocs(collection(db, "courses", d.id, "tests"));
                const tests = await Promise.all(
                  testsSnap.docs.map(async (t) => {
                    const test = { id: t.id, ...t.data() } as Test;
                    if (data.role === "student" && currentUser) {
                      const resp = await getDoc(
                        doc(db, "courses", d.id, "tests", t.id, "responses", currentUser.uid)
                      );
                      if (resp.exists()) {
                        setTestResponses((prev) => ({
                          ...prev,
                          [t.id]: resp.data() as TestResponse,
                        }));
                      }
                    }
                    return test;
                  })
                );

                const courseworkSnap = await getDocs(collection(db, "courses", d.id, "coursework"));
                const coursework = await Promise.all(
                  courseworkSnap.docs.map(async (c) => {
                    const cw = { id: c.id, ...c.data() } as Coursework;
                    if (data.role === "student" && currentUser) {
                      const sub = await getDoc(
                        doc(db, "courses", d.id, "coursework", c.id, "submissions", currentUser.uid)
                      );
                      if (sub.exists()) {
                        setSubmissions((prev) => ({
                          ...prev,
                          [c.id]: sub.data() as Submission,
                        }));
                      }
                    }
                    return cw;
                  })
                );

                return {
                  id: d.id,
                  ...course,
                  resources,
                  tests,
                  coursework,
                } as Course;
              })
            );
            setAllCourses(courses);
            setLoading(false);
          }

          // Cleanup user listener and conditionally student listener
          return () => {
            unsubscribeUser();
            if (unsubscribeStudent) unsubscribeStudent();
          };
        });
      } catch (e) {
        setError("Failed to load data: " + (e instanceof Error ? e.message : "Unknown error"));
        setLoading(false);
      }
    });

    // Cleanup auth listener
    return () => unsubscribeAuth();
  }, [user, router, greetingText, setUserData, setRole, setUsername, setGreeting, setStudentData, setAllStudents, setAllLecturers, setAllCourses, setTestResponses, setSubmissions, setLoading, setError]);

  const calculateCourseAverage = (subjects: Subject[] = []): string => {
    const grades = subjects
      .map((s) => parseFloat(s.grades?.final || "0"))
      .filter((g) => !isNaN(g));
    return grades.length
      ? (grades.reduce((sum, g) => sum + g, 0) / grades.length).toFixed(2)
      : "N/A";
  };

  const handleGradeUpdate = (
    studentId: string,
    courseName: string,
    subjectName: string,
    field: string,
    value: string
  ) => {
    if (role && !hasPermission(role, ["teacher", "admin"])) return;
    if (field !== "comments" && (isNaN(parseFloat(value)) || parseFloat(value) < 0 || parseFloat(value) > 100)) {
      alert("Please enter a valid grade between 0 and 100");
      return;
    }
    setAllStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const courses = s.courses.map((c) => {
          if (c.name !== courseName) return c;
          const subjects = c.subjects.map((sub) => {
            if (sub.name !== subjectName) return sub;
            if (field === "comments") return { ...sub, comments: value };
            const grades = { ...sub.grades, [field]: value };
            const classwork = Object.keys(grades)
              .filter((k) => k.startsWith("C"))
              .map((k) => parseFloat(grades[k] || "0"))
              .filter((v) => !isNaN(v));
            const exam = parseFloat(grades.exam || "0");
            if (classwork.length && !isNaN(exam)) {
              grades.final = (classwork.reduce((sum, v) => sum + v, 0) / classwork.length * 0.4 + exam * 0.6).toFixed(2);
            }
            return { ...sub, grades };
          });
          return { ...c, subjects };
        });
        return { ...s, courses };
      })
    );
  };

  const handleUpdateStudent = async (studentId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) {
      alert("Student not found");
      return;
    }
    try {
      await updateDoc(doc(db, "students", studentId), { courses: student.courses });
      alert("Grades updated successfully");
    } catch (e) {
      alert("Failed to update grades: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!role || !hasPermission(role, ["admin", "accountsadmin"])) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
      );
      alert("Clearance granted successfully");
    } catch (e) {
      alert("Failed to grant clearance: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!role || !hasPermission(role, ["admin", "accountsadmin"])) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
      );
      alert("Clearance removed successfully");
    } catch (e) {
      alert("Failed to remove clearance: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || studentData.courses?.some((c) => c.name === course.name)) {
      alert("Already enrolled");
      return;
    }
    const newCourse = {
      name: course.name,
      fee: course.fee,
      subjects: (course.subjects || []).map((s) => ({
        name: s.name,
        grades: { C1: "", C2: "", exam: "", final: "" },
        comments: "",
      })),
    };
    try {
      await updateDoc(doc(db, "students", user!.uid), {
        courses: [...(studentData.courses || []), newCourse],
      });
      setStudentData((prev) =>
        prev && {
          ...prev,
          courses: [
            ...(prev.courses || []),
            {
              ...newCourse,
              id: "", // Provide a valid ID
              resources: [], // Initialize resources
              tests: [], // Initialize tests
              coursework: [], // Initialize coursework
            },
          ],
        }
      );
      alert("Enrolled successfully");
    } catch (e) {
      alert("Failed to enroll: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleAddSubject = async (studentId: string, courseName: string, subjectName: string) => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) return;
    if (!subjectName.trim()) {
      alert("Subject name cannot be empty");
      return;
    }
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) {
      alert("Student not found");
      return;
    }
    const courses = student.courses.map((c) =>
      c.name === courseName
        ? {
            ...c,
            subjects: [
              ...(c.subjects || []),
              { name: subjectName, grades: { C1: "", C2: "", exam: "", final: "" }, comments: "" },
            ],
          }
        : c
    );
    try {
      await updateDoc(doc(db, "students", studentId), { courses });
      setAllStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, courses } : s)));
      alert("Subject added successfully");
    } catch (e) {
      alert("Failed to add subject: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleAddCourse = async () => {
    if (role && !hasPermission(role, ["admin"])) {
      alert("Permission denied");
      return;
    }
    if (!newCourseName.trim() || isNaN(parseFloat(newCourseFee))) {
      alert("Please provide a valid course name and fee");
      return;
    }
    try {
      const ref = doc(collection(db, "courses"));
      const course: Omit<Course, "resources" | "tests" | "coursework"> = {
        id: ref.id,
        name: newCourseName,
        fee: parseFloat(newCourseFee),
        subjects: [],
      };
      await setDoc(ref, course);
      setAllCourses((prev) => [
        ...prev,
        { ...course, resources: [], tests: [], coursework: [] },
      ]);
      setNewCourseName("");
      setNewCourseFee("");
      alert("Course added successfully");
    } catch (e) {
      alert("Failed to add course: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleAddStudent = async () => {
    if (role && hasPermission(role, ["admin"])) {
      alert("Permission denied");
      return;
    }
    if (!newStudentName.trim() || !newStudentEmail.trim()) {
      alert("Please provide a valid name and email");
      return;
    }
    try {
      const ref = doc(collection(db, "students"));
      const student: StudentData = {
        id: ref.id,
        name: newStudentName,
        email: newStudentEmail,
        lecturerId: newStudentLecturer || null,
        courses: [],
        totalOwed: 0,
        totalPaid: 0,
        balance: 0,
        paymentStatus: "Unpaid",
        clearance: false,
        transactions: [],
        notifications: [],
      };
      await setDoc(ref, student);
      setAllStudents((prev) => [...prev, student]);
      setNewStudentName("");
      setNewStudentEmail("");
      setNewStudentLecturer("");
      alert("Student added successfully");
    } catch (e) {
      alert("Failed to add student: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleSendNotification = async (studentId: string, message: string) => {
    if (role && !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (!message.trim()) {
      alert("Message cannot be empty");
      return;
    }
    try {
      const ref = collection(db, "students", studentId, "notifications");
      const notif: Notification = {
        id: "",
        message,
        date: new Date().toISOString(),
        read: false,
      };
      const docRef = await addDoc(ref, notif);
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                notifications: [...(s.notifications || []), { ...notif, id: docRef.id }],
              }
            : s
        )
      );
      alert("Notification sent successfully");
    } catch (e) {
      alert("Failed to send notification: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user) return;
    setTestResponses((prev) => ({
      ...prev,
      [testId]: {
        id: user.uid,
        answers: { ...(prev[testId]?.answers || {}), [questionIndex]: answer },
        submittedAt: prev[testId]?.submittedAt || null,
        score: prev[testId]?.score || 0,
      },
    }));
  };

  const handleSubmitTest = async (courseId: string, testId: string) => {
    if (!user || !testResponses[testId]) {
      alert("No answers provided");
      return;
    }
    try {
      const testDoc = await getDoc(doc(db, "courses", courseId, "tests", testId));
      if (!testDoc.exists()) {
        alert("Test not found");
        return;
      }
      const test = testDoc.data() as Test;
      const score = test.questions.reduce(
        (sum, q, i) =>
          sum + (testResponses[testId].answers[i] === q.correctAnswer ? 1 : 0),
        0
      );
      const response: TestResponse = {
        id: user.uid,
        answers: testResponses[testId].answers,
        score: (score / test.questions.length) * 100,
        submittedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "courses", courseId, "tests", testId, "responses", user.uid), response);
      setTestResponses((prev) => ({ ...prev, [testId]: response }));
      alert(`Testsubmitted! Score: ${response.score.toFixed(2)}%`);
    } catch (e) {
      alert("Failed to submit test: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleUploadResource = async () => {
    if (role && !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (!selectedCourseName || !newResource.name || !newResource.type || !newResource.url) {
      alert("Please select a course and fill all resource fields");
      return;
    }
    if (!isValidUrl(newResource.url)) {
      alert("Invalid URL");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "resources"));
      const resource: Resource = {
        id: ref.id,
        name: newResource.name,
        type: newResource.type,
        url: newResource.url,
        uploadDate: new Date().toISOString(),
        courseId: course.id,
      };
      await setDoc(ref, resource);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id
            ? { ...c, resources: [...(c.resources || []), resource] }
            : c
        )
      );
      setNewResource({ id: "", name: "", type: "", url: "", uploadDate: "", courseId: "" });
      alert("Resource uploaded successfully");
    } catch (e) {
      alert("Failed to upload resource: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleCreateTest = async () => {
    if (role && !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (
      !selectedCourseName ||
      !newTest.title ||
      newTest.questions.some(
        (q) => !q.question || !q.correctAnswer || (q.options.length > 1 && q.options.some((o) => !o))
      )
    ) {
      alert("Please select a course and fill all test fields correctly");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "tests"));
      const test: Test = {
        id: ref.id,
        title: newTest.title,
        questions: newTest.questions,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, test);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id ? { ...c, tests: [...(c.tests || []), test] } : c
        )
      );
      setNewTest({
        id: "",
        courseId: "",
        title: "",
        questions: [{ question: "", options: [""], correctAnswer: "" }],
        createdAt: "",
      });
      alert("Test created successfully");
    } catch (e) {
      alert("Failed to create test: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleUploadCoursework = async () => {
    if (!role || !hasPermission(role, ["teacher", "admin"])) {
      alert("Permission denied");
      return;
    }
    if (
      !selectedCourseName ||
      !newCoursework.title ||
      !newCoursework.description ||
      !newCoursework.dueDate ||
      isNaN(newCoursework.weight) ||
      newCoursework.weight <= 0
    ) {
      alert("Please select a course and fill all coursework fields correctly");
      return;
    }
    try {
      const course = allCourses.find((c) => c.name === selectedCourseName);
      if (!course) {
        alert("Course not found");
        return;
      }
      const ref = doc(collection(db, "courses", course.id, "coursework"));
      const coursework: Coursework = {
        ...newCoursework,
        id: ref.id,
        type: "activity",
      };
      await setDoc(ref, coursework);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === course.id
            ? { ...c, coursework: [...(c.coursework || []), coursework] }
            : c
        )
      );
      setNewCoursework({ id: "", title: "", description: "", dueDate: "", weight: 0, type: "activity" });
      alert("Coursework uploaded successfully");
    } catch (e) {
      alert("Failed to upload coursework: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleSubmitCoursework = async (courseId: string, courseworkId: string, fileUrl: string) => {
    if (!user) {
      alert("You must be logged in to submit coursework");
      return;
    }
    if (!isValidUrl(fileUrl)) {
      alert("Invalid URL");
      return;
    }
    try {
      const submission: Submission = {
        studentId: user.uid,
        fileUrl,
        submittedAt: new Date().toISOString(),
      };
      await setDoc(
        doc(db, "courses", courseId, "coursework", courseworkId, "submissions", user.uid),
        submission
      );
      setSubmissions((prev) => ({ ...prev, [courseworkId]: submission }));
      alert("Submission uploaded successfully");
    } catch (e) {
      alert("Failed to upload submission: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const downloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.text("Financial Report", 20, 20);
    autoTable(doc, {
      head: [["Name", "Owed", "Paid", "Balance", "Status"]],
      body: allStudents.map((s) => [
        s.name || "N/A",
        s.totalOwed.toLocaleString(),
        s.totalPaid.toLocaleString(),
        s.balance.toLocaleString(),
        s.paymentStatus || "N/A",
      ]),
      startY: 30,
    });
    doc.save("Financial_Report.pdf");
  };

  const filteredStudents = allStudents.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <p className="text-red-800 text-center">Loading...</p>;
  if (error) {
    return (
      <div className="text-red-800 text-center">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!userData || !role) return <p className="text-red-800 text-center">Please log in</p>;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow p-6">
        <h3 className="text-xl font-semibold text-red-800 mb-6">SMIS Menu</h3>
        <ul className="space-y-4">
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
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between mb-8">
            <div className="flex items-center space-x-6">
              <img
                src={
                  userData.profilePicture ||
                  "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                }
                alt="Profile"
                className="w-14 h-14 rounded-full object-cover"
                onError={(e) =>
                  (e.currentTarget.src =
                    "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg")
                }
              />
              <div>
                <h2 className="text-3xl font-bold text-red-800">
                  {greeting}, {username}
                </h2>
                <p className="text-red-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {role === "admin" && (
            <div className="mb-8 bg-white p-6 rounded shadow">
              <h3 className="text-xl font-semibold text-red-800 mb-4">Search Students</h3>
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-3 border rounded text-red-800"
              />
              {searchQuery && (
                <div className="mt-4">
                  {filteredStudents.length ? (
                    filteredStudents.map((s) => (
                      <div key={s.id} className="flex items-center space-x-6 p-3 border-b">
                        <img
                          src={
                            s.profilePicture ||
                            "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                          }
                          alt={s.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-red-800 font-medium">{s.name}</p>
                          <p className="text-red-800 text-sm">Email: {s.email}</p>
                          <p className="text-red-800 text-sm">ID: {s.idNumber || "N/A"}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-red-800">No students found</p>
                  )}
                </div>
              )}
            </div>
          )}

          {role === "student" && (
            <div className="space-y-8">
              {!studentData ? (
                <p className="text-red-800 text-center bg-white p-6 rounded shadow">
                  No profile found. Contact support.
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-8">
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Notifications</h3>
                      {studentData.notifications.length ? (
                        studentData.notifications.map((n) => (
                          <div key={n.id || n.date} className="flex justify-between mb-4">
                            <p className={`text-red-800 ${n.read ? "opacity-50" : "font-bold"}`}>
                              {new Date(n.date).toLocaleString()}: {n.message}
                            </p>
                            {!n.read && n.id && (
                              <button
                                onClick={() =>
                                  user && markNotificationAsRead(user.uid, n.id).then(() =>
                                    setStudentData((prev) =>
                                      prev && {
                                        ...prev,
                                        notifications: prev.notifications.map((x) =>
                                          x.id === n.id ? { ...x, read: true } : x
                                        ),
                                      }
                                    )
                                  ).catch(e => alert("Failed to mark as read: " + (e instanceof Error ? e.message : "Unknown error")))
                                }
                                className="text-red-800 hover:underline"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No notifications</p>
                      )}
                    </div>
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Grades</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => (
                          <div key={c.name} className="mb-6">
                            <p className="text-red-800 font-medium">
                              {c.name} (Fee: {c.fee.toLocaleString()} JMD)
                            </p>
                            <table className="w-full mt-3 border-collapse">
                              <thead>
                                <tr className="bg-red-800 text-white">
                                  <th className="p-2 border">Subject</th>
                                  <th className="p-2 border">Classwork</th>
                                  <th className="p-2 border">Exam</th>
                                  <th className="p-2 border">Final</th>
                                  <th className="p-2 border">Comments</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.subjects || []).map((s) => (
                                  <tr key={s.name}>
                                    <td className="p-2 border text-red-800">{s.name}</td>
                                    <td className="p-2 border text-red-800">
                                      {Object.keys(s.grades || {})
                                        .filter((k) => k.startsWith("C"))
                                        .map((k) => s.grades![k] || "N/A")
                                        .join(", ") || "N/A"}
                                    </td>
                                    <td className="p-2 border text-red-800">{s.grades?.exam || "N/A"}</td>
                                    <td className="p-2 border text-red-800">{s.grades?.final || "N/A"}</td>
                                    <td className="p-2 border text-red-800">{s.comments || "None"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="mt-3 text-red-800">Average: {calculateCourseAverage(c.subjects)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No courses enrolled</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Coursework</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => {
                          const course = allCourses.find((ac) => ac.name === c.name);
                          return (
                            course && (
                              <div key={c.name} className="mb-6">
                                <p className="text-red-800 font-medium mb-3">{c.name}</p>
                                {course.coursework?.length ? (
                                  course.coursework.map((cw: Coursework) => (
                                    <div
                                      key={cw.id}
                                      className="mb-4 p-4 border rounded flex items-start space-x-4"
                                    >
                                      <div className="text-pink-500 text-2xl">📄</div>
                                      <div className="flex-1">
                                        <p className="text-red-800 font-medium">
                                          {cw.title} ({cw.weight}%)
                                        </p>
                                        <p className="text-red-800 text-sm">
                                          {cw.description.includes("Please view")
                                            ? cw.description
                                            : `Due: ${new Date(cw.dueDate).toLocaleString()}`}
                                        </p>
                                        {cw.type === "activity" ? (
                                          submissions[cw.id]?.submittedAt ? (
                                            <p className="text-red-800 text-sm">
                                              Submitted:{" "}
                                              {new Date(submissions[cw.id].submittedAt).toLocaleString()}
                                            </p>
                                          ) : (
                                            <div className="mt-3">
                                              <input
                                                type="text"
                                                placeholder="Submission URL"
                                                onKeyDown={(e) =>
                                                  e.key === "Enter" &&
                                                  e.currentTarget.value &&
                                                  handleSubmitCoursework(
                                                    course.id,
                                                    cw.id,
                                                    e.currentTarget.value
                                                  ).then(() => (e.currentTarget.value = ""))
                                                }
                                                className="w-full p-3 border rounded text-red-800 mb-2"
                                              />
                                              <button
                                                onClick={() => {
                                                  const url = prompt("Enter submission URL:");
                                                  if (url) handleSubmitCoursework(course.id, cw.id, url);
                                                }}
                                                className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                                              >
                                                Upload Submission
                                              </button>
                                            </div>
                                          )
                                        ) : (
                                          <a
                                            href={cw.description.split("at: ")[1]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-red-800 underline"
                                          >
                                            View Resource
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-red-800">No coursework</p>
                                )}
                              </div>
                            )
                          );
                        })
                      ) : (
                        <p className="text-red-800">No courses enrolled</p>
                      )}
                    </div>
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Tests</h3>
                      {studentData.courses?.length ? (
                        studentData.courses.map((c) => {
                          const course = allCourses.find((ac) => ac.name === c.name);
                          return (
                            course && (
                              <div key={c.name} className="mb-6">
                                <p className="text-red-800 font-medium mb-3">{c.name}</p>
                                {course.tests?.length ? (
                                  course.tests.map((t) => (
                                    <div key={t.id} className="mt-3">
                                      <p className="text-red-800 font-medium">{t.title}</p>
                                      {testResponses[t.id]?.submittedAt ? (
                                        <p className="text-red-800">
                                          Submitted:{" "}
                                          {new Date(testResponses[t.id].submittedAt!).toLocaleString()} (Score:{" "}
                                          {testResponses[t.id].score?.toFixed(2)}%)
                                        </p>
                                      ) : (
                                        <>
                                          {t.questions.map((q, i) => (
                                            <div key={i} className="mt-3">
                                              <p className="text-red-800">
                                                {i + 1}. {q.question}
                                              </p>
                                              {q.options?.length > 1 ? (
                                                q.options.map((o, j) => (
                                                  <label key={j} className="block text-red-800">
                                                    <input
                                                      type="radio"
                                                      name={`${t.id}-${i}`}
                                                      value={o}
                                                      checked={
                                                        testResponses[t.id]?.answers?.[i] === o
                                                      }
                                                      onChange={(e) =>
                                                        handleTestAnswerChange(t.id, i, e.target.value)
                                                      }
                                                      className="mr-2"
                                                    />
                                                    {o}
                                                  </label>
                                                ))
                                              ) : (
                                                <input
                                                  type="text"
                                                  value={testResponses[t.id]?.answers?.[i] || ""}
                                                  onChange={(e) =>
                                                    handleTestAnswerChange(t.id, i, e.target.value)
                                                  }
                                                  className="w-full p-3 border rounded text-red-800"
                                                  placeholder="Answer"
                                                />
                                              )}
                                            </div>
                                          ))}
                                          <button
                                            onClick={() => handleSubmitTest(course.id, t.id)}
                                            className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                                            disabled={
                                              !testResponses[t.id]?.answers ||
                                              Object.keys(testResponses[t.id].answers).length !==
                                                t.questions.length
                                            }
                                          >
                                            Submit
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-red-800">No tests</p>
                                )}
                              </div>
                            )
                          );
                        })
                      ) : (
                        <p className="text-red-800">No courses enrolled</p>
                      )}
                    </div>
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Payments</h3>
                      <p className="text-red-800">Balance: {studentData.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {studentData.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                      <div className="mt-3">
                        <p className="text-red-800 font-medium">Transactions:</p>
                        {studentData.transactions.length ? (
                          studentData.transactions.map((t) => (
                            <p key={t.id || t.date} className="text-red-800">
                              {new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD -{" "}
                              {t.status}
                            </p>
                          ))
                        ) : (
                          <p className="text-red-800">No transactions</p>
                        )}
                      </div>
                      <CheckoutPage onPaymentSuccess={() => window.location.reload()} />
                    </div>
                    <div className="bg-white p-6 rounded shadow">
                      <h3 className="text-xl font-semibold text-red-800 mb-4">Enroll Courses</h3>
                      {allCourses.length ? (
                        allCourses.map((c) => (
                          <div key={c.id} className="mb-4 flex justify-between">
                            <p className="text-red-800">
                              {c.name} (Fee: {c.fee.toLocaleString()} JMD)
                            </p>
                            <button
                              onClick={() => handleEnrollCourse(c)}
                              className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                              disabled={studentData.courses?.some((x) => x.name === c.name)}
                            >
                              {studentData.courses?.some((x) => x.name === c.name) ? "Enrolled" : "Enroll"}
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No courses available</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {role === "teacher" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Upload Resources</h3>
                    <select
                      value={selectedCourseName || ""}
                      onChange={(e) => setSelectedCourseName(e.target.value || null)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Select Course</option>
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newResource.type}
                      onChange={(e) => setNewResource({ ...newResource, type: e.target.value })}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Type</option>
                      <option value="YouTube Video">YouTube Video</option>
                      <option value="PDF">PDF</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newResource.name}
                      onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={newResource.url}
                      onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <button
                      onClick={handleUploadResource}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Upload
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Upload Coursework</h3>
                    <select
                      value={selectedCourseName || ""}
                      onChange={(e) => setSelectedCourseName(e.target.value || null)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Select Course</option>
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newCoursework.title}
                      onChange={(e) => setNewCoursework({ ...newCoursework, title: e.target.value })}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={newCoursework.description}
                      onChange={(e) =>
                        setNewCoursework({ ...newCoursework, description: e.target.value })
                      }
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="datetime-local"
                      value={newCoursework.dueDate}
                      onChange={(e) =>
                        setNewCoursework({ ...newCoursework, dueDate: e.target.value })
                      }
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="number"
                      placeholder="Weight (%)"
                      value={newCoursework.weight || ""}
                      onChange={(e) =>
                        setNewCoursework({
                          ...newCoursework,
                          weight: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full p-3 border rounded text-red-800 mb-4"
                      min="0"
                      max="100"
                    />
                    <button
                      onClick={handleUploadCoursework}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Upload
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Notifications</h3>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => setSelectedStudentId(e.target.value || null)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Student</option>
                      {allStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <input
                        type="text"
                        placeholder="Message"
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          e.currentTarget.value &&
                          handleSendNotification(selectedStudentId, e.currentTarget.value).then(
                            () => (e.currentTarget.value = "")
                          )
                        }
                        className="w-full p-3 border rounded text-red-800"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Create Tests</h3>
                    <select
                      value={selectedCourseName || ""}
                      onChange={(e) => setSelectedCourseName(e.target.value || null)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Select Course</option>
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newTest.title}
                      onChange={(e) => setNewTest({ ...newTest, title: e.target.value })}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    {newTest.questions.map((q, i) => (
                      <div key={i} className="mb-4 border p-4 rounded">
                        <input
                          type="text"
                          placeholder={`Question ${i + 1}`}
                          value={q.question}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, j) =>
                                i === j ? { ...x, question: e.target.value } : x
                              ),
                            })
                          }
                          className="w-full p-2 border rounded text-red-800 mb-2"
                        />
                        {q.options.map((o, j) => (
                          <div key={j} className="flex mb-2">
                            <input
                              type="text"
                              placeholder={`Option ${j + 1}`}
                              value={o}
                              onChange={(e) =>
                                setNewTest({
                                  ...newTest,
                                  questions: newTest.questions.map((x, k) =>
                                    i === k
                                      ? {
                                          ...x,
                                          options: x.options.map((y, l) =>
                                            j === l ? e.target.value : y
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="w-full p-2 border rounded text-red-800 mr-2"
                            />
                            <button
                              onClick={() =>
                                setNewTest({
                                  ...newTest,
                                  questions: newTest.questions.map((x, k) =>
                                    i === k
                                      ? { ...x, options: x.options.filter((_, l) => l !== j) }
                                      : x
                                  ),
                                })
                              }
                              className="px-3 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                            >
                              X
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, k) =>
                                i === k ? { ...x, options: [...x.options, ""] } : x
                              ),
                            })
                          }
                          className="px-3 py-2 bg-red-800 text-white rounded hover:bg-red-700 mb-2"
                        >
                          Add Option
                        </button>
                        <input
                          type="text"
                          placeholder="Correct Answer"
                          value={q.correctAnswer}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.map((x, j) =>
                                i === j ? { ...x, correctAnswer: e.target.value } : x
                              ),
                            })
                          }
                          className="w-full p-2 border rounded text-red-800 mb-2"
                        />
                        <button
                          onClick={() =>
                            setNewTest({
                              ...newTest,
                              questions: newTest.questions.filter((_, j) => j !== i),
                            })
                          }
                          className="px-3 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setNewTest({
                          ...newTest,
                          questions: [
                            ...newTest.questions,
                            { question: "", options: [""], correctAnswer: "" },
                          ],
                        })
                      }
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700 mr-3"
                    >
                      Add Question
                    </button>
                    <button
                      onClick={handleCreateTest}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Create
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Manage Grades</h3>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value || null);
                        const student = allStudents.find((s) => s.id === e.target.value);
                        if (student?.courses?.length) {
                          setSelectedCourseName(student.courses[0].name);
                        } else {
                          setSelectedCourseName(null);
                        }
                      }}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">Student</option>
                      {allStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <select
                        value={selectedCourseName || ""}
                        onChange={(e) => setSelectedCourseName(e.target.value || null)}
                        className="w-full p-3 border rounded text-red-800 mb-4"
                      >
                        <option value="">Course</option>
                        {allStudents
                          .find((s) => s.id === selectedStudentId)
                          ?.courses?.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                    {selectedStudentId &&
                      selectedCourseName &&
                      allStudents
                        .filter((s) => s.id === selectedStudentId)
                        .map((s) => (
                          <div key={s.id} className="space-y-4">
                            <p className="text-lg font-medium text-red-800">{s.name}</p>
                            <p className="text-red-800">Email: {s.email || "N/A"}</p>
                            {s.courses
                              ?.filter((c) => c.name === selectedCourseName)
                              .map((c) => (
                                <div key={c.name} className="mb-6">
                                  <p className="text-red-800 font-medium">{c.name}</p>
                                  <table className="w-full mt-3 border-collapse">
                                    <thead>
                                      <tr className="bg-red-800 text-white">
                                        <th className="p-2 border">Subject</th>
                                        <th className="p-2 border">C1</th>
                                        <th className="p-2 border">C2</th>
                                        <th className="p-2 border">Exam</th>
                                        <th className="p-2 border">Final</th>
                                        <th className="p-2 border">Comments</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(c.subjects || []).map((sub) => (
                                        <tr key={sub.name}>
                                          <td className="p-2 border text-red-800">{sub.name}</td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.C1 || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "C1",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-red-800"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.C2 || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "C2",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-red-800"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="number"
                                              value={sub.grades?.exam || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "exam",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-red-800"
                                              min="0"
                                              max="100"
                                            />
                                          </td>
                                          <td className="p-2 border text-red-800">
                                            {sub.grades?.final || "N/A"}
                                          </td>
                                          <td className="p-2 border">
                                            <input
                                              type="text"
                                              value={sub.comments || ""}
                                              onChange={(e) =>
                                                handleGradeUpdate(
                                                  s.id,
                                                  c.name,
                                                  sub.name,
                                                  "comments",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full p-2 border rounded text-red-800"
                                            />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <input
                                    type="text"
                                    placeholder="Add subject"
                                    onKeyDown={(e) =>
                                      e.key === "Enter" &&
                                      e.currentTarget.value &&
                                      handleAddSubject(s.id, c.name, e.currentTarget.value).then(
                                        () => (e.currentTarget.value = "")
                                      )
                                    }
                                    className="w-full p-2 border rounded text-red-800 mt-3"
                                  />
                                  <button
                                    onClick={() => handleUpdateStudent(s.id)}
                                    className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                                  >
                                    Save
                                  </button>
                                </div>
                              ))}
                            <p className="text-red-800 font-medium">Transactions:</p>
                            {s.transactions?.length ? (
                              s.transactions.map((t) => (
                                <p key={t.id || t.date} className="text-red-800">
                                  {new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD -{" "}
                                  {t.status}
                                </p>
                              ))
                            ) : (
                              <p className="text-red-800">No transactions</p>
                            )}
                            <p className="text-red-800 font-medium">Notifications:</p>
                            {s.notifications?.length ? (
                              s.notifications.map((n) => (
                                <p key={n.id || n.date} className="text-red-800">
                                  {new Date(n.date).toLocaleString()}: {n.message} (
                                  {n.read ? "Read" : "Unread"})
                                </p>
                              ))
                            ) : (
                              <p className="text-red-800">No notifications</p>
                            )}
                          </div>
                        ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Analytics</h3>
                    <p className="text-red-800">Students: {allStudents.length}</p>
                    <p className="text-red-800">Courses: {allCourses.length}</p>
                    <p className="text-red-800">
                      Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()}{" "}
                      JMD
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Add Student</h3>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <select
                      value={newStudentLecturer}
                      onChange={(e) => setNewStudentLecturer(e.target.value)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    >
                      <option value="">No Lecturer</option>
                      {allLecturers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddStudent}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-xl font-semibold text-red-800 mb-4">Add Course</h3>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <input
                      type="number"
                      placeholder="Fee (JMD)"
                      value={newCourseFee}
                      onChange={(e) => setNewCourseFee(e.target.value)}
                      className="w-full p-3 border rounded text-red-800 mb-4"
                    />
                    <button
                      onClick={handleAddCourse}
                      className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="space-y-8">
                  {allStudents.length ? (
                    allStudents.map((s) => (
                      <div key={s.id} className="bg-white p-6 rounded shadow">
                        <div className="flex items-center space-x-6 mb-4">
                          <img
                            src={
                              s.profilePicture ||
                              "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                            }
                            alt={s.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <p className="text-lg font-medium text-red-800">{s.name}</p>
                        </div>
                        <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                        <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                        <div className="mt-4">
                          <label className="text-red-800 mr-2">Lecturer:</label>
                          <select
                            value={s.lecturerId || ""}
                            onChange={async (e) => {
                              try {
                                await updateDoc(doc(db, "students", s.id), { lecturerId: e.target.value || null });
                                setAllStudents(prev => prev.map(student => 
                                  student.id === s.id ? { ...student, lecturerId: e.target.value || null } : student
                                ));
                              } catch (e) {
                                alert("Failed to update lecturer: " + (e instanceof Error ? e.message : "Unknown error"));
                              }
                            }}
                            className="p-3 border rounded text-red-800"
                          >
                            <option value="">None</option>
                            {allLecturers.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {(s.courses || []).map((c) => (
                          <div key={c.name} className="mt-4">
                            <p className="text-red-800 font-medium">{c.name}</p>
                            <table className="w-full mt-3 border-collapse">
                              <thead>
                                <tr className="bg-red-800 text-white">
                                  <th className="p-2 border">Subject</th>
                                  <th className="p-2 border">C1</th>
                                  <th className="p-2 border">C2</th>
                                  <th className="p-2 border">Exam</th>
                                  <th className="p-2 border">Final</th>
                                  <th className="p-2 border">Comments</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.subjects || []).map((sub) => (
                                  <tr key={sub.name}>
                                    <td className="p-2 border text-red-800">{sub.name}</td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C1 || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "C1", e.target.value)
                                        }
                                        className="w-full p-2 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.C2 || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "C2", e.target.value)
                                        }
                                        className="w-full p-2 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border">
                                      <input
                                        type="number"
                                        value={sub.grades?.exam || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "exam", e.target.value)
                                        }
                                        className="w-full p-2 border rounded text-red-800"
                                        min="0"
                                        max="100"
                                      />
                                    </td>
                                    <td className="p-2 border text-red-800">
                                      {sub.grades?.final || "N/A"}
                                    </td>
                                    <td className="p-2 border">
                                      <input
                                        type="text"
                                        value={sub.comments || ""}
                                        onChange={(e) =>
                                          handleGradeUpdate(s.id, c.name, sub.name, "comments", e.target.value)
                                        }
                                        className="w-full p-2 border rounded text-red-800"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <input
                              type="text"
                              placeholder="Add subject"
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                e.currentTarget.value &&
                                handleAddSubject(s.id, c.name, e.currentTarget.value).then(
                                  () => (e.currentTarget.value = "")
                                )
                              }
                              className="w-full p-2 border rounded text-red-800 mt-3"
                            />
                            <button
                              onClick={() => handleUpdateStudent(s.id)}
                              className="mt-3 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                            >
                              Save
                            </button>
                          </div>
                        ))}
                        <input
                          type="text"
                          placeholder="Notification"
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            e.currentTarget.value &&
                            handleSendNotification(s.id, e.currentTarget.value).then(
                              () => (e.currentTarget.value = "")
                            )
                          }
                          className="w-full p-3 border rounded text-red-800 mt-4"
                        />
                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() => handleGrantClearance(s.id)}
                            disabled={s.clearance}
                            className={`px-4 py-2 rounded text-white ${
                              s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                            }`}
                          >
                            Grant Clearance
                          </button>
                          <button
                            onClick={() => handleRemoveClearance(s.id)}
                            disabled={!s.clearance}
                            className={`px-4 py-2 rounded text-white ${
                              !s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                            }`}
                          >
                            Remove Clearance
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-red-800 bg-white p-6 rounded shadow">No students</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {role === "accountsadmin" && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded shadow">
                <h3 className="text-xl font-semibold text-red-800 mb-4">Financial Overview</h3>
                <p className="text-red-800">Students: {allStudents.length}</p>
                <p className="text-red-800">
                  Revenue: {allStudents.reduce((sum, s) => sum + s.totalPaid, 0).toLocaleString()}{" "}
                  JMD
                </p>
                <button
                  onClick={downloadFinancialReport}
                  className="mt-4 px-4 py-2 bg-red-800 text-white rounded hover:bg-red-700"
                >
                  Download Report
                </button>
              </div>
              <div className="space-y-8">
                {allStudents.length ? (
                  allStudents.map((s) => (
                    <div key={s.id} className="bg-white p-6 rounded shadow">
                      <div className="flex items-center space-x-6 mb-4">
                        <img
                          src={
                            s.profilePicture ||
                            "https://as2.ftcdn.net/v2/jpg/05/89/93/27/1000_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg"
                          }
                          alt={s.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        <p className="text-lg font-medium text-red-800">{s.name}</p>
                      </div>
                      <p className="text-red-800">Owed: {s.totalOwed.toLocaleString()} JMD</p>
                      <p className="text-red-800">Paid: {s.totalPaid.toLocaleString()} JMD</p>
                      <p className="text-red-800">Balance: {s.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {s.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {s.clearance ? "Yes" : "No"}</p>
                      <div className="mt-4">
                        <p className="text-red-800 font-medium">Transactions:</p>
                        {s.transactions?.length ? (
                          s.transactions.map((t) => (
                            <p key={t.id || t.date} className="text-red-800">
                              {new Date(t.date).toLocaleString()}: {t.amount.toLocaleString()} JMD -{" "}
                              {t.status}
                            </p>
                          ))
                        ) : (
                          <p className="text-red-800">No transactions</p>
                        )}
                      </div>
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => handleGrantClearance(s.id)}
                          disabled={s.clearance}
                          className={`px-4 py-2 rounded text-white ${
                            s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                          }`}
                        >
                          Grant Clearance
                        </button>
                        <button
                          onClick={() => handleRemoveClearance(s.id)}
                          disabled={!s.clearance}
                          className={`px-4 py-2 rounded text-white ${
                            !s.clearance ? "bg-gray-400" : "bg-red-800 hover:bg-red-700"
                          }`}
                        >
                          Remove Clearance
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-red-800">No students</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}