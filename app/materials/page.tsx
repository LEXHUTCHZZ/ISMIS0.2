"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, getDoc, doc, updateDoc, addDoc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";

interface Resource {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'link';
  url: string;
  description: string;
  uploadedBy: string;
  uploadedAt: Date;
  courseCode?: string;
  recipientId?: string;
}

export default function MaterialsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string>("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [studentsList, setStudentsList] = useState<{id: string, name: string}[]>([]);
  
  // Sample resources data
  const sampleResources: Resource[] = [
    {
      id: "r1",
      title: "Introduction to Programming",
      type: "pdf",
      url: "https://example.com/intro-to-programming.pdf",
      description: "A comprehensive guide to programming fundamentals",
      uploadedBy: "Teacher 1",
      uploadedAt: new Date(),
      courseCode: "CS101"
    },
    {
      id: "r2",
      title: "Data Structures Tutorial",
      type: "video",
      url: "https://example.com/data-structures",
      description: "Video tutorial on data structures",
      uploadedBy: "Teacher 2",
      uploadedAt: new Date(),
      courseCode: "CS201"
    },
    {
      id: "r3",
      title: "Learn JavaScript",
      type: "link",
      url: "https://javascript.info",
      description: "Resources for learning JavaScript",
      uploadedBy: "Teacher 1",
      uploadedAt: new Date(),
      courseCode: "WEB101"
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
            setStudentsList([
              { id: "s1", name: "John Doe" },
              { id: "s2", name: "Jane Smith" },
              { id: "s3", name: "Alice Johnson" }
            ]);
          }
        }
        
        // In a real implementation, fetch resources from Firebase
        // For now, use sample data
        setResources(sampleResources);
        
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Learning Materials</h1>
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
                Enhanced materials management features are under development. This page shows a preview of upcoming functionality.
              </p>
            </div>
          </div>
        </div>

        {/* Teacher Upload Section */}
        {userRole === "teacher" && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Upload New Material</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipient</label>
              <select 
                value={selectedRecipient} 
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">All Students</option>
                {studentsList.map(student => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </div>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input type="text" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="pdf">PDF</option>
                  <option value="video">Video</option>
                  <option value="link">Link</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                <input type="url" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"></textarea>
              </div>
              
              <button 
                type="button" 
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => alert("This feature will be available in a future update.")}
              >
                Upload Material
              </button>
            </form>
          </div>
        )}

        {/* Materials List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Card key={resource.id} className="overflow-hidden bg-white dark:bg-gray-800 h-full flex flex-col">
              <CardContent className="p-4 flex-grow">
                <div className="flex items-center justify-between">
                  <div className="rounded-full px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 uppercase">
                    {resource.type}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {resource.courseCode}
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold mt-2 mb-1 text-gray-800 dark:text-white">{resource.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{resource.description}</p>
                
                <div className="mt-auto">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Uploaded by: {resource.uploadedBy} • {resource.uploadedAt.toLocaleDateString()}
                  </div>
                  
                  <a 
                    href={resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors inline-block"
                  >
                    View Material
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
