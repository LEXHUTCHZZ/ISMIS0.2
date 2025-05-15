"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { v4 as uuidv4 } from 'uuid';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart, Pie, Cell, Legend } from "recharts";
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

// Interfaces
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
  courses: Course[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  grades: Record<string, number>;
}

interface Course {
  id: string;
  name: string;
  teacherId: string;
  resources: Resource[];
  assignments: Assignment[];
  tests: any[];
}

interface Transaction {
  id: string;
  amount: number;
  date: string;
  status: string;
}

interface Notification {
  id?: string;
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
  mark: number; // Percentage mark (0-100)
  letterGrade: string; // A, B, C, D, F
  creditsAttempted: number;
  creditsEarned: number; // Equal to creditsAttempted if grade is passing
  qualityPoints: number; // Quality points per credit (A=4.0, B=3.0, etc.)
  totalQualityPoints: number; // qualityPoints * creditsAttempted
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

// Sample chart data
const transactionData = [
  { date: "Jan 2025", amount: 5000 },
  { date: "Feb 2025", amount: 7000 },
  { date: "Mar 2025", amount: 4500 },
  { date: "Apr 2025", amount: 6000 },
];

const gradeData = [
  { name: "A", value: 30 },
  { name: "B", value: 25 },
  { name: "C", value: 20 },
  { name: "D", value: 15 },
  { name: "F", value: 10 },
];

const COLORS = ["#22C55E", "#A3E635", "#FACC15", "#F97316", "#E11D48"];

// Grade Utility Functions
const getLetterGrade = (mark: number): string => {
  if (mark >= 90) return "A";
  if (mark >= 80) return "B";
  if (mark >= 70) return "C";
  if (mark >= 60) return "D";
  return "F";
};

const getQualityPoints = (letterGrade: string): number => {
  switch (letterGrade) {
    case "A": return 4.0;
    case "B": return 3.0;
    case "C": return 2.0;
    case "D": return 1.0;
    case "F": return 0.0;
    default: return 0.0;
  }
};

const calculateCreditsEarned = (letterGrade: string, creditsAttempted: number): number => {
  return letterGrade === "F" ? 0 : creditsAttempted;
};

const calculateGradeDetails = (mark: number, creditsAttempted: number) => {
  const letterGrade = getLetterGrade(mark);
  const qualityPoints = getQualityPoints(letterGrade);
  const creditsEarned = calculateCreditsEarned(letterGrade, creditsAttempted);
  const totalQualityPoints = qualityPoints * creditsAttempted;
  
  return {
    letterGrade,
    qualityPoints,
    creditsEarned,
    totalQualityPoints
  };
};

// Components
const ResourceForm = ({
  courseId,
  onAddResource,
}: {
  courseId: string;
  onAddResource: (title: string, type: 'video' | 'pdf' | 'link', url: string, description: string) => void;
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
    onAddResource(title, type, url, description);
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
        className="w-full p-2 border rounded text-gray-800"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "video" | "pdf" | "link")}
        className="w-full p-2 border rounded text-gray-800"
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
        className="w-full p-2 border rounded text-gray-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-gray-800 min-h-[80px]"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Add Resource
      </button>
    </form>
  );
};

const AssignmentForm = ({
  courseId,
  onAddAssignment,
}: {
  courseId: string;
  onAddAssignment: (title: string, description: string, points: number) => void;
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
    onAddAssignment(title, description, points);
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
        className="w-full p-2 border rounded text-gray-800"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-gray-800 min-h-[80px]"
      />
      <input
        type="number"
        placeholder="Points"
        value={points}
        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
        className="w-full p-2 border rounded text-gray-800"
        min="0"
        max="1000"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Create Assignment
      </button>
    </form>
  );
};

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
          key={notif.id || notif.date}
          className="flex justify-between items-center p-2 bg-gray-50 rounded"
        >
          <div>
            <p
              className={`text-gray-800 ${
                notif.read ? "opacity-50" : "font-medium"
              }`}
            >
              {notif.message || "No message"}
            </p>
            <p className="text-sm text-gray-600">
              {new Date(notif.date).toLocaleString()}
            </p>
          </div>
          {!notif.read && notif.id && (
            <button
              onClick={() => onMarkAsRead(notif.id!)}
              className="text-blue-600 hover:underline text-sm"
            >
              Mark as Read
            </button>
          )}
        </div>
      ))
    ) : (
      <p className="text-gray-600">No notifications to display.</p>
    )}
  </div>
);

