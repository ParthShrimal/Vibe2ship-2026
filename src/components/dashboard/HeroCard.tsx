"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, AlertTriangle, CalendarDays, RefreshCw, CheckCircle, Flame, Target, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/context/TaskContext";
import { useDashboard } from "@/context/DashboardContext";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { authorizeCalendar, hasLinkedCalendar, unlinkCalendar } from "@/services/calendarAuth";
import { collection, query, onSnapshot } from "firebase/firestore";
import { getUnseenMissedTasks, markMissedPopupSeen } from "@/services/taskService";
import { toast } from "sonner";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export default function HeroCard() {
  const { tasks, loaded, refreshTasks } = useTasks();
  const [user] = useAuthState(auth);
  const {
    dashboard,
    generatingAction,
    generateMyDay,
    generateAICoach,
    generateRescuePlan,
    updateActiveView,
    updateDashboardField,
  } = useDashboard();

  const [showCoach, setShowCoach] = useState(false);
  const [showRescue, setShowRescue] = useState(false);
  const [showMissedPopup, setShowMissedPopup] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState<string | null>(null);
  const [missedTasks, setMissedTasks] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<string[]>([]);

  const [isLinking, setIsLinking] = useState(false);
  const [hasCalendarToken, setHasCalendarToken] = useState(false);

  useEffect(() => {
    setHasCalendarToken(hasLinkedCalendar());
  }, []);

  const handleLinkCalendar = async () => {
    try {
      setIsLinking(true);

      toast.info("Opening Google Authorization... If you see a 'Google hasn't verified this app' warning, click 'Advanced' and then 'Go to' to proceed.", {
        duration: 8000,
      });

      const token = await authorizeCalendar(auth);

      if (token) {
        setHasCalendarToken(true);
        toast.success("📅 Google Calendar authorized successfully!");
      } else {
        toast.error("Failed to acquire access token.");
      }
    } catch (err: any) {
      const isPopupClosed = err.code === "auth/popup-closed-by-user" || err.message?.includes("popup-closed-by-user") || err.code === "auth/cancelled-popup-request" || err.message?.includes("cancelled-popup-request");
      if (!isPopupClosed) {
        console.error(err);
      } else {
        console.warn("Calendar auth popup closed by user.");
      }
      if (isPopupClosed) {
        toast.error("The authorization window was closed before completion.");
      } else {
        toast.error("Failed to link Google Calendar.");
      }
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkCalendar = () => {
    unlinkCalendar();
    setHasCalendarToken(false);
    toast.success("Disconnected Google Calendar.");
  };

  const activeTasks = tasks.filter((task: any) => task.status === "active");

  const highestPriority =
    activeTasks.find((t: any) => t.priority === "High") ||
    activeTasks.find((t: any) => t.priority === "Medium") ||
    activeTasks[0];

  // Listen to notifications to show real-time unread count
  useEffect(() => {
    if (!user) return;
    const qNotif = query(collection(db, "users", user.uid, "notifications"));
    return onSnapshot(qNotif, (snap) => {
      setNotifications(snap.docs.map(d => d.data()));
    }, (err) => {
      console.error("HeroCard onSnapshot error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/notifications`);
    });
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Next Upcoming Deadline
  const nextDeadlineTask = [...activeTasks]
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];

  const getRemainingTimeStr = (deadlineStr: string) => {
    const diffMs = new Date(deadlineStr).getTime() - Date.now();
    if (diffMs <= 0) return "Overdue";
    const totalMins = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);
    
    if (days > 0) {
      const remainingHours = totalHours % 24;
      return `${days}d ${remainingHours}h left`;
    } else {
      const remainingMins = totalMins % 60;
      if (totalHours > 0) {
        return `${totalHours}h ${remainingMins}m left`;
      } else {
        return `${remainingMins}m left`;
      }
    }
  };

  // Productivity Score Calculation (out of 100)
  const completedCount = tasks.filter((t: any) => t.status === "completed").length;
  const missedCount = tasks.filter((t: any) => t.status === "missed").length;
  const closedCount = completedCount + missedCount;
  const completionRate = closedCount > 0 ? (completedCount / closedCount) * 100 : 100;
  // Deduct 15 points per missed task, up to 60 points max
  const productivityScore = Math.max(0, Math.min(100, Math.round(completionRate - missedCount * 15)));

  // Automatic Rescue Plan Generation on Urgent Task (within 10 hours)
  useEffect(() => {
    if (activeTasks.length === 0) return;

    const now = Date.now();
    const urgent = activeTasks.find((task: any) => {
      if (task.status !== "active") return false;
      const hoursLeft = (new Date(task.deadline).getTime() - now) / (1000 * 60 * 60);
      return hoursLeft > 0 && hoursLeft <= 10;
    });

    if (urgent) {
      const hoursLeft = (new Date(urgent.deadline).getTime() - now) / (1000 * 60 * 60);
      const isExtremeUrgent = hoursLeft <= 2;

      const handleRescueTrigger = async () => {
        // Only trigger if not already active or if urgent task changed
        if (dashboard?.urgentTask?.id !== urgent.id) {
          await generateRescuePlan(urgent);
          setShowRescue(true);
          setHasAutoOpened(urgent.id);
        } else if (isExtremeUrgent && hasAutoOpened !== urgent.id) {
          // If less than 2 hours left and we haven't popped up the warning yet in this session, trigger it!
          setShowRescue(true);
          setHasAutoOpened(urgent.id);
        }
      };
      handleRescueTrigger();
    }
  }, [tasks, dashboard?.urgentTask, hasAutoOpened]);

  // Load missed tasks on start and whenever tasks change
  useEffect(() => {
    if (!loaded || !user) return;
    const unseenMissed = tasks.filter(
      (task: any) =>
        task.status === "missed" &&
        task.missedPopupShown === false &&
        !dismissedPopupIds.includes(task.id)
    );
    if (unseenMissed.length > 0) {
      setMissedTasks(unseenMissed);
      setShowMissedPopup(true);
    } else {
      setShowMissedPopup(false);
    }
  }, [loaded, user, tasks, dismissedPopupIds]);

  return (
    <>
      {/* Top Hero Layout */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 p-8 text-white shadow-xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
            <Sparkles size={16} className="animate-spin text-cyan-300" />
            AI Productivity Coach Live
          </div>

          <h1 className="text-4xl font-bold">
            Good {getGreeting()}, {user?.displayName?.split(" ")[0] || "User"} 👋
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-indigo-100">
            You have <strong>{activeTasks.length}</strong> pending task
            {activeTasks.length !== 1 && "s"}.
          </p>

          {activeTasks.length === 0 && (
            <p className="mt-6 text-lg font-medium text-indigo-100">
              🎉 You're all caught up! No active tasks remaining.
            </p>
          )}

          {highestPriority && (
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
                <AlertTriangle className="text-yellow-300 animate-pulse" size={18} />
                <div>
                  <p className="text-xs text-indigo-100">Highest Priority</p>
                  <p className="font-semibold">{highestPriority.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
                <CalendarDays className="text-cyan-300" size={18} />
                <div>
                  <p className="text-xs text-indigo-100">Due</p>
                  <p className="font-semibold">
                    {new Date(highestPriority.deadline).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Button
              size="lg"
              className="bg-white text-indigo-700 hover:bg-slate-100 shadow-md border-0"
              onClick={() => generateMyDay(activeTasks)}
              disabled={generatingAction === "day"}
            >
              {generatingAction === "day" ? "Generating..." : "✨ Generate My Day"}
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="bg-indigo-500 text-white hover:bg-indigo-400 shadow-md border-0"
              onClick={async () => {
                const adv = await generateAICoach(activeTasks);
                if (adv) setShowCoach(true);
              }}
              disabled={generatingAction === "coach"}
            >
              {generatingAction === "coach" ? "Thinking..." : "🤖 AI Coach"}
            </Button>
          </div>
        </div>
      </div>

      {/* QUICK STATISTICS CARDS & METRIC GRID (Feature 17 Dashboard Improvements) */}
      <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target size={13} className="text-indigo-500" />
            Productivity Score
          </p>
          <p className="text-2xl font-bold mt-1 text-indigo-500">{productivityScore}/100</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Hourglass size={13} className="text-amber-500" />
            Next Deadline
          </p>
          <p className="text-sm font-semibold mt-1 truncate">
            {nextDeadlineTask ? `${getRemainingTimeStr(nextDeadlineTask.deadline)} (${nextDeadlineTask.title})` : "None"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <RefreshCw size={13} className="text-emerald-500" />
            Last AI Update
          </p>
          <p className="text-xs font-semibold mt-1.5">
            {dashboard?.lastUpdated ? new Date(dashboard.lastUpdated).toLocaleTimeString() : "Never"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles size={13} className="text-pink-500" />
            AI Status
          </p>
          <p className="text-xs font-semibold mt-1.5 text-emerald-500 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            Ready / Online
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays size={13} className="text-blue-500" />
            Google Calendar
          </p>
          {hasCalendarToken ? (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-500">Linked</span>
              <button
                onClick={handleUnlinkCalendar}
                className="text-[10px] text-muted-foreground hover:text-red-500 underline transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-500">Not Linked</span>
              <button
                onClick={handleLinkCalendar}
                disabled={isLinking}
                className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold underline transition-colors"
              >
                {isLinking ? "Linking..." : "Link Now"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-500" />
            Unread Alerts
          </p>
          <p className="text-2xl font-bold mt-1 text-red-500">{unreadCount}</p>
        </div>
      </div>

      {/* AI ALERT FOR RESCUE MODE */}
      {dashboard?.rescue && dashboard?.urgentTask && (
        <div className="mt-6 rounded-3xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-6 shadow-lg transition-colors">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
                🚨 Rescue Mode Active
              </h2>
              <p className="mt-2 text-foreground">
                <b>{dashboard.urgentTask.title}</b> is due shortly and needs emergency attention!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Risk: {dashboard.rescue.riskLevel} | Chance of finish: {dashboard.rescue.completionChance}%
              </p>
            </div>
            <Button variant="destructive" onClick={() => setShowRescue(true)}>
              View Rescue Plan
            </Button>
          </div>
        </div>
      )}

      {/* AI PLAN DISPLAY CONTAINER */}
      {dashboard?.activeView === "day" && dashboard?.todayPlan && (
        <div className="mt-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-6 shadow-lg transition-colors duration-300">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              📅 Today's AI Schedule
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateMyDay(activeTasks, true)}
              disabled={generatingAction === "day"}
              className="flex items-center gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={14} className={generatingAction === "day" ? "animate-spin" : ""} />
              Regenerate Plan
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100 font-mono text-sm leading-relaxed bg-zinc-50 dark:bg-zinc-950/40 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/40">
            {dashboard.todayPlan}
          </pre>
        </div>
      )}

      {/* AI COACH POPUP */}
      {showCoach && dashboard?.coach && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowCoach(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl transition-all duration-300 text-zinc-900 dark:text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-5 top-5 text-xl text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
              onClick={() => setShowCoach(false)}
            >
              ✕
            </button>

            <h2 className="mb-6 text-2xl font-bold flex items-center gap-2">
              🤖 AI Coach Advice
            </h2>

            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Highest Priority</p>
                <p className="font-semibold text-indigo-500 text-lg mt-0.5">{dashboard.coach.highestPriority}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Recommended Start</p>
                <p className="font-semibold text-lg mt-0.5">{dashboard.coach.startTime}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">AI Strategy Message</p>
                <p className="text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">{dashboard.coach.message}</p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => generateAICoach(activeTasks, true)}
                disabled={generatingAction === "coach"}
                className="flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={generatingAction === "coach" ? "animate-spin" : ""} />
                Regenerate Advice
              </Button>
              <Button onClick={() => setShowCoach(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* RESCUE PLAN POPUP */}
      {showRescue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowRescue(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl transition-all duration-300 text-zinc-900 dark:text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-5 top-5 text-xl text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
              onClick={() => setShowRescue(false)}
            >
              ✕
            </button>

            <h2 className="mb-6 text-2xl font-bold text-red-600 flex items-center gap-2">
              🚨 Emergency Rescue Mode
            </h2>

            {!dashboard?.rescue || generatingAction === "rescue" ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative mb-6">
                  <div className="h-16 w-16 animate-ping rounded-full bg-red-500/20 absolute" />
                  <div className="h-16 w-16 rounded-full bg-red-600 flex items-center justify-center text-white relative animate-pulse shadow-lg shadow-red-500/50">
                    <Hourglass size={32} className="animate-spin duration-[3000ms]" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-red-600 dark:text-red-500">Activating Rescue Mode...</h3>
                <p className="mt-2 text-zinc-500 dark:text-zinc-400 max-w-sm text-sm">
                  The Deadline Guardian is drafting a synchronized timeline and strategy to rescue your upcoming deadline.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950/20 p-4 border border-red-200 dark:border-red-950/40">
                  <p className="text-xs text-red-700 dark:text-red-400 uppercase tracking-wider font-semibold">Emergency Task</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{dashboard.urgentTask?.title}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800/40">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Risk Level</p>
                    <p className="font-bold text-red-500 text-lg mt-0.5">{dashboard.rescue.riskLevel}</p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800/40">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Time Remaining</p>
                    <p className="font-bold text-zinc-700 dark:text-zinc-300 text-lg mt-0.5">{dashboard.rescue.timeRemaining}</p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800/40">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Completion Chance</p>
                    <p className="font-bold text-emerald-500 text-lg mt-0.5">{dashboard.rescue.completionChance}%</p>
                  </div>
                </div>

                <div className="mt-6 bg-zinc-50 dark:bg-zinc-950/20 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-emerald-500" />
                    First Recommended Step
                  </h3>
                  <p className="mt-2 text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">{dashboard.rescue.firstStep}</p>
                </div>

                <div className="mt-6">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">⏱ Emergency Recovery Timeline</h3>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {dashboard.rescue.timeline?.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between items-center rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800/40 p-3 text-sm">
                        <span className="font-semibold text-indigo-500">{item.time}</span>
                        <span className="text-zinc-800 dark:text-zinc-200 font-medium">{item.activity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => generateRescuePlan(dashboard.urgentTask, true)}
                disabled={generatingAction === "rescue" || !dashboard?.urgentTask}
                className="flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={generatingAction === "rescue" ? "animate-spin" : ""} />
                Regenerate Rescue Plan
              </Button>
              <Button onClick={() => setShowRescue(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* MISSED TASKS POPUP */}
      {showMissedPopup && missedTasks.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl transition-all duration-300 text-zinc-900 dark:text-zinc-100">
            <h2 className="text-3xl font-bold text-red-600">⚠️ Missed Deadlines</h2>
            <p className="mt-4 text-zinc-500 dark:text-zinc-400">You missed the deadlines for the following task(s):</p>

            <div className="mt-6 space-y-3">
              {missedTasks.map((task: any) => (
                <div key={task.id} className="rounded-xl bg-red-50 dark:bg-red-950/20 p-4 border border-red-100 dark:border-red-950/40">
                  <p className="font-semibold text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deadline: {new Date(task.deadline).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <Button
              className="mt-8 w-full h-12 text-lg font-semibold bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                const ids = missedTasks.map((t: any) => t.id);
                setDismissedPopupIds((prev) => [...prev, ...ids]);
                setShowMissedPopup(false);
                for (const task of missedTasks) {
                  await markMissedPopupSeen(task.id);
                }
                await refreshTasks();
              }}
            >
              Acknowledge & Clear Alerts
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
