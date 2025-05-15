export type Transaction = {
  id: string;
  date: string;
  amount: number;
  status: string;
  studentId: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePicture: string;
};

export type StudentData = {
  id: string;
  name: string;
  email: string;
  teacherId: string | null;
  courses: string[];
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  clearance: boolean;
  transactions: Transaction[];
  notifications: Array<{
    id: string;
    message: string;
    read: boolean;
    date: string;
  }>;
  grades: Record<string, number>;
};
