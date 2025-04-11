// types/index.ts
export interface Grades {
    C1?: string;
    C2?: string;
    exam?: string;
    final?: string;
    [key: string]: string | undefined;
  }
  
  export interface Subject {
    name: string;
    grades?: Grades;
  }
  
  export interface Course {
    id?: string;
    name: string;
    fee?: number;
    subjects: Subject[];
  }
  
  export interface Transaction {
    id: string;
    amount: number;
    date: string;
    status: string;
  }
  
  export interface Notification {
    id: string;
    message: string;
    date: string;
    read: boolean;
  }
  
  export interface StudentData {
    id?: string;
    name?: string;
    email?: string;
    courses: Course[];
    totalOwed?: number;
    totalPaid?: number;
    balance?: number;
    paymentStatus?: string;
    clearance?: boolean;
    transactions?: Transaction[];
    notifications?: Notification[];
  }
  
  export interface UserData {
    uid: string;
    name?: string;
    email?: string;
    role: string;
  }