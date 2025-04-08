// utils/utils.ts
import { db } from "../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export const markNotificationAsRead = async (studentId: string, notificationId: string) => {
  try {
    await updateDoc(doc(db, "students", studentId, "notifications", notificationId), { read: true });
  } catch (err: any) {
    console.error("Failed to mark notification as read:", err.message);
  }
};