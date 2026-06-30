"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { doc, setDoc, onSnapshot, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { toast } from "sonner";

const TimerContext = createContext<any>(null);

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function playTimerSound(type: "start" | "break" | "complete") {
  if (typeof window === "undefined") return;
  const isMuted = localStorage.getItem("timer_muted") === "true";
  if (isMuted) return;

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "start") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "break") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(698.46, ctx.currentTime + 0.15); // F5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "complete") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.36); // C6
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (err) {
    console.error("Audio Context playback error:", err);
  }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [user] = useAuthState(auth);
  const [timerState, setTimerState] = useState<any>({
    taskId: null,
    taskTitle: "",
    status: "stopped", // running, paused, stopped
    mode: "focus", // focus, shortBreak, longBreak
    remainingSeconds: 1500,
    focusDurationSeconds: 1500,
    startedAt: null,
    pausedAt: null,
    focusSessions: 0,
    lastUpdated: Date.now(),
  });
  const [isMuted, setIsMuted] = useState(false);
  const [analytics, setAnalytics] = useState<any[]>([]);

  const intervalRef = useRef<any>(null);

  // Load muted state
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMuted(localStorage.getItem("timer_muted") === "true");
    }
  }, []);

  // Listen to Firestore timer state in real time
  useEffect(() => {
    if (!user) {
      setTimerState({
        taskId: null,
        taskTitle: "",
        status: "stopped",
        mode: "focus",
        remainingSeconds: 1500,
        focusDurationSeconds: 1500,
        startedAt: null,
        pausedAt: null,
        focusSessions: 0,
        lastUpdated: Date.now(),
      });
      return;
    }

    const docRef = doc(db, "users", user.uid, "timer", "current");
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let remaining = data.remainingSeconds;

        // Restore running timer precisely via timestamps
        if (data.status === "running" && data.startedAt) {
          const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
          remaining = Math.max(0, data.remainingSeconds - elapsed);
        }

        setTimerState({
          ...data,
          remainingSeconds: remaining,
        });
      }
    }, (err) => {
      console.error("Timer onSnapshot error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/timer/current`);
    });

    fetchAnalytics();

    return () => unsubscribe();
  }, [user]);

  // Synchronized browser interval
  useEffect(() => {
    if (timerState.status === "running" && timerState.remainingSeconds > 0) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setTimerState((prev: any) => {
            if (prev.remainingSeconds <= 1) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              handleTimerComplete(prev);
              return { ...prev, remainingSeconds: 0, status: "stopped" };
            }
            return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
          });
        }, 1000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerState.status, timerState.remainingSeconds]);

  // Handle active vs tab-inactive state auto-pause
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && timerState.status === "running") {
        console.log("Tab inactive. Auto-pausing timer...");
        pauseTimer();
        toast("Timer Auto-Paused", {
          description: "Focus timer was paused because your browser tab became inactive.",
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [timerState.status]);

  async function fetchAnalytics() {
    if (!user) return;
    try {
      const q = query(collection(db, "users", user.uid, "focusSessions"));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => doc.data());
      setAnalytics(data);
    } catch (err) {
      console.error("Error loading timer analytics:", err);
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/focusSessions`);
    }
  }

  // Timer complete flow
  async function handleTimerComplete(stateBeforeComplete: any) {
    playTimerSound("complete");

    if (!user) return;

    try {
      const nextSessions = stateBeforeComplete.mode === "focus"
        ? stateBeforeComplete.focusSessions + 1
        : stateBeforeComplete.focusSessions;

      let nextMode = "focus";
      let nextDuration = stateBeforeComplete.focusDurationSeconds || 1500;

      if (stateBeforeComplete.mode === "focus") {
        // Log focus session
        await addDoc(collection(db, "users", user.uid, "focusSessions"), {
          taskId: stateBeforeComplete.taskId,
          taskTitle: stateBeforeComplete.taskTitle,
          mode: "focus",
          durationSeconds: stateBeforeComplete.focusDurationSeconds || 1500,
          interrupted: false,
          completedAt: Date.now(),
          dateString: getTodayDateString(),
        });

        // Trigger break suggestion
        if (nextSessions % 4 === 0) {
          nextMode = "longBreak";
          nextDuration = 900;
          toast.success("🏆 Focus block completed!", {
            description: "Superb! You completed 4 focus sessions. Time for a 15-minute long break!",
          });
          playTimerSound("break");
        } else {
          nextMode = "shortBreak";
          nextDuration = 300;
          toast.success("🎯 Focus session completed!", {
            description: "Great job! Take a 5-minute short break to refresh.",
          });
          playTimerSound("break");
        }
      } else {
        toast.info("☕ Break finished!", {
          description: "Break is over. Let's get back to deep work!",
        });
        playTimerSound("start");
      }

      await saveTimerState({
        ...stateBeforeComplete,
        remainingSeconds: nextDuration,
        mode: nextMode,
        status: "stopped",
        startedAt: null,
        pausedAt: null,
        focusSessions: nextSessions,
        lastUpdated: Date.now(),
      });

      fetchAnalytics();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/focusSessions`);
    }
  }

  async function saveTimerState(newState: any) {
    if (!user) return;
    const docRef = doc(db, "users", user.uid, "timer", "current");
    try {
      await setDoc(docRef, newState);
      setTimerState(newState);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/timer/current`);
    }
  }

  // Start focus timer
  async function startTimer(taskId: string, taskTitle: string) {
    playTimerSound("start");

    const defaultSeconds = timerState.mode === "focus" ? (timerState.focusDurationSeconds || 1500) : (timerState.mode === "shortBreak" ? 300 : 900);

    const newState = {
      ...timerState,
      taskId,
      taskTitle,
      status: "running",
      startedAt: Date.now(),
      remainingSeconds: timerState.taskId === taskId ? timerState.remainingSeconds : defaultSeconds,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
  }

  // Pause
  async function pauseTimer() {
    if (timerState.status !== "running") return;
    const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
    const updatedRemaining = Math.max(0, timerState.remainingSeconds - elapsed);

    const newState = {
      ...timerState,
      status: "paused",
      remainingSeconds: updatedRemaining,
      startedAt: null,
      pausedAt: Date.now(),
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
  }

  // Resume
  async function resumeTimer() {
    if (timerState.status !== "paused") return;
    const newState = {
      ...timerState,
      status: "running",
      startedAt: Date.now(),
      pausedAt: null,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
    playTimerSound("start");
  }

  // Stop
  async function stopTimer() {
    // Interrupted log if it was running and in focus mode
    if (timerState.status === "running" && timerState.mode === "focus" && user) {
      try {
        await addDoc(collection(db, "users", user.uid, "focusSessions"), {
          taskId: timerState.taskId,
          taskTitle: timerState.taskTitle,
          mode: "focus",
          durationSeconds: Math.max(0, (timerState.focusDurationSeconds || 1500) - timerState.remainingSeconds),
          interrupted: true,
          completedAt: Date.now(),
          dateString: getTodayDateString(),
        });
        fetchAnalytics();
      } catch (err) {
        console.error("Failed to log interrupted session:", err);
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/focusSessions`);
      }
    }

    const defaultSeconds = timerState.mode === "focus" ? (timerState.focusDurationSeconds || 1500) : (timerState.mode === "shortBreak" ? 300 : 900);

    const newState = {
      ...timerState,
      status: "stopped",
      remainingSeconds: defaultSeconds,
      startedAt: null,
      pausedAt: null,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
  }

  // Restart
  async function restartTimer() {
    const defaultSeconds = timerState.mode === "focus" ? (timerState.focusDurationSeconds || 1500) : (timerState.mode === "shortBreak" ? 300 : 900);
    const newState = {
      ...timerState,
      status: "running",
      remainingSeconds: defaultSeconds,
      startedAt: Date.now(),
      pausedAt: null,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
    playTimerSound("start");
  }

  // Toggle Mute
  function toggleMute() {
    const muteVal = !isMuted;
    setIsMuted(muteVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("timer_muted", String(muteVal));
    }
  }

  // Skip Break
  async function skipBreak() {
    const newState = {
      ...timerState,
      mode: "focus",
      status: "stopped",
      remainingSeconds: timerState.focusDurationSeconds || 1500,
      startedAt: null,
      pausedAt: null,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
    toast.info(`Break skipped. Loaded ${Math.round((timerState.focusDurationSeconds || 1500) / 60)}-minute focus block.`);
  }

  // Adjust Focus Duration
  async function adjustFocusDuration(minutes: number) {
    const seconds = minutes * 60;
    const newState = {
      ...timerState,
      focusDurationSeconds: seconds,
      remainingSeconds: timerState.status === "stopped" && timerState.mode === "focus" ? seconds : timerState.remainingSeconds,
      lastUpdated: Date.now(),
    };
    await saveTimerState(newState);
    toast.success(`⏱ Focus duration adjusted to ${minutes} minutes!`);
  }

  return (
    <TimerContext.Provider
      value={{
        timerState,
        isMuted,
        analytics,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        restartTimer,
        toggleMute,
        skipBreak,
        adjustFocusDuration,
        fetchAnalytics,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error("useTimer must be used within a TimerProvider");
  return context;
}
