export interface User {
  id?: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin" | "accountsadmin";
  profilePicture?: string; // Add profile picture URL
}

export interface StudentData {
  id?: string;
  name: string;
  email: string;
  lecturerId: string | null;
  courses?: Course[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  idNumber?: string; // Add ID number
  phoneNumber?: string; // Add phone number
  homeAddress?: string; // Add home address
  profilePicture?: string; // Add profile picture URL
}

// Other types remain unchanged
export interface Course {
  id: string;
  name: string;
  fee: number;
  subjects?: Subject[];
  resources?: Resource[];
  tests?: Test[];
}

export interface Subject {
  name: string;
  grades?: { [key: string]: string };
  comments?: string;
}

export interface Transaction {
  id?: string;
  amount: number;
  date: string;
  status: string;
}

export interface Notification {
  id?: string;
  message: string;
  date: string;
  read: boolean;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadDate: string;
}

export interface Test {
  id: string;
  title: string;
  questions: Question[];
  createdAt: string;
}

export interface Question {
  question: string;
  options?: string[];
  correctAnswer: string;
}

export interface TestResponse {
  id: string;
  answers: { [questionIndex: number]: string };
  score?: number;
  submittedAt?: string | null;
}