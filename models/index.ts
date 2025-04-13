// models/index.ts

// Existing interfaces (adjust these if yours differ)
export interface TestQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface Test {
  id: string;
  courseId: string; // Added courseId property
  title: string;
  questions: {
    question: string;
    options: string[];
    correctAnswer: string;
  }[];
  createdAt: string;
}

// New interface for test creation
export interface TestCreation extends Test {
  courseId: string; // Added for selecting the course during creation
}

// Other existing interfaces (ensure these are present as imported in your code)
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePicture?: string;
}

export interface StudentData {
  id: string;
  name: string;
  active?: boolean; // Added the 'active' property
}



export interface StudentData {
  id: string;
  name: string;

  lastOnline?: string; // Added lastOnline property
}


export interface StudentData {
  id: string;
  name: string;
  email: string;
  lecturerId: string | null;
  courses: Course[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: { id: string; amount: number; date: string; status: string }[];
  notifications: Notification[];
  idNumber?: string;
  phoneNumber?: string;
  homeAddress?: string;
  profilePicture?: string;
}
export interface Course {
  id: string;
  name: string;
  fee: number;
  subjects: Subject[];
  resources: Resource[];
  tests: Test[];
  coursework: Coursework[]; // Add this line
}


export interface Course {
  id: string;
  name: string;
  description?: string; // Added description property
  
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadDate: string;
}

export interface TestResponse {
  id: string;
  answers: { [questionIndex: number]: string };
  submittedAt: string | null;
  score: number;
}

export interface Subject {
  name: string;
  grades?: { [key: string]: string }; // e.g., { C1: "85", C2: "90", exam: "75", final: "82" }
  comments?: string;
}

export interface Notification {
  id: string;
  message: string;
  date: string;
  read: boolean;
}

export interface Notification {
  id: string;
  message: string;
  date: string;
  read: boolean;
  type?: string; // Added optional 'type' property
}

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  status: string;
}

export interface UserData {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin" | "accountsadmin";
  profilePicture?: string;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadDate: string;
  courseId: string; // Add courseId to the Resource type
}



export interface Coursework {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  weight: number;
  type: string;
}

export interface Submission {
  studentId: string;
  fileUrl: string;
  submittedAt: string; // ISO string
}

export interface TestResult {
  studentId: string;
  score: number; // Percentage score (e.g., 85 for 85%)
  submittedAt: string; // ISO string
}
export interface TestResults {
  testId: string;
  results: TestResult[];
}
export interface TestResults {
  testId: string;
  results: TestResult[];
}