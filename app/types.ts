export interface User {
  id?: string;
  email: string;
  role: "student" | "teacher" | "admin" | "accountsadmin";
  name: string;
  profilePicture?: string;
}

export interface Subject {
  name: string;
  grades?: {
    C1?: string;
    C2?: string;
    exam?: string;
    final?: string;
    status?: string;
    [key: string]: string | undefined;
  };
  comments?: string;
}

export interface Course {
  id?: string;
  name: string;
  fee: number;
  subjects?: Subject[];
  resources?: Resource[];
  tests?: Test[];
}

export interface Transaction {
  id?: string;
  date: string;
  amount: number;
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
  questions: {
    question: string;
    options?: string[];
    correctAnswer: string;
  }[];
  createdAt: string;
}

export interface TestResponse {
  id: string;
  answers: { [questionIndex: number]: string };
  score?: number;
  submittedAt?: string | null;
}

export interface StudentData {
  id?: string;
  name: string;
  email?: string;
  lecturerId?: string | null;
  courses?: Course[];
  totalOwed: number;
  totalPaid: number;
  paymentStatus: string;
  balance: number;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  profilePicture?: string;
  idNumber?: string;
  phoneNumber?: string;
  homeAddress?: string;
}