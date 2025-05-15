"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, getDoc, doc, updateDoc, addDoc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";

interface Assignment {
  id: string;
  courseId: string;
  courseCode?: string;
  courseName?: string;
  title: string;
  description: string;
  points: number;
  createdAt: string;
  dueDate?: string;
  studentId?: string; // For individual assignments
}

export default function AssignmentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [courses, setCourses] = useState<{id: string, name: string, code: string}[]>([]);
  const [students, setStudents] = useState<{id: string, name: string}[]>([]);
  
  // Sample assignments data
  const sampleAssignments: Assignment[] = [
    {
      id: "a1",
      courseId: "c1",
      courseCode: "CS101",
      courseName: "Introduction to Computer Science",
      title: "Basic Programming Concepts",
      description: "Write a program that demonstrates basic programming concepts like variables, loops, and conditionals.",
      points: 100,
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week from now
    },
    {
      id: "a2",
      courseId: "c2",
      courseCode: "MATH201",
      courseName: "Calculus I",
      title: "Derivatives Practice",
      description: "Complete the practice problems on derivatives found in Chapter 3.",
      points: 75,
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days from now
    },
    {
      id: "a3",
      courseId: "c3",
      courseCode: "ENG101",
      courseName: "English Composition",
      title: "Essay: My Future Career",
      description: "Write a 1000-word essay about your future career aspirations.",
      points: 150,
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 2 weeks from now
    }
  ];

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Simulate loading user role from Firebase
    const checkUser = async () => {
      try {
        setIsLoading(true);
        if (!user || !user.uid) {
          console.error("User not authenticated");
          setIsLoading(false);
          return;
        }
        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData?.role || "student");
          
          // Mock student list for teachers
          if (userData?.role === "teacher") {
            setStudents([
              { id: "s1", name: "John Doe" },
              { id: "s2", name: "Jane Smith" },
              { id: "s3", name: "Alice Johnson" }
            ]);
          }
        }
        
        // In a real implementation, fetch assignments from Firebase
        // For now, use sample data
        setAssignments(sampleAssignments);
        
        // Mock course list
        setCourses([
          { id: "c1", name: "Introduction to Computer Science", code: "CS101" },
          { id: "c2", name: "Calculus I", code: "MATH201" },
          { id: "c3", name: "English Composition", code: "ENG101" }
        ]);
        
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching user data:", error);
        setIsLoading(false);
      }
    };

    checkUser();
  }, [user, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-xl text-gray-700 dark:text-gray-300">Loading...</p>
      </div>
    );
  }

  // Filter assignments based on role and selections
  const filteredAssignments = assignments.filter(assignment => {
    if (userRole === "teacher") {
      if (selectedCourse && assignment.courseId !== selectedCourse) {
        return false;
      }
      if (selectedStudent && assignment.studentId !== selectedStudent) {
        return false;
      }
      return true;
    } else {
      // For students, show all assignments for now
      // In a real implementation, show only assignments for their courses
      return true;
    }
  });

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Assignments</h1>
          <Link 
            href="/dashboard" 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Coming Soon Notice */}
        <div className="bg-amber-100 dark:bg-amber-900 border-l-4 border-amber-500 p-4 mb-6 rounded-md">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-amber-700 dark:text-amber-300 font-bold">Coming Soon - Future Update</p>
              <p className="text-amber-700 dark:text-amber-300">
                Enhanced assignment management features are under development. This page shows a preview of upcoming functionality.
              </p>
            </div>
          </div>
        </div>

        {/* Teacher Create Assignment Section */}
        {userRole === "teacher" && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Create New Assignment</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course</label>
                <select 
                  value={selectedCourse} 
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select Course</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Student (Optional)</label>
                <select 
                  value={selectedStudent} 
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Students</option>
                  {students.map(student => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input type="text" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"></textarea>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Points</label>
                  <input type="number" min="0" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                  <input type="date" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
              </div>
              
              <button 
                type="button" 
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => alert("This feature will be available in a future update.")}
              >
                Create Assignment
              </button>
            </form>
          </div>
        )}

        {/* Filter Options for Viewing */}
        {userRole === "teacher" && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4">
            <div className="flex-grow max-w-xs">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Course</label>
              <select 
                value={selectedCourse} 
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">All Courses</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex-grow max-w-xs">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Student</label>
              <select 
                value={selectedStudent} 
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">All Students</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Assignments List */}
        <div className="space-y-6">
          {filteredAssignments.length > 0 ? (
            filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="overflow-hidden bg-white dark:bg-gray-800">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div className="flex-grow">
                      <div className="flex items-center mb-2">
                        <span className="text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded mr-2">
                          {assignment.courseCode}
                        </span>
                        {assignment.studentId && (
                          <span className="text-sm font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
                            Individual Assignment
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{assignment.title}</h3>
                      <p className="text-gray-600 dark:text-gray-300 mb-4">{assignment.description}</p>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <div>
                          <span className="font-medium">Points:</span> {assignment.points}
                        </div>
                        <div>
                          <span className="font-medium">Created:</span> {new Date(assignment.createdAt).toLocaleDateString()}
                        </div>
                        {assignment.dueDate && (
                          <div>
                            <span className="font-medium">Due:</span> {new Date(assignment.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 min-w-[120px]">
                      <button 
                        type="button" 
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        onClick={() => alert("This feature will be available in a future update.")}
                      >
                        View Details
                      </button>
                      
                      {userRole === "student" && (
                        <button 
                          type="button" 
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                          onClick={() => alert("This feature will be available in a future update.")}
                        >
                          Submit Assignment
                        </button>
                      )}
                      
                      {userRole === "teacher" && (
                        <button 
                          type="button" 
                          className="px-4 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 transition-colors"
                          onClick={() => alert("This feature will be available in a future update.")}
                        >
                          Grade Submissions
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md text-center">
              <p className="text-gray-600 dark:text-gray-300">No assignments found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