const GradeEntryForm = ({
  onAddGrade,
  studentId,
}: {
  onAddGrade: (grade: Omit<Grade, 'id' | 'updatedAt'>) => void;
  studentId: string;
}) => {
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [semester, setSemester] = useState("");
  const [mark, setMark] = useState<number | string>("");
  const [creditsAttempted, setCreditsAttempted] = useState<number | string>("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate inputs
    if (!courseCode || !courseName || !semester || mark === "" || creditsAttempted === "") {
      setError("All fields except comments are required.");
      return;
    }

    const numericMark = Number(mark);
    const numericCredits = Number(creditsAttempted);

    if (isNaN(numericMark) || numericMark < 0 || numericMark > 100) {
      setError("Mark must be a number between 0 and 100.");
      return;
    }

    if (isNaN(numericCredits) || numericCredits <= 0) {
      setError("Credits attempted must be a positive number.");
      return;
    }

    // Calculate grade details
    const { letterGrade, qualityPoints, creditsEarned, totalQualityPoints } = 
      calculateGradeDetails(numericMark, numericCredits);

    // Create the grade object
    const newGrade = {
      studentId,
      courseCode,
      courseName,
      semester,
      mark: numericMark,
      letterGrade,
      creditsAttempted: numericCredits,
      creditsEarned,
      qualityPoints,
      totalQualityPoints,
      comments: comments.trim() || undefined
    };

    // Submit the grade
    onAddGrade(newGrade);

    // Reset form
    setCourseCode("");
    setCourseName("");
    setSemester("");
    setMark("");
    setCreditsAttempted("");
    setComments("");
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Add New Grade</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="courseCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course Code</label>
            <input 
              type="text" 
              id="courseCode" 
              value={courseCode} 
              onChange={(e) => setCourseCode(e.target.value)} 
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
              placeholder="e.g., CS101"
            />
          </div>
          <div>
            <label htmlFor="courseName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course Name</label>
            <input 
              type="text" 
              id="courseName" 
              value={courseName} 
              onChange={(e) => setCourseName(e.target.value)} 
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
              placeholder="e.g., Introduction to Computer Science"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="semester" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Semester</label>
            <input 
              type="text" 
              id="semester" 
              value={semester} 
              onChange={(e) => setSemester(e.target.value)} 
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
              placeholder="e.g., Fall 2024"
            />
          </div>
          <div>
            <label htmlFor="mark" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mark (%)</label>
            <input 
              type="number" 
              id="mark" 
              value={mark} 
              onChange={(e) => setMark(e.target.value)} 
              min="0" 
              max="100" 
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
              placeholder="0-100"
            />
          </div>
          <div>
            <label htmlFor="creditsAttempted" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Credits Attempted</label>
            <input 
              type="number" 
              id="creditsAttempted" 
              value={creditsAttempted} 
              onChange={(e) => setCreditsAttempted(e.target.value)} 
              min="0.5" 
              step="0.5" 
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
              placeholder="e.g., 3.0"
            />
          </div>
        </div>
        <div>
          <label htmlFor="comments" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comments (Optional)</label>
          <textarea 
            id="comments" 
            value={comments} 
            onChange={(e) => setComments(e.target.value)} 
            rows={3} 
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
            placeholder="Add any comments about the student's performance..."
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button 
          type="submit" 
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Add Grade
        </button>
      </form>
    </div>
  );
};

