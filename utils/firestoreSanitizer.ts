import {
    StudentData,
    Course,
    User,
    Resource,
    Test,
    Transaction,
    Notification,
    Subject,
  } from "../models";
  
  // Utility function to safely parse strings
  const safeString = (value: unknown, defaultValue: string = ""): string => {
    if (typeof value === "string") return value;
    return defaultValue;
  };
  
  // Utility function to safely parse numbers
  const safeNumber = (value: unknown, defaultValue: number = 0): number => {
    if (typeof value === "number" && !isNaN(value)) return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  };
  
  // Utility function to safely parse booleans
  const safeBoolean = (value: unknown, defaultValue: boolean = false): boolean => {
    if (typeof value === "boolean") return value;
    return defaultValue;
  };
  
  // Utility function to safely parse arrays
  const safeArray = <T>(value: unknown, defaultValue: T[] = []): T[] => {
    if (Array.isArray(value)) return value as T[];
    return defaultValue;
  };
  
  // Utility function to safely parse objects
  const safeObject = <T>(value: unknown, defaultValue: T): T => {
    if (value && typeof value === "object") return value as T;
    return defaultValue;
  };
  
  // Sanitize User data
  export const sanitizeUser = (data: any): User => {
    return {
      id: safeString(data.id),
      name: safeString(data.name, "Unnamed"),
      email: safeString(data.email),
      role: safeString(data.role, ""),
      profilePicture: safeString(data.profilePicture, ""),
    };
  };
  
  // Sanitize StudentData
  export const sanitizeStudentData = (data: any): StudentData => {
    return {
      id: safeString(data.id),
      name: safeString(data.name, "Unnamed"),
      email: safeString(data.email),
      teacherId: data.teacherId ? safeString(data.teacherId) : null,
      courses: safeArray<Course>(data.courses, []).map(sanitizeCourse),
      totalOwed: safeNumber(data.totalOwed, 0),
      totalPaid: safeNumber(data.totalPaid, 0),
      balance: safeNumber(data.balance, 0),
      paymentStatus: safeString(data.paymentStatus, "Unpaid"),
      clearance: safeBoolean(data.clearance, false),
      transactions: safeArray<Transaction>(data.transactions, []).map(sanitizeTransaction),
      notifications: safeArray<Notification>(data.notifications, []).map(sanitizeNotification),
      idNumber: data.idNumber ? safeString(data.idNumber) : undefined,
      phoneNumber: data.phoneNumber ? safeString(data.phoneNumber) : undefined,
      homeAddress: data.homeAddress ? safeString(data.homeAddress) : undefined,
      profilePicture: data.profilePicture ? safeString(data.profilePicture) : undefined,
      grades: safeObject<Record<string, number>>(data.grades, {}),
    };
  };
  
  // Sanitize Course
  export const sanitizeCourse = (data: any): Course => {
    return {
      id: safeString(data.id),
      name: safeString(data.name, "Unnamed Course"),
      fee: safeNumber(data.fee, 0),
      coursework: safeArray(data.coursework, []),
      subjects: safeArray<Subject>(data.subjects, []).map(sanitizeSubject),
      resources: safeArray<Resource>(data.resources, []).map(sanitizeResource),
      tests: safeArray<Test>(data.tests, []).map(sanitizeTest),
      teacherId: data.teacherId ? safeString(data.teacherId) : undefined,
      description: data.description ? safeString(data.description) : undefined,
      assignments: safeArray(data.assignments, []),
      announcements: safeArray(data.announcements, [])
    };
  };
  
  // Sanitize Subject
  export const sanitizeSubject = (data: any): Subject => {
    return {
      name: safeString(data.name, "Unnamed Subject"),
      grades: safeObject(data.grades, {}),
      comments: safeString(data.comments, ""),
    };
  };
  
  // Sanitize Resource
  export const sanitizeResource = (data: any): Resource => {
    return {
      id: safeString(data.id),
      courseId: safeString(data.courseId),
      name: safeString(data.name, "Unnamed Resource"),
      url: safeString(data.url),
      type: safeString(data.type, "Unknown"),
      uploadDate: safeString(data.uploadDate, new Date().toISOString()),
    };
  };
  
  // Sanitize Test
  export const sanitizeTest = (data: any): Test => {
    return {
      id: safeString(data.id),
      courseId: safeString(data.courseId),
      title: safeString(data.title, "Untitled Test"),
      questions: safeArray(data.questions, []).map((q: any) => ({
        question: safeString(q.question, "No question"),
        options: safeArray<string>(q.options, []),
        correctAnswer: safeString(q.correctAnswer, ""),
      })),
      createdAt: safeString(data.createdAt, new Date().toISOString()),
    };
  };
  
  // Sanitize Transaction
  export const sanitizeTransaction = (data: any): Transaction => {
    return {
      id: safeString(data.id),
      amount: safeNumber(data.amount, 0),
      date: safeString(data.date, new Date().toISOString()),
      status: safeString(data.status, "Unknown"),
    };
  };
  
  // Sanitize Notification
  export const sanitizeNotification = (data: any): Notification => {
    return {
      id: safeString(data.id),
      message: safeString(data.message, "No message"),
      date: safeString(data.date, new Date().toISOString()),
      read: safeBoolean(data.read, false),
    };
  };