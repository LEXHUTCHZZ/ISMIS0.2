// pages/dashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { StudentData, Course, Subject, Transaction, Notification, Resource, Test, TestResponse, User } from "../../models"; // Updated import path
import CheckoutPage from "../../components/CheckoutPage";
import { markNotificationAsRead } from "../../utils/utils";

export default function Dashboard() {
  const [userData, setUserData] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("");
  const [testResponses, setTestResponses] = useState<{ [testId: string]: TestResponse }>({});
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      setIsLoading(true);
      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        const fetchedUserData = userSnap.exists() ? (userSnap.data() as User) : null;

        if (!fetchedUserData) {
          setUserData(null);
          setIsLoading(false);
          return;
        }

        setRole(fetchedUserData.role || "");
        setUsername(fetchedUserData.name || "Unnamed");
        setUserData(fetchedUserData);
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening");

        if (fetchedUserData.role === "student") {
          const studentDocRef = doc(db, "students", currentUser.uid);
          const studentSnap = await getDoc(studentDocRef);
          const fetchedStudentData = studentSnap.exists() ? (studentSnap.data() as StudentData) : null;
          setStudentData(fetchedStudentData ? { ...fetchedStudentData, transactions: fetchedStudentData.transactions || [], notifications: fetchedStudentData.notifications || [] } : null);

          const coursesSnapshot = await getDocs(collection(db, "courses"));
          const coursesList = await Promise.all(
            coursesSnapshot.docs.map(async (courseDoc) => {
              const courseData = courseDoc.data();
              const resourcesSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "resources"));
              const testsSnapshot = await getDocs(collection(db, "courses", courseDoc.id, "tests"));
              const resources = resourcesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Resource));
              const tests = await Promise.all(
                testsSnapshot.docs.map(async (testDoc) => {
                  const testData = testDoc.data() as Test;
                  const responseSnap = await getDoc(doc(db, "courses", courseDoc.id, "tests", testDoc.id, "responses", currentUser.uid));
                  const response = responseSnap.exists() ? (responseSnap.data() as TestResponse) : null;
                  if (response) {
                    setTestResponses((prev) => ({ ...prev, [testDoc.id]: response }));
                  }
                  const { id, ...restTestData } = testData;
                  return { id: testDoc.id, ...restTestData };
                })
              );
              return { id: courseDoc.id, ...courseData, resources, tests } as Course;
            })
          );
          setAllCourses(coursesList);
        }
      } catch (error) {
        console.error("Error in useEffect:", error);
        alert("An error occurred while loading data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  const calculateCourseAverage = (subjects: Subject[] | undefined): string => {
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) return "N/A";
    const validGrades = subjects.map((s) => parseFloat(s.grades?.final || "0")).filter((g) => !isNaN(g));
    return validGrades.length ? (validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length).toFixed(2) : "N/A";
  };

  const handlePaymentSuccess = async (amount: number) => {
    if (!studentData || !user?.uid) return;
    try {
      const updatedBalance = studentData.balance - amount;
      const updatedTotalPaid = studentData.totalPaid + amount;
      const paymentStatus = updatedBalance <= 0 ? "Paid" : "Partial";
      const newTransaction: Transaction = {
        id: new Date().toISOString(),
        amount,
        date: new Date().toISOString(),
        status: "Completed",
      };
      const updatedTransactions = [...studentData.transactions, newTransaction];
      await updateDoc(doc(db, "students", user.uid), {
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: updatedTransactions,
      });
      setStudentData({
        ...studentData,
        balance: updatedBalance,
        totalPaid: updatedTotalPaid,
        paymentStatus,
        transactions: updatedTransactions,
      });
      alert("Payment processed successfully!");
    } catch (err: any) {
      alert("Failed to update payment: " + err.message);
    }
  };

  const handleEnrollCourse = async (course: Course) => {
    if (!studentData || !user?.uid) return;
    const isAlreadyEnrolled = (studentData.courses || []).some((c) => c.name === course.name);
    if (isAlreadyEnrolled) return alert("You are already enrolled in this course!");
    const courseToEnroll: Course = {
      ...course,
      subjects: course.subjects?.map((sub) => ({ name: sub.name, grades: {}, comments: "" })) || [],
    };
    const updatedCourses = [...(studentData.courses || []), courseToEnroll];
    const updatedTotalOwed = studentData.totalOwed + course.fee;
    const updatedBalance = studentData.balance + course.fee;
    try {
      await updateDoc(doc(db, "students", user.uid), {
        courses: updatedCourses,
        totalOwed: updatedTotalOwed,
        balance: updatedBalance,
        paymentStatus: updatedBalance > 0 ? "Partial" : "Paid",
      });
      setStudentData({ ...studentData, courses: updatedCourses, totalOwed: updatedTotalOwed, balance: updatedBalance });
      alert("Enrolled successfully!");
    } catch (err: any) {
      alert("Failed to enroll: " + err.message);
    }
  };

  const handleTestAnswerChange = (testId: string, questionIndex: number, answer: string) => {
    if (!user?.uid) return;
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
    if (!user?.uid || !testResponses[testId]) return alert("Please answer all questions before submitting.");
    try {
      const testDocRef = doc(db, "courses", courseId, "tests", testId);
      const testSnap = await getDoc(testDocRef);
      const testData = testSnap.exists() ? (testSnap.data() as Test) : null;
      if (!testData) return alert("Test not found.");
      let score = 0;
      const totalQuestions = testData.questions.length;
      testData.questions.forEach((q, idx) => {
        if (testResponses[testId].answers[idx] === q.correctAnswer) score += 1;
      });
      const percentage = (score / totalQuestions) * 100;
      const responseRef = doc(db, "courses", courseId, "tests", testId, "responses", user.uid);
      const responseData: TestResponse = { ...testResponses[testId], score: percentage, submittedAt: new Date().toISOString() };
      await setDoc(responseRef, responseData);
      setTestResponses((prev) => ({ ...prev, [testId]: responseData }));
      alert(`Test submitted successfully! Your score: ${percentage.toFixed(2)}%`);
    } catch (err: any) {
      alert("Failed to submit test: " + err.message);
    }
  };

  if (isLoading) return <p className="text-red-800 text-center">Loading...</p>;
  if (userData === null) return <p className="text-red-800 text-center">User data not found. Please log in again.</p>;
  if (!role) return null;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md p-4">
        <h3 className="text-xl font-semibold text-red-800 mb-4">SMIS Menu</h3>
        <ul className="space-y-2">
          <li><Link href="/dashboard" className="text-red-800 hover:underline">Dashboard</Link></li>
          <li><Link href="/profile" className="text-red-800 hover:underline">Profile</Link></li>
        </ul>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <img
                src={userData?.profilePicture || "https://via.placeholder.com/150"}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => (e.currentTarget.src = "https://via.placeholder.com/150")}
              />
              <div>
                <h2 className="text-2xl font-bold text-red-800">{greeting}, {username}</h2>
                <p className="text-red-800 capitalize">{role} Dashboard</p>
              </div>
            </div>
          </div>

          {role === "student" && (
            <div className="space-y-6">
              {!studentData ? (
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <p className="text-red-800 text-center">No student profile found. Contact support to set up your account.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Notifications</h3>
                      {studentData.notifications.length ? (
                        studentData.notifications.map((notif: Notification) => (
                          <div key={notif.id || notif.date} className="flex justify-between items-center mb-2">
                            <p className={`text-red-800 ${notif.read ? "opacity-50" : "font-bold"}`}>
                              {new Date(notif.date).toLocaleString()}: {notif.message || "No message"}
                            </p>
                            {!notif.read && (
                              <button
                                onClick={async () => {
                                  if (!user?.uid || !notif.id) return;
                                  await markNotificationAsRead(user.uid, notif.id);
                                  const studentDocRef = doc(db, "students", user.uid);
                                  const studentSnap = await getDoc(studentDocRef);
                                  const fetchedStudentData = studentSnap.exists() ? (studentSnap.data() as StudentData) : null;
                                  if (fetchedStudentData) {
                                    setStudentData({
                                      ...fetchedStudentData,
                                      transactions: fetchedStudentData.transactions || [],
                                      notifications: fetchedStudentData.notifications || [],
                                    });
                                  }
                                }}
                                className="text-red-800 hover:underline"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No notifications.</p>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Your Grades</h3>
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => (
                          <div key={c.id || c.name} className="mb-4">
                            <p className="text-red-800 font-medium">{c.name || "Unnamed Course"} (Fee: {c.fee.toLocaleString()} JMD)</p>
                            {c.subjects && c.subjects.length > 0 ? (
                              <table className="w-full mt-2 border-collapse">
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
                                  {c.subjects.map((sub: Subject) => (
                                    <tr key={sub.name}>
                                      <td className="p-2 border text-red-800">{sub.name || "N/A"}</td>
                                      <td className="p-2 border text-red-800">
                                        {sub.grades
                                          ? Object.keys(sub.grades)
                                              .filter((k) => k.startsWith("C"))
                                              .map((k) => sub.grades![k] || "N/A")
                                              .join(", ") || "N/A"
                                          : "N/A"}
                                      </td>
                                      <td className="p-2 border text-red-800">{sub.grades?.exam || "N/A"}</td>
                                      <td className="p-2 border text-red-800">{sub.grades?.final || "N/A"}</td>
                                      <td className="p-2 border text-red-800">{sub.comments || "No comments"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-red-800">No subjects assigned.</p>
                            )}
                            <p className="mt-2 text-red-800">Average: {calculateCourseAverage(c.subjects)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see grades.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Course Resources</h3>
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          return (
                            <div key={c.id || c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                              {enrolledCourse?.resources && enrolledCourse.resources.length > 0 ? (
                                <ul className="list-disc pl-5">
                                  {enrolledCourse.resources.map((resource: Resource) => (
                                    <li key={resource.id} className="text-red-800">
                                      <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                        {resource.name} ({resource.type})
                                      </a>{" "}
                                      - Uploaded: {new Date(resource.uploadDate).toLocaleString()}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-red-800">No resources available.</p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see resources.</p>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Course Tests</h3>
                      {studentData.courses && studentData.courses.length > 0 ? (
                        studentData.courses.map((c: Course) => {
                          const enrolledCourse = allCourses.find((ac) => ac.name === c.name);
                          if (!enrolledCourse) return null;
                          return (
                            <div key={c.id || c.name} className="mb-4">
                              <p className="text-red-800 font-medium">{c.name || "Unnamed Course"}</p>
                              {enrolledCourse.tests && enrolledCourse.tests.length > 0 ? (
                                enrolledCourse.tests.map((test: Test) => (
                                  <div key={test.id} className="mt-2">
                                    <p className="text-red-800 font-medium">{test.title}</p>
                                    {testResponses[test.id]?.submittedAt ? (
                                      <p className="text-red-800">
                                        Submitted on: {new Date(testResponses[test.id].submittedAt!).toLocaleString()}
                                        <br />
                                        Score: {testResponses[test.id].score?.toFixed(2)}%
                                      </p>
                                    ) : (
                                      <>
                                        {test.questions.map((q, idx) => (
                                          <div key={idx} className="mt-2">
                                            <p className="text-red-800">
                                              {idx + 1}. {q.question}
                                            </p>
                                            {q.options && q.options.length > 0 ? (
                                              q.options.map((opt, optIdx) => (
                                                <label key={optIdx} className="block text-red-800">
                                                  <input
                                                    type="radio"
                                                    name={`${test.id}-${idx}`}
                                                    value={opt}
                                                    checked={testResponses[test.id]?.answers?.[idx] === opt}
                                                    onChange={(e) => handleTestAnswerChange(test.id, idx, e.target.value)}
                                                    className="mr-2"
                                                  />
                                                  {opt}
                                                </label>
                                              ))
                                            ) : (
                                              <input
                                                type="text"
                                                value={testResponses[test.id]?.answers?.[idx] || ""}
                                                onChange={(e) => handleTestAnswerChange(test.id, idx, e.target.value)}
                                                className="w-full p-2 border rounded text-red-800"
                                                placeholder="Your answer"
                                              />
                                            )}
                                          </div>
                                        ))}
                                        <button
                                          onClick={() => handleSubmitTest(enrolledCourse.id, test.id)}
                                          className="mt-2 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
                                        >
                                          Submit Test
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="text-red-800">No tests available.</p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-red-800">You are not enrolled in any courses. Please enroll to see tests.</p>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Payments</h3>
                      <p className="text-red-800">Balance: {studentData.balance.toLocaleString()} JMD</p>
                      <p className="text-red-800">Status: {studentData.paymentStatus}</p>
                      <p className="text-red-800">Clearance: {studentData.clearance ? "Yes" : "No"}</p>
                      <div className="mt-2">
                        <h4 className="text-red-800 font-medium">Transaction History</h4>
                        {studentData.transactions.length ? (
                          studentData.transactions.map((txn: Transaction) => (
                            <p key={txn.id || txn.date} className="text-red-800">
                              {new Date(txn.date).toLocaleString()}: {txn.amount.toLocaleString()} JMD - {txn.status}
                            </p>
                          ))
                        ) : (
                          <p className="text-red-800">No transactions.</p>
                        )}
                      </div>
                      {studentData.balance > 0 && (
                        <CheckoutPage balance={studentData.balance} onPaymentSuccess={handlePaymentSuccess} />
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                      <h3 className="text-lg font-semibold text-red-800 mb-4">Enroll in Courses</h3>
                      {allCourses.length ? (
                        allCourses.map((course: Course) => (
                          <div key={course.id} className="mb-2 flex justify-between items-center">
                            <p className="text-red-800">{course.name} (Fee: {course.fee.toLocaleString()} JMD)</p>
                            <button
                              onClick={() => handleEnrollCourse(course)}
                              className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
                              disabled={studentData.courses?.some((c) => c.name === course.name)}
                            >
                              {studentData.courses?.some((c) => c.name === course.name) ? "Already Enrolled" : "Enroll"}
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-red-800">No courses available.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}