// GradesTable Component
const GradesTable = ({ grades }: { grades: Grade[] }) => {
  if (!grades || grades.length === 0) {
    return <p className="text-gray-600 dark:text-gray-300">No grades available to display.</p>;
  }

  // Group grades by semester
  const gradesBySemester = grades.reduce((acc, grade) => {
    if (!acc[grade.semester]) {
      acc[grade.semester] = [];
    }
    acc[grade.semester].push(grade);
    return acc;
  }, {} as Record<string, Grade[]>);

  // Calculate semester GPA
  const calculateSemesterGPA = (semesterGrades: Grade[]) => {
    const totalQualityPoints = semesterGrades.reduce((sum, grade) => sum + grade.totalQualityPoints, 0);
    const totalCreditsAttempted = semesterGrades.reduce((sum, grade) => sum + grade.creditsAttempted, 0);
    return totalCreditsAttempted > 0 ? (totalQualityPoints / totalCreditsAttempted).toFixed(2) : "N/A";
  };

  // Calculate cumulative GPA
  const calculateCumulativeGPA = () => {
    const totalQualityPoints = grades.reduce((sum, grade) => sum + grade.totalQualityPoints, 0);
    const totalCreditsAttempted = grades.reduce((sum, grade) => sum + grade.creditsAttempted, 0);
    return totalCreditsAttempted > 0 ? (totalQualityPoints / totalCreditsAttempted).toFixed(2) : "N/A";
  };

  // Sort semesters chronologically (most recent first)
  const sortedSemesters = Object.keys(gradesBySemester).sort().reverse();

  return (
    <div className="space-y-8">
      {sortedSemesters.map(semester => (
        <div key={semester} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex justify-between">
              <span>{semester}</span>
              <span>Semester GPA: {calculateSemesterGPA(gradesBySemester[semester])}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Course Code
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Course Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Credits Att.
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Credits Earned
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Mark (%)
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Grade
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Quality Pts
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total QP
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Comments
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {gradesBySemester[semester].map((grade) => (
                  <tr key={grade.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{grade.courseCode}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{grade.courseName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-center">{grade.creditsAttempted}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-center">{grade.creditsEarned}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-center">{grade.mark}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white text-center">{grade.letterGrade}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-center">{grade.qualityPoints}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-center">{grade.totalQualityPoints}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{grade.comments || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Cumulative GPA */}
      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white text-right">
          Cumulative GPA: {calculateCumulativeGPA()}
        </h3>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<User[]>([]);
  
  // Sample grades data - Replace with actual data from Firebase in production
  const [grades, setGrades] = useState<Grade[]>([
    {
      id: "g1",
      studentId: "student1",
      courseCode: "CS101",
      courseName: "Introduction to Computer Science",
      mark: 85,
      letterGrade: "B",
      creditsAttempted: 3,
      creditsEarned: 3,
      qualityPoints: 3.0,
      totalQualityPoints: 9.0,
      semester: "Fall 2024",
      updatedAt: new Date(),
      comments: "Good work on the final project"
    },
    {
      id: "g2",
      studentId: "student1",
      courseCode: "MATH101",
      courseName: "Calculus I",
      mark: 92,
      letterGrade: "A",
      creditsAttempted: 4,
      creditsEarned: 4,
      qualityPoints: 4.0,
      totalQualityPoints: 16.0,
      semester: "Fall 2024",
      updatedAt: new Date(),
      comments: "Excellent performance"
    },
    {
      id: "g3",
      studentId: "student1",
      courseCode: "ENG101",
      courseName: "English Composition",
      mark: 78,
      letterGrade: "C",
      creditsAttempted: 3,
      creditsEarned: 3,
      qualityPoints: 2.0,
      totalQualityPoints: 6.0,
      semester: "Fall 2024",
      updatedAt: new Date()
    },
    {
      id: "g4",
      studentId: "student1",
      courseCode: "CS201",
      courseName: "Data Structures",
      mark: 88,
      letterGrade: "B",
      creditsAttempted: 3,
      creditsEarned: 3,
      qualityPoints: 3.0,
      totalQualityPoints: 9.0,
      semester: "Spring 2025",
      updatedAt: new Date()
    },
    {
      id: "g5",
      studentId: "student1",
      courseCode: "PHYS101",
      courseName: "Physics I",
      mark: 55,
      letterGrade: "F",
      creditsAttempted: 4,
      creditsEarned: 0, // Failed, so no credits earned
      qualityPoints: 0.0,
      totalQualityPoints: 0.0,
      semester: "Spring 2025",
      updatedAt: new Date(),
      comments: "Need to improve, consider tutoring"
    }
  ]);
  type Role = "admin" | "student" | "teacher" | "accountsadmin";
  const [role, setRole] = useState<Role>("student");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();
  
  // Function to handle adding a new grade
  const handleAddGrade = (newGradeData: Omit<Grade, 'id' | 'updatedAt'>) => {
    const newGrade: Grade = {
      ...newGradeData,
      id: uuidv4(), // Generate a unique ID
      updatedAt: new Date()
    };
    
    setGrades(prevGrades => [...prevGrades, newGrade]);
    
    // In production, save to Firebase here
    // Example: await addDoc(collection(db, 'grades'), newGrade);
  };

  const initializeUserDoc = async (currentUser: any) => {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      const defaultUser: User = {
        id: currentUser.uid,
        name: currentUser.displayName || "Unnamed User",
        email: currentUser.email || "",
        role: "student",
      };
      await setDoc(userDocRef, defaultUser);
      return defaultUser;
    }
    return { id: userSnap.id, ...userSnap.data() } as User;
  };

  const fetchCourses = async () => {
    try {
      const coursesSnapshot = await getDocs(collection(db, "courses"));
      const coursesList = await Promise.all(
        coursesSnapshot.docs.map(async (courseDoc) => {
          const courseData = courseDoc.data();
          const resourcesSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "resources")
          );
          const assignmentsSnapshot = await getDocs(
            collection(db, "courses", courseDoc.id, "assignments")
          );
          const resources = resourcesSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data(), uploadedAt: doc.data().uploadedAt?.toDate() || new Date() }) as Resource
          );
          const assignments = assignmentsSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Assignment
          );
          return {
            id: courseDoc.id,
            name: courseData.name || "Unnamed Course",
            teacherId: courseData.teacherId || "",
            resources,
            assignments,
            tests: courseData.tests || [],
          } as Course;
        })
      );
      setAllCourses(coursesList);
    } catch (err) {
      console.error("Error fetching courses:", err);
    }
  };

  const fetchData = useCallback(async (currentUser: any) => {
    setIsLoading(true);
    try {
      const fetchedUserData = await initializeUserDoc(currentUser);
      setRole(fetchedUserData.role as Role);
      setUsername(fetchedUserData.name || "Unnamed");
      setUserData(fetchedUserData);
      const hour = new Date().getHours();
      setGreeting(
        hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"
      );

      if (fetchedUserData.role === "student") {
        const studentDocRef = doc(db, "students", currentUser.uid);
        const studentSnap = await getDoc(studentDocRef);
        let fetchedStudentData: StudentData | null = null;
        if (studentSnap.exists()) {
          fetchedStudentData = {
            id: studentSnap.id,
            ...studentSnap.data(),
            transactions: studentSnap.data().transactions || [],
            notifications: studentSnap.data().notifications || [],
            grades: studentSnap.data().grades || {},
            courses: studentSnap.data().courses || [],
            totalOwed: studentSnap.data().totalOwed || 0,
            totalPaid: studentSnap.data().totalPaid || 0,
            balance: studentSnap.data().balance || 0,
            paymentStatus: studentSnap.data().paymentStatus || "Unpaid",
            clearance: studentSnap.data().clearance || false,
          } as StudentData;
        }
        if (!fetchedStudentData) {
          const newStudent: StudentData = {
            id: currentUser.uid,
            name: fetchedUserData.name || "Student",
            email: fetchedUserData.email || "",
            teacherId: null,
            courses: [],
            totalOwed: 0,
            totalPaid: 0,
            balance: 0,
            paymentStatus: "Unpaid",
            clearance: false,
            transactions: [],
            notifications: [],
            grades: {},
          };
          await setDoc(studentDocRef, newStudent);
          fetchedStudentData = newStudent;
        }
        setStudentData(fetchedStudentData);
      }

      if (["teacher", "admin", "accountsadmin"].includes(fetchedUserData.role)) {
        const studentsSnapshot = await getDocs(collection(db, "students"));
        const studentsList = studentsSnapshot.docs.map((studentDoc) => ({
          id: studentDoc.id,
          ...studentDoc.data(),
          transactions: studentDoc.data().transactions || [],
          notifications: studentDoc.data().notifications || [],
          grades: studentDoc.data().grades || {},
          clearance: studentDoc.data().clearance ?? false,
          courses: studentDoc.data().courses || [],
          totalOwed: studentDoc.data().totalOwed || 0,
          totalPaid: studentDoc.data().totalPaid || 0,
          balance: studentDoc.data().balance || 0,
          paymentStatus: studentDoc.data().paymentStatus || "Unpaid",
        })) as StudentData[];
        setAllStudents(studentsList);

        const teachersList: User[] = [];
        for (const student of studentsList) {
          if (student.teacherId) {
            const teacherDocRef = doc(db, "users", student.teacherId);
            const teacherSnap = await getDoc(teacherDocRef);
            if (teacherSnap.exists() && teacherSnap.data().role === "teacher") {
              teachersList.push({
                id: teacherSnap.id,
                ...teacherSnap.data(),
              } as User);
            }
          }
        }
        setAllTeachers(teachersList);

        if (fetchedUserData.role === "teacher" && studentsList.length > 0) {
          const assignedStudent = studentsList.find(
            (s) => s.teacherId === currentUser.uid
          );
          setSelectedStudentId(assignedStudent ? assignedStudent.id : null);
        }
      }

      await fetchCourses();
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }
      fetchData(currentUser);
    });

    return () => unsubscribe();
  }, [user, router, fetchData]);

  const handleAddResource = async (
    title: string,
    type: 'link' | 'video' | 'pdf',
    url: string,
    description: string
  ) => {
    if (!['teacher', 'admin'].includes(role) || !user || !selectedCourseId) return;
    try {
      const resourceRef = collection(db, 'courses', selectedCourseId, 'resources');
      await addDoc(resourceRef, {
        title,
        type,
        url,
        description,
        uploadedAt: new Date(),
        uploadedBy: userData?.name || 'Unknown',
      });
      await fetchCourses();
    } catch (error) {
      setError('Failed to add resource');
    }
  };

  const handleAddAssignment = async (
    courseId: string,
    title: string,
    description: string,
    points: number
  ) => {
    if (!["teacher", "admin"].includes(role) || !user || !courseId) return;
    try {
      const assignmentRef = collection(db, "courses", courseId, "assignments");
      const newAssignment: Assignment = {
        id: uuidv4(),
        courseId,
        title,
        description,
        points,
        createdAt: new Date().toISOString(),
      };
      await addDoc(assignmentRef, newAssignment);
      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, assignments: [...(c.assignments || []), newAssignment] }
            : c
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to create assignment.");
    }
  };

  const handleGradeAssignment = async (
    studentId: string,
    courseId: string,
    assignmentId: string,
    grade: number
  ) => {
    if (role !== "teacher" || !user) return;
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) {
      setError("Student not found.");
      return;
    }
    try {
      const gradeRef = doc(db, "students", studentId);
      const updatedGrades = {
        ...(student.grades || {}),
        [`${courseId}_${assignmentId}`]: grade,
      };
      await updateDoc(gradeRef, { grades: updatedGrades });
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, grades: updatedGrades } : s
        )
      );
      if (studentData && studentId === studentData.id) {
        setStudentData((prev) =>
          prev ? { ...prev, grades: updatedGrades } : prev
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to update grade.");
    }
  };

  const handleGrantClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: true });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: true } : s))
      );
    } catch (err: any) {
      setError(err.message || "Failed to grant clearance.");
    }
  };

  const handleRemoveClearance = async (studentId: string) => {
    if (!["admin", "accountsadmin"].includes(role)) return;
    try {
      await updateDoc(doc(db, "students", studentId), { clearance: false });
      setAllStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, clearance: false } : s))
      );
    } catch (err: any) {
      setError(err.message || "Failed to remove clearance.");
    }
  };

  const handleDeleteAccount = async (studentId: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "users", studentId));
      await deleteDoc(doc(db, "students", studentId));
      setAllStudents((prev) => prev.filter((s) => s.id !== studentId));
      if (selectedStudentId === studentId) {
        setSelectedStudentId(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete account.");
    }
  };

  const handlePaymentSuccess = async (transaction: Transaction) => {
    if (!user || !studentData) return;
    try {
      const newBalance = studentData.balance - transaction.amount;
      const updatedTransactions = [...studentData.transactions, transaction];
      await updateDoc(doc(db, "students", user.uid), {
        balance: newBalance,
        totalPaid: studentData.totalPaid + transaction.amount,
        paymentStatus: newBalance <= 0 ? "Paid" : "Unpaid",
        transactions: updatedTransactions,
      });
      setStudentData({
        ...studentData,
        balance: newBalance,
        totalPaid: studentData.totalPaid + transaction.amount,
        paymentStatus: newBalance <= 0 ? "Paid" : "Unpaid",
        transactions: updatedTransactions,
      });
    } catch (err: any) {
      setError(err.message || "Failed to process payment.");
    }
  };

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    if (!user || role !== "student" || !studentData) return;
    try {
      await markNotificationAsRead(user.uid, notificationId);
      setStudentData({
        ...studentData,
        notifications: studentData.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        ),
      });
    } catch (err: any) {
      setError(err.message || "Failed to mark notification as read.");
    }
  };

  const downloadFinancialReport = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Financial Report", 20, 20);
      const data = allStudents.map((s) => [
        s.name || "N/A",
        s.totalOwed.toLocaleString(),
        s.totalPaid.toLocaleString(),
        s.balance.toLocaleString(),
        s.paymentStatus || "N/A",
      ]);
      autoTable(doc, {
        head: [["Name", "Total Owed", "Total Paid", "Balance", "Status"]],
        body: data,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 64, 175] },
      });
      doc.save("Financial_Report.pdf");
    } catch (err: any) {
      setError(err.message || "Failed to generate financial report.");
    }
  };

  const filteredStudents = allStudents.filter((student) =>
    student.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white text-xl">Loading...</p>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded">
          <p>{error || "User data not found. Please log in again."}</p>
          <Link
            href="/auth/login"
            className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 p-4 shadow-md">
        <h3 className="text-xl font-semibold text-white mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li>
            <Link
              href="/dashboard"
              className="block p-2 text-white hover:bg-gray-700 rounded"
            >
              Dashboard
            </Link>
          </li>
          <li>
            <Link
              href="/profile"
              className="block p-2 text-white hover:bg-gray-700 rounded"
            >
              Profile
            </Link>
          </li>
          <li>
            <button
              onClick={() => signOut(auth)}
              className="block w-full text-left p-2 text-white hover:bg-gray-700 rounded"
            >
              Logout
            </button>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">{greeting}, {username}</h1>
          <p className="text-lg mb-6 capitalize">{role} Dashboard</p>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-8 w-full mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="courses">Courses</TabsTrigger>
              <TabsTrigger value="grades">Grades</TabsTrigger>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              {role.toLowerCase() === "admin" && <TabsTrigger value="admin">Admin</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Students</h2>
                    <p className="text-2xl font-bold">{allStudents.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Courses</h2>
                    <p className="text-2xl font-bold">{allCourses.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-2">Total Resources</h2>
                    <p className="text-2xl font-bold">
                      {allCourses.reduce((acc, course) => acc + (course.resources?.length || 0), 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Transaction Trends</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={transactionData}>
                        <XAxis dataKey="date" stroke="#8884d8" />
                        <YAxis stroke="#8884d8" />
                        <Tooltip />
                        <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Grade Distribution</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={gradeData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                          fill="#8884d8"
                          label
                        >
                          {gradeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Learning Resources</h2>
                  <Link 
                    href="/assignments" 
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    View Assignments
                  </Link>
                </div>
                
                {/* Coming Soon Notice */}
                <div className="bg-amber-100 dark:bg-amber-900 border-l-4 border-amber-500 p-4 mb-6 rounded-md">
                  <p className="text-amber-700 dark:text-amber-300 font-bold">Coming Soon - Future Update</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    Enhanced resource management features are under development.
                  </p>
                </div>
                
                {/* Resources Categories */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="mb-2 text-blue-600 dark:text-blue-400">
                      <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Textbooks</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Access digital textbooks</p>
                  </div>
                  
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="mb-2 text-blue-600 dark:text-blue-400">
                      <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Video Lectures</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Watch course video lectures</p>
                  </div>
                  
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="mb-2 text-blue-600 dark:text-blue-400">
                      <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Practice Tests</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Take practice exams</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="assignments">
              {role === "teacher" && selectedCourseId && (
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-4">Create Assignment</h3>
                  <AssignmentForm
                    courseId={selectedCourseId}
                    onAddAssignment={(title, description, points) => handleAddAssignment(selectedCourseId, title, description, points)}
                  />
                </div>
              )}

              <div className="space-y-4">
                {/* Selected course assignments */}
                {allCourses.some(course => course.id === selectedCourseId) ? (
                  allCourses
                    .find(course => course.id === selectedCourseId)
                    ?.assignments?.map((assignment: Assignment) => (
                      <div key={assignment.id} className="p-4 bg-white rounded-lg shadow">
                        <h4 className="font-semibold text-lg">{assignment.title}</h4>
                        <p className="text-gray-700">{assignment.description}</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-sm text-gray-600">
                            {new Date(assignment.createdAt).toLocaleDateString()}
                          </span>
                          <span className="font-medium">
                            {assignment.points} points
                          </span>
                        </div>
                      </div>
                    )) || <p className="text-gray-600">No assignments available.</p>
                ) : (
                  <p className="text-gray-600">No course selected.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="finance">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allCourses.map((course) => (
                  <Card key={course.id}>
                    <CardContent className="p-4">
                      <h2 className="text-lg font-semibold mb-2">{course.name}</h2>
                      <p className="text-sm mb-2">Resources: {course.resources?.length || 0}</p>
                      <p className="text-sm mb-2">Assignments: {course.assignments?.length || 0}</p>
                      <Link
                        href={`/courses/${course.id}/materials`}
                        className="text-blue-400 hover:underline"
                      >
                        View Materials
                      </Link>
                      <Link
                        href={`/courses/${course.id}/assignments`}
                        className="text-blue-400 hover:underline ml-4"
                      >
                        View Assignments
                      </Link>
                      {role !== "student" && (
                        <>
                          <ResourceForm courseId={course.id} onAddResource={handleAddResource} />
                          <AssignmentForm courseId={course.id} onAddAssignment={(title, description, points) => handleAddAssignment(course.id, title, description, points)} />
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notifications">
              {studentData && role === "student" && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Your Grades</h2>
                    {Object.keys(studentData.grades).length > 0 ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-700">
                            <th className="p-2 border">Assignment</th>
                            <th className="p-2 border">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(studentData.grades).map(([key, grade]) => (
                            <tr key={key}>
                              <td className="p-2 border">{key}</td>
                              <td className="p-2 border">{grade}/100</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No grades available.</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {role.toLowerCase() === "teacher" && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Grade Assignments</h2>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full p-2 border rounded mb-4 text-gray-800"
                    >
                      <option value="">Select Student</option>
                      {allStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                    {selectedStudentId && (
                      <div>
                        {/* Add grade input form here */}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="attendance">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Attendance</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-4">Attendance tracking coming soon.</p>
                
                {/* Coming Soon Notice */}
                <div className="bg-amber-100 dark:bg-amber-900 border-l-4 border-amber-500 p-4 rounded-md">
                  <p className="text-amber-700 dark:text-amber-300 font-bold">Coming Soon - Future Update</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    Enhanced attendance tracking features are under development.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="materials">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Learning Materials</h2>
                  <Link 
                    href="/materials" 
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    View All Materials
                  </Link>
                </div>
                
                {/* Coming Soon Notice */}
                <div className="bg-amber-100 dark:bg-amber-900 border-l-4 border-amber-500 p-4 mb-6 rounded-md">
                  <p className="text-amber-700 dark:text-amber-300 font-bold">Coming Soon - Future Update</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    Enhanced materials management features are under development. Click "View All Materials" for a preview.
                  </p>
                </div>
                
                {/* Recent Materials Preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-lg text-gray-800 dark:text-white">Introduction to Programming</h3>
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">PDF</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">CS101 - A comprehensive guide to programming fundamentals</p>
                  </div>
                  
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-lg text-gray-800 dark:text-white">Data Structures Tutorial</h3>
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">Video</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">CS201 - Video tutorial on data structures</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="grades" className="p-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Gradebook</h2>
                
                {/* Student selection for teachers */}
                {role.toLowerCase() === "teacher" && (
                  <div className="mb-6 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-white">Select Student</h3>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full p-2 border rounded mb-2 bg-white dark:bg-gray-600 text-gray-800 dark:text-white border-gray-300 dark:border-gray-500"
                    >
                      <option value="">-- Select a student --</option>
                      {allStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                    {!selectedStudentId && (
                      <p className="text-amber-600 dark:text-amber-400 text-sm">Please select a student to enter grades or view their records</p>
                    )}
                  </div>
                )}
                
                {/* Show grade entry form only for teachers and when a student is selected */}
                {role.toLowerCase() === "teacher" && selectedStudentId && (
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
                      Enter New Grade for {allStudents.find(s => s.id === selectedStudentId)?.name || "Selected Student"}
                    </h3>
                    <GradeEntryForm 
                      onAddGrade={handleAddGrade}
                      studentId={selectedStudentId}
                    />
                  </div>
                )}
                
                {/* Show the grades table - for students their own grades, for teachers the selected student's grades */}
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
                    {role.toLowerCase() === "teacher" && selectedStudentId 
                      ? `Grades for ${allStudents.find(s => s.id === selectedStudentId)?.name || "Selected Student"}` 
                      : "Your Grades"}
                  </h3>
                  <GradesTable grades={
                    role.toLowerCase() === "student" 
                      ? grades.filter(g => g.studentId === user?.uid) 
                      : selectedStudentId 
                        ? grades.filter(g => g.studentId === selectedStudentId)
                        : grades
                  } />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="profile">
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Your Profile</h2>
                  <p className="text-sm mb-2">Name: {username}</p>
                  <p className="text-sm mb-2">Email: {user?.email || ""}</p>
                  <p className="text-sm mb-2">Role: {role}</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            {role.toLowerCase() === "admin" && (
              <TabsContent value="admin">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Administration Panel</h2>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => alert("Backup initiated")}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Backup Database
                      </button>
                      <button
                        onClick={() => alert("System settings opening...")}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      >
                        System Settings
                      </button>
                    </div>
                  </div>

                  {/* Admin Navigation Tabs */}
                  <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
                    <ul className="flex flex-wrap -mb-px text-sm font-medium text-center">
                      <li className="mr-2">
                        <button className="inline-block p-4 border-b-2 border-blue-600 rounded-t-lg active text-blue-600 dark:text-blue-500 dark:border-blue-500">
                          User Management
                        </button>
                      </li>
                      <li className="mr-2">
                        <button className="inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300">
                          Course Management
                        </button>
                      </li>
                      <li className="mr-2">
                        <button className="inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300">
                          System Reports
                        </button>
                      </li>
                      <li className="mr-2">
                        <button className="inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300">
                          Audit Logs
                        </button>
                      </li>
                    </ul>
                  </div>

                  {/* User Management Section */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-white">User Management</h3>
                      <button 
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center"
                        onClick={() => alert("Add new user modal will open")}
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                        Add User
                      </button>
                    </div>

                    {/* Search and Filter */}
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                      <div className="flex-grow">
                        <input
                          type="text"
                          placeholder="Search users..."
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                        />
                      </div>
                      <div className="flex-shrink-0 flex space-x-2">
                        <select className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                          <option value="">All Roles</option>
                          <option value="student">Students</option>
                          <option value="teacher">Teachers</option>
                          <option value="admin">Admins</option>
                        </select>
                        <select className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                          <option value="">All Status</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>
                    </div>

                    {/* Users Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</th>
                            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {[...allStudents, 
                            {id: "t1", name: "Teacher One", email: "teacher1@example.com", teacherId: null, courses: [], totalOwed: 0, totalPaid: 0, balance: 0, paymentStatus: "", clearance: true, transactions: [], notifications: [], grades: {}, customRole: "teacher"}, 
                            {id: "t2", name: "Teacher Two", email: "teacher2@example.com", teacherId: null, courses: [], totalOwed: 0, totalPaid: 0, balance: 0, paymentStatus: "", clearance: true, transactions: [], notifications: [], grades: {}, customRole: "teacher"}, 
                            {id: "admin1", name: "Admin User", email: "admin@example.com", teacherId: null, courses: [], totalOwed: 0, totalPaid: 0, balance: 0, paymentStatus: "", clearance: true, transactions: [], notifications: [], grades: {}, customRole: "admin"}
                          ].map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300">
                                      {user.name.charAt(0)}
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">ID: {user.id}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900 dark:text-white">{user.email || `${user.name.toLowerCase().replace(/ /g, ".")}@example.com`}</div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  'customRole' in user && user.customRole === "admin" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" : 
                                  'customRole' in user && user.customRole === "teacher" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" : 
                                  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                }`}>
                                  {'customRole' in user ? user.customRole : "student"}
                                </span>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  Active
                                </span>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {new Date().toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button 
                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                    onClick={() => alert(`Edit user: ${user.name}`)}
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                    onClick={() => {
                                      const confirm = window.confirm(`Are you sure you want to delete user: ${user.name}?`);
                                      if (confirm) alert(`User ${user.name} would be deleted`);
                                    }}
                                  >
                                    Delete
                                  </button>
                                  <button 
                                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
                                    onClick={() => alert(`Reset password for user: ${user.name}`)}
                                  >
                                    Reset Password
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Showing <span className="font-medium">1</span> to <span className="font-medium">10</span> of <span className="font-medium">{allStudents.length + 3}</span> results
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                          Previous
                        </button>
                        <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-blue-600 text-white hover:bg-blue-700">
                          1
                        </button>
                        <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                          2
                        </button>
                        <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                          3
                        </button>
                        <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                          Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* System Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Users</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{allStudents.length + 3}</div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">↑ 12% from last month</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Active Sessions</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">24</div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">↑ 8% from last hour</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">System Load</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">42%</div>
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">↑ 5% from average</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Storage Usage</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">3.2 GB</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">of 10 GB available</div>
                    </div>
                  </div>

                  {/* Recent Activities */}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Recent System Activities</h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="space-y-4">
                        <div className="flex items-start">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white">
                            A
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              <span className="font-semibold">Admin User</span> updated system settings
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">2 hours ago</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                            T
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              <span className="font-semibold">Teacher One</span> created a new assignment
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">3 hours ago</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-red-500 flex items-center justify-center text-white">
                            S
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              <span className="font-semibold">System</span> completed database backup
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">6 hours ago</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white">
                            A
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              <span className="font-semibold">Admin User</span> added a new user
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Yesterday</p>
                          </div>
                        </div>
                      </div>
                      <button className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-4">
                        View all activity
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}

            <TabsContent value="students">
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Manage Students</h2>
                  <input
                    type="text"
                    placeholder="Search by student name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-2 border rounded mb-4 text-gray-800"
                  />
                  {filteredStudents.length > 0 ? (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-700">
                          <th className="p-2 border">Name</th>
                          <th className="p-2 border">Email</th>
                          <th className="p-2 border">Balance</th>
                          <th className="p-2 border">Clearance</th>
                          <th className="p-2 border">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student) => (
                          <tr key={student.id}>
                            <td className="p-2 border">{student.name}</td>
                            <td className="p-2 border">{student.email}</td>
                            <td className="p-2 border">{student.balance.toLocaleString()} JMD</td>
                            <td className="p-2 border">
                              <button
                                onClick={() =>
                                  student.clearance
                                    ? handleRemoveClearance(student.id)
                                    : handleGrantClearance(student.id)
                                }
                                className={`px-2 py-1 rounded text-white ${
                                  student.clearance
                                    ? "bg-green-600 hover:bg-green-700"
                                    : "bg-red-600 hover:bg-red-700"
                                }`}
                              >
                                {student.clearance ? "Revoke" : "Grant"}
                              </button>
                            </td>
                            <td className="p-2 border">
                              <button
                                onClick={() => handleDeleteAccount(student.id)}
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
                    <p>No students found.</p>
                  )}
                  {(role === "admin" || role === "accountsadmin") && (
                    <button
                      onClick={downloadFinancialReport}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Download Financial Report
                    </button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {role === "student" && studentData && (
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Notifications</h2>
                  <NotificationList
                    notifications={studentData.notifications}
                    onMarkAsRead={handleMarkNotificationAsRead}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Payments</h2>
                  <p>Balance: {studentData.balance.toLocaleString()} JMD</p>
                  <p>Status: {studentData.paymentStatus}</p>
                  <p>Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                  {studentData.balance > 0 && (
                    <CheckoutPage
                      studentId={studentData.id}
                      onPaymentSuccess={handlePaymentSuccess}
                      amount={studentData.balance}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}