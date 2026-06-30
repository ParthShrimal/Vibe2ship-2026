"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { useTasks } from "./TaskContext";
import { toast } from "sonner";
import { getClientTime } from "@/lib/date";

const DashboardContext = createContext<any>(null);

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPlainObject(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
}

function cleanData(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(cleanData);
  }
  if (typeof obj === "object") {
    if (!isPlainObject(obj)) {
      if (typeof obj.toJSON === "function") {
        try {
          return obj.toJSON();
        } catch {
          return String(obj);
        }
      }
      return String(obj);
    }
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cleaned[key] = cleanData(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

function cleanTaskForApi(t: any): any {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    deadline: t.deadline,
    priority: t.priority,
    estimatedHours: t.estimatedHours,
    status: t.status,
    createdAt: t.createdAt,
  };
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [user] = useAuthState(auth);
  const { tasks } = useTasks();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAction, setGeneratingAction] = useState<"day" | "coach" | "rescue" | null>(null);

  // Real-time listener for the user's dashboard document
  useEffect(() => {
    if (!user) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fast local storage cache fallback for iframe/refresh reliability
    const localDashKey = `deadline_guardian_dashboard_${user.uid}`;
    try {
      const cached = localStorage.getItem(localDashKey);
      if (cached) {
        setDashboard(JSON.parse(cached));
      }
    } catch (e) {
      console.error("Failed to load cached dashboard", e);
    }

    const docRef = doc(db, "users", user.uid, "dashboard", "current");

    const unsubscribe = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const todayStr = getTodayDateString();

        if (data.date !== todayStr) {
          // Rolling over to a new day!
          console.log("Rollover detected: stored date is", data.date, "but today is", todayStr);
          await handleDailyReset(user.uid, data, todayStr);
        } else {
          setDashboard(data);
          try {
            localStorage.setItem(localDashKey, JSON.stringify(data));
          } catch (e) {
            console.error("Failed to save dashboard to cache", e);
          }
          setLoading(false);
        }
      } else {
        // First-time user setup
        console.log("Creating new dashboard document for user:", user.uid);
        const todayStr = getTodayDateString();
        const initDash = {
          date: todayStr,
          todayPlan: null,
          coach: null,
          rescue: null,
          urgentTask: null,
          activeView: null,
          lastUpdated: Date.now(),
          productivityScore: 100,
          calendarSyncStatus: "not_synced",
          pendingNotificationsCount: 0,
        };
        try {
          await setDoc(docRef, initDash);
          setDashboard(initDash);
          localStorage.setItem(localDashKey, JSON.stringify(initDash));
          setLoading(false);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/dashboard/current`);
        }
      }
    }, (err) => {
      console.error("Dashboard onSnapshot error:", err);
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/dashboard/current`);
    });

    return () => unsubscribe();
  }, [user]);

  // Archive old dashboard and create a fresh one
  async function handleDailyReset(uid: string, oldData: any, todayStr: string) {
    try {
      if (!oldData || !oldData.date) {
        console.warn("handleDailyReset: oldData or oldData.date is missing/invalid. Initializing today's dashboard directly.");
      } else {
        // 1. Archive previous day's dashboard in a subcollection
        const archiveRef = doc(db, "users", uid, "dashboardHistory", oldData.date);
        await setDoc(archiveRef, oldData);
      }

      // 2. Prepare empty dashboard for today
      const freshDash = {
        date: todayStr,
        todayPlan: null,
        coach: null,
        rescue: null,
        urgentTask: null,
        activeView: null,
        lastUpdated: Date.now(),
        productivityScore: 100,
        calendarSyncStatus: "not_synced",
        pendingNotificationsCount: 1, // Start with rollover notification
      };

      setDashboard(freshDash);
      try {
        localStorage.setItem(`deadline_guardian_dashboard_${uid}`, JSON.stringify(freshDash));
      } catch (e) {
        console.error("Failed to update dashboard cache during rollover reset", e);
      }

      const docRef = doc(db, "users", uid, "dashboard", "current");
      await setDoc(docRef, freshDash);

      // 3. Save a rollover notification
      const notifRef = collection(db, "users", uid, "notifications");
      await addDoc(notifRef, {
        title: "🌅 New Day Prepared",
        message: "Your previous day's dashboard has been archived and a fresh schedule is ready!",
        createdAt: Date.now(),
        read: false,
        type: "system",
      });

      toast("🌅 New Day Prepared", {
        description: "Your previous day's dashboard has been archived and a fresh schedule is ready!",
      });

      // 4. Trigger auto-generation of the fresh day's schedule & coach advice if there are active tasks
      const activeTasks = tasks.filter((t: any) => t.status === "active");
      if (activeTasks.length > 0) {
        triggerAutoGeneration(uid, todayStr, activeTasks);
      }
    } catch (err) {
      console.error("Error in handleDailyReset:", err);
    }
  }

  // Trigger auto-generation of new schedule & coach advice
  async function triggerAutoGeneration(uid: string, todayStr: string, activeTasks: any[]) {
    try {
      console.log("Auto-generating plan & coach advice for rollover...");
      
      // Auto Generate Schedule
      const planRes = await fetch("/api/generate-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: activeTasks.map(cleanTaskForApi), clientTime: getClientTime() }),
      });
      const planData = await planRes.json();

      // Auto Generate AI Coach Advice
      const coachRes = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: activeTasks.map(cleanTaskForApi), clientTime: getClientTime() }),
      });
      const coachData = await coachRes.json();

      const generatedDash = {
        date: todayStr,
        todayPlan: planData.success ? planData.plan : null,
        coach: coachData.success ? coachData.advice : null,
        rescue: null,
        urgentTask: null,
        activeView: planData.success ? "day" : null,
        lastUpdated: Date.now(),
        productivityScore: 100,
        calendarSyncStatus: "not_synced",
        pendingNotificationsCount: 1,
      };

      setDashboard(generatedDash);
      try {
        localStorage.setItem(`deadline_guardian_dashboard_${uid}`, JSON.stringify(generatedDash));
      } catch (e) {
        console.error("Failed to update dashboard cache during rollover", e);
      }

      const docRef = doc(db, "users", uid, "dashboard", "current");
      await setDoc(docRef, generatedDash, { merge: true });

      const notifRef = collection(db, "users", uid, "notifications");

      if (planData.success) {
        await addDoc(notifRef, {
          title: "✨ New Schedule Generated",
          message: "Your custom schedule for today has been drafted.",
          createdAt: Date.now(),
          read: false,
          type: "schedule",
        });
      }

      if (coachData.success) {
        await addDoc(notifRef, {
          title: "🤖 New AI Coach Advice",
          message: "Your AI Coach has updated suggestions for your day.",
          createdAt: Date.now(),
          read: false,
          type: "coach",
        });
      }

    } catch (err) {
      console.error("Auto generation failed:", err);
    }
  }

  // Generate My Day
  async function generateMyDay(activeTasks: any[], forceRegenerate = false) {
    if (!user) return;
    if (generatingAction) return;
    if (activeTasks.length === 0) {
      toast("🎉 No active tasks", {
        description: "You're all caught up! Create a task to generate a schedule.",
      });
      return;
    }

    // Return cached if not forcing and we have a plan
    if (!forceRegenerate && dashboard?.todayPlan) {
      await updateActiveView("day");
      return;
    }

    try {
      setGeneratingAction("day");
      const res = await fetch("/api/generate-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: activeTasks.map(cleanTaskForApi), clientTime: getClientTime() }),
      });
      const data = await res.json();

      if (!data.success) throw new Error("Failed to generate schedule");

      await updateDashboardField({
        todayPlan: data.plan,
        activeView: "day",
        lastUpdated: Date.now(),
      });

      // Push notification
      await addNotification("✨ New Schedule Generated", "Your custom schedule for today has been drafted.", "schedule");

      toast.success("Schedule generated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate schedule.");
    } finally {
      setGeneratingAction(null);
    }
  }

  // AI Coach Advice
  async function generateAICoach(activeTasks: any[], forceRegenerate = false) {
    if (!user) return;
    if (generatingAction) return;
    if (activeTasks.length === 0) {
      toast("🎉 No active tasks");
      return;
    }

    if (!forceRegenerate && dashboard?.coach) {
      return dashboard.coach;
    }

    try {
      setGeneratingAction("coach");
      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: activeTasks.map(cleanTaskForApi), clientTime: getClientTime() }),
      });
      const data = await res.json();

      if (!data.success) throw new Error("Failed to generate AI Coach advice");

      await updateDashboardField({
        coach: data.advice,
        lastUpdated: Date.now(),
      });

      await addNotification("🤖 New AI Coach Advice", "Your AI Coach has updated suggestions for your day.", "coach");

      toast.success("AI Coach updated!");
      return data.advice;
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate AI Coach advice.");
      return null;
    } finally {
      setGeneratingAction(null);
    }
  }

  // Rescue Plan
  async function generateRescuePlan(urgentTaskObj: any, forceRegenerate = false) {
    if (!user || !urgentTaskObj) return;
    if (generatingAction) return;

    if (!forceRegenerate && dashboard?.rescue && dashboard?.urgentTask?.id === urgentTaskObj.id) {
      return dashboard.rescue;
    }

    try {
      setGeneratingAction("rescue");
      const res = await fetch("/api/rescue-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: [cleanTaskForApi(urgentTaskObj)], clientTime: getClientTime() }),
      });
      const data = await res.json();

      if (!data.success) throw new Error("Failed to generate Rescue Plan");

      await updateDashboardField({
        rescue: data.plan,
        urgentTask: urgentTaskObj,
        lastUpdated: Date.now(),
      });

      await addNotification("🚨 Rescue Mode Activated", `A Rescue Plan was drafted for: ${urgentTaskObj.title}`, "rescue");

      toast.error("🚨 Rescue Mode Activated!", {
        description: "A recovery plan has been generated to protect your upcoming deadline.",
      });

      return data.plan;
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate Rescue Plan.");
      return null;
    } finally {
      setGeneratingAction(null);
    }
  }

  // Helper to save field update directly to Firestore
  async function updateDashboardField(fields: any) {
    if (!user) return;
    const docRef = doc(db, "users", user.uid, "dashboard", "current");
    const cleaned = cleanData(fields);
    
    // Instantly update local state so UI is immediately responsive and never hangs
    setDashboard((prev: any) => {
      const updated = { ...prev, ...cleaned };
      try {
        localStorage.setItem(`deadline_guardian_dashboard_${user.uid}`, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update dashboard cache", e);
      }
      return updated;
    });

    try {
      const dbPromise = setDoc(docRef, cleaned, { merge: true });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timeout")), 3000)
      );
      await Promise.race([dbPromise, timeoutPromise]);
    } catch (err) {
      console.warn("Firestore update failed or timed out, local state preserved:", err);
    }
  }

  async function updateActiveView(view: "day" | "coach" | "rescue" | null) {
    await updateDashboardField({ activeView: view });
  }

  async function addNotification(title: string, message: string, type: string) {
    if (!user) return;
    const notifRef = collection(db, "users", user.uid, "notifications");
    try {
      const dbPromise = addDoc(notifRef, {
        title,
        message,
        createdAt: Date.now(),
        read: false,
        type,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timeout")), 3000)
      );
      await Promise.race([dbPromise, timeoutPromise]);
    } catch (err) {
      console.warn("Failed to add notification:", err);
    }
  }

  return (
    <DashboardContext.Provider
      value={{
        dashboard,
        loading,
        generatingAction,
        generateMyDay,
        generateAICoach,
        generateRescuePlan,
        updateDashboardField,
        updateActiveView,
        addNotification,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within a DashboardProvider");
  return context;
}
