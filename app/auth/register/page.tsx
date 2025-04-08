"use client";

import { useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

const COURSES = {
  "Computer Course": {
    fee: 150000,
    subjects: [
      "Introduction to Programming",
      "Database Fundamentals",
      "Web Development Basics",
      "Operating Systems",
      "Network Essentials",
      "Software Engineering Principles",
    ],
  },
  "Science Course": {
    fee: 175000,
    subjects: [
      "Biology Basics",
      "Chemistry Foundations",
      "Physics Principles",
      "Environmental Science",
      "Lab Techniques",
      "Scientific Research Methods",
    ],
  },
  "Management Information System": {
    fee: 185000,
    subjects: [
      "Business Systems: Analysis, Design and Development",
      "Work Experience",
      "Troubleshooting I",
      "Small Business Management (Theory and Practical)",
      "Introduction to Computer and Network Security",
      "Oral Communication",
    ],
  },
};

const PAYMENT_PLANS = {
  full: { name: "Full Payment", installments: (total: number) => [{ amount: total, dueDate: new Date().toISOString(), paid: false }] },
  "two-installments": {
    name: "Two Installments",
    installments: (total: number) => [
      { amount: total / 2, dueDate: new Date().toISOString(), paid: false },
      { amount: total / 2, dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), paid: false },
    ],
  },
  "three-installments": {
    name: "Three Installments",
    installments: (total: number) => [
      { amount: Math.floor(total / 3), dueDate: new Date().toISOString(), paid: false },
      { amount: Math.floor(total / 3), dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), paid: false },
      { amount: total - 2 * Math.floor(total / 3), dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), paid: false },
    ],
  },
};

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "admin" | "accountsadmin">("student");
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<keyof typeof PAYMENT_PLANS>("full");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleCourseToggle = (courseName: string) => {
    setSelectedCourses((prev) =>
      prev.includes(courseName) ? prev.filter((c) => c !== courseName) : [...prev, courseName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError("Username is required");
      return;
    }
    if (role === "student" && selectedCourses.length === 0) {
      setError("Please select at least one course");
      return;
    }

    try {
      console.log("Starting registration for:", email, role);
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      console.log("User created with UID:", user.uid);

      await setDoc(doc(db, "users", user.uid), {
        email,
        role,
        name: username,
      });
      console.log("User document written to Firestore");

      if (role === "student") {
        const totalOwed = Object.keys(COURSES)
          .filter((c) => selectedCourses.includes(c))
          .reduce((sum, c) => sum + COURSES[c].fee, 0);
        const installments = PAYMENT_PLANS[paymentPlan].installments(totalOwed);

        const coursesWithSubjects = Object.keys(COURSES)
          .filter((c) => selectedCourses.includes(c))
          .map((c) => ({
            name: c,
            fee: COURSES[c].fee,
            subjects: COURSES[c].subjects.map((subject) => ({
              name: subject,
              grades: { C1: "", C2: "", exam: "", final: "", status: "Pending" },
            })),
          }));

        const studentData = {
          name: username,
          courses: coursesWithSubjects,
          totalOwed,
          totalPaid: 0,
          paymentStatus: "Unpaid",
          balance: totalOwed,
          clearance: false,
          paymentPlan: { planType: paymentPlan, installments },
        };
        console.log("Student data to write:", studentData);

        await setDoc(doc(db, "students", user.uid), studentData);
        console.log("Student data written for UID:", user.uid);
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
      console.error("Registration error:", err);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: "url('https://pcc.edu.jm/img/pg-img/pg-23.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-3xl font-bold text-red-900 mb-6 text-center">Register</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-900"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-900"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-900"
          />
          <div>
            <p className="text-red-900 mb-2">Select Role:</p>
            {["student", "teacher", "admin", "accountsadmin"].map((r) => (
              <label key={r} className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r as "student" | "teacher" | "admin" | "accountsadmin")}
                />
                <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
              </label>
            ))}
          </div>
          {role === "student" && (
            <>
              <div>
                <p className="text-red-900 mb-2">Select Courses:</p>
                {Object.keys(COURSES).map((course) => (
                  <label key={course} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(course)}
                      onChange={() => handleCourseToggle(course)}
                    />
                    <span>{course} ({COURSES[course].fee.toLocaleString()} JMD)</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="text-red-900 mb-2">Select Payment Plan:</p>
                {Object.entries(PAYMENT_PLANS).map(([key, plan]) => (
                  <label key={key} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="paymentPlan"
                      value={key}
                      checked={paymentPlan === key}
                      onChange={() => setPaymentPlan(key as keyof typeof PAYMENT_PLANS)}
                    />
                    <span>{plan.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <button
            type="submit"
            className="w-full bg-red-900 text-pink-200 p-3 rounded hover:bg-red-800 transition-colors"
          >
            Register
          </button>
        </form>
        {error && <p className="text-red-900 mt-4 text-center">{error}</p>}
      </div>
    </div>
  );
}