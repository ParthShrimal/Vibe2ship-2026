import {
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

import { db, handleFirestoreError, OperationType } from "@/lib/firebase";

// Helper functions for Local Storage sync/fallback
function getLocalTasks(userId: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `deadline_guardian_tasks_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to read from localStorage:", e);
    return [];
  }
}

function saveLocalTasks(userId: string, tasks: any[]) {
  if (typeof window === "undefined") return;
  try {
    const key = `deadline_guardian_tasks_${userId}`;
    localStorage.setItem(key, JSON.stringify(tasks));
  } catch (e) {
    console.error("Failed to write to localStorage:", e);
  }
}

export async function createTask(task: any, userId?: string) {
  const uid = userId || "anonymous";
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const newTask = {
    id: taskId,
    ...task,
    userId: userId || null,
    status: "active",
    createdAt: Date.now(),
    completedAt: null,
    missedAt: null,
    missedPopupShown: true,
  };

  // 1. Instantly save to local storage for zero-lag and offline/iframe reliability
  const local = getLocalTasks(uid);
  local.unshift(newTask);
  saveLocalTasks(uid, local);

  // 2. Perform Firestore save asynchronously and gracefully using the same permanent ID
  if (userId) {
    try {
      const dbPromise = setDoc(doc(db, "tasks", newTask.id), {
        title: newTask.title,
        description: newTask.description || "",
        deadline: newTask.deadline,
        priority: newTask.priority,
        estimatedHours: newTask.estimatedHours || 0,
        userId: newTask.userId,
        status: newTask.status,
        createdAt: newTask.createdAt,
        completedAt: newTask.completedAt,
        missedAt: newTask.missedAt,
        missedPopupShown: newTask.missedPopupShown,
      });

      // Timeout firestore write attempt after 4 seconds to never hang the UI
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout saving to cloud")), 4000)
      );

      await Promise.race([dbPromise, timeoutPromise]);
      return { id: newTask.id };
    } catch (error) {
      console.warn("Firestore sync failed, task preserved in local storage:", error);
      return { id: newTask.id };
    }
  }

  return { id: newTask.id };
}

export async function getTasks(userId?: string) {
  const uid = userId || "anonymous";
  const localTasks = getLocalTasks(uid);

  if (!userId) {
    return localTasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  try {
    const q = query(collection(db, "tasks"), where("userId", "==", userId));
    
    const dbPromise = getDocs(q);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout reading from cloud")), 3500)
    );

    const snapshot = await Promise.race([dbPromise, timeoutPromise]);

    if (snapshot && snapshot.docs) {
      const dbTasks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // Merge local tasks with Firestore tasks by ID
      const mergedMap = new Map();
      localTasks.forEach(t => {
        if (t && t.id) {
          mergedMap.set(t.id, t);
        }
      });
      dbTasks.forEach(t => {
        if (t && t.id) {
          const local = mergedMap.get(t.id);
          // If the task was completed or missed locally, preserve that status so we don't overwrite it with stale cloud data
          if (local && (local.status === "completed" || local.status === "missed")) {
            mergedMap.set(t.id, { ...t, ...local });
          } else {
            mergedMap.set(t.id, t);
          }
        }
      });

      const merged = Array.from(mergedMap.values());
      saveLocalTasks(uid, merged);
      return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (error) {
    console.warn("Firestore fetch failed, serving offline cache:", error);
  }

  return localTasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteTask(id: string) {
  // 1. Instantly remove from Local Storage
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    if (key.startsWith("deadline_guardian_tasks_")) {
      try {
        const local = JSON.parse(localStorage.getItem(key) || "[]");
        const filtered = local.filter((t: any) => t.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) {
        console.error(e);
      }
    }
  }

  // 2. Perform Firestore delete asynchronously
  if (!id.startsWith("local_")) {
    try {
      await deleteDoc(doc(db, "tasks", id));
    } catch (error) {
      console.warn("Firestore delete failed, local removal preserved:", error);
    }
  }
}

export async function markTaskCompleted(id: string) {
  // 1. Instantly mark as completed in Local Storage
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    if (key.startsWith("deadline_guardian_tasks_")) {
      try {
        const local = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = local.findIndex((t: any) => t.id === id);
        if (idx !== -1) {
          local[idx].status = "completed";
          local[idx].completedAt = Date.now();
          localStorage.setItem(key, JSON.stringify(local));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // 2. Perform Firestore update asynchronously
  if (!id.startsWith("local_")) {
    try {
      await updateDoc(doc(db, "tasks", id), {
        status: "completed",
        completedAt: Date.now(),
      });
    } catch (error) {
      console.warn("Firestore mark completed failed, local update preserved:", error);
    }
  }
}

export async function markTaskMissed(id: string) {
  // 1. Instantly mark as missed in Local Storage
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    if (key.startsWith("deadline_guardian_tasks_")) {
      try {
        const local = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = local.findIndex((t: any) => t.id === id);
        if (idx !== -1) {
          local[idx].status = "missed";
          local[idx].missedAt = Date.now();
          local[idx].missedPopupShown = false;
          localStorage.setItem(key, JSON.stringify(local));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // 2. Perform Firestore update asynchronously
  if (!id.startsWith("local_")) {
    try {
      await updateDoc(doc(db, "tasks", id), {
        status: "missed",
        missedAt: Date.now(),
        missedPopupShown: false,
      });
    } catch (error) {
      console.warn("Firestore mark missed failed, local update preserved:", error);
    }
  }
}

export async function getUnseenMissedTasks(userId?: string) {
  try {
    const allTasks = await getTasks(userId);
    return allTasks.filter(
      (task: any) =>
        task.status === "missed" &&
        task.missedPopupShown === false
    );
  } catch (error) {
    console.error("Error fetching unseen missed tasks:", error);
    return [];
  }
}

export async function markMissedPopupSeen(id: string) {
  // 1. Instantly mark popup as seen in Local Storage
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    if (key.startsWith("deadline_guardian_tasks_")) {
      try {
        const local = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = local.findIndex((t: any) => t.id === id);
        if (idx !== -1) {
          local[idx].missedPopupShown = true;
          localStorage.setItem(key, JSON.stringify(local));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // 2. Perform Firestore update
  if (!id.startsWith("local_")) {
    try {
      await updateDoc(doc(db, "tasks", id), {
        missedPopupShown: true,
      });
    } catch (error) {
      console.warn("Firestore mark popup seen failed:", error);
    }
  }
}


