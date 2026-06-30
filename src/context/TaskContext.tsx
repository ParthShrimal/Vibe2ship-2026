"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getTasks,
  markTaskMissed,
} from "@/services/taskService";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

const TaskContext = createContext<any>(null);

export function TaskProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user] = useAuthState(auth);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newMissedTasks, setNewMissedTasks] = useState<any[]>([]);

  async function refreshTasks() {
    if (!user) {
      setTasks([]);
      setLoaded(true);
      setNewMissedTasks([]);
      return;
    }

    let data = await getTasks(user.uid);
    const now = Date.now();
    let changed = false;
    const newlyMissed: any[] = [];

    for (const task of data as any[]) {
      if (
        (!task.status || task.status === "active") &&
        task.deadline &&
        new Date(task.deadline).getTime() < now
      ) {
        newlyMissed.push(task);
        await markTaskMissed(task.id);

        // Add a notification to Firestore notifications collection
        try {
          await addDoc(collection(db, "users", user.uid, "notifications"), {
            title: "⚠️ Deadline Missed",
            message: `You missed the deadline for task: "${task.title}".`,
            createdAt: Date.now(),
            read: false,
            type: "deadline",
          });
        } catch (err) {
          console.error("Failed to add missed task notification:", err);
        }

        changed = true;
      }
    }

    if (changed) {
      data = await getTasks(user.uid);
    }

    setTasks(data);
    setLoaded(true);
    setNewMissedTasks(newlyMissed);
  }

  useEffect(() => {
    refreshTasks();
    const interval = setInterval(() => {
      refreshTasks();
    }, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, [user]);

  return (
    <TaskContext.Provider
      value={{
        tasks,
        refreshTasks,
        newMissedTasks,
        loaded,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  return useContext(TaskContext);
}
