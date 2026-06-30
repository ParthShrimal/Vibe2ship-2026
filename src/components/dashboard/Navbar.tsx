"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bell, LogOut, Calendar, MessageSquareX, Sparkles, User, Settings, Check, HelpCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { getCalendarToken, unlinkCalendar } from "@/services/calendarAuth";
import { useTasks } from "@/context/TaskContext";
import { collection, query, where, onSnapshot, updateDoc, doc, writeBatch, getDocs, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";

interface NavbarProps {
  currentPage: "dashboard" | "history";
  setCurrentPage: (page: "dashboard" | "history") => void;
}

export default function Navbar({ currentPage, setCurrentPage }: NavbarProps) {
  const [user] = useAuthState(auth);
  const { tasks } = useTasks();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileOpen && profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen, notifOpen]);

  const initials =
    user?.displayName
      ?.split(" ")
      .map((name) => name[0])
      .join("")
      .toUpperCase() || "U";

  // Listen to in-app notifications
  useEffect(() => {
    if (!user) return;

    const notifQuery = query(
      collection(db, "users", user.uid, "notifications")
    );

    const unsubscribe = onSnapshot(notifQuery, (snap) => {
      const list = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort descending by createdAt
      list.sort((a: any, b: any) => b.createdAt - a.createdAt);
      setNotifications(list);
    }, (err) => {
      console.error("Navbar onSnapshot error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/notifications`);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Mark all as read
  async function handleMarkAllRead() {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.read) {
          const ref = doc(db, "users", user!.uid, "notifications", n.id);
          batch.update(ref, { read: true });
        }
      });
      await batch.commit();
      toast.success("All notifications marked as read!");
    } catch (err) {
      console.error(err);
    }
  }

  // Clear notifications
  async function handleClearNotifications() {
    if (!user) return;
    try {
      const q = query(collection(db, "users", user.uid, "notifications"));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      toast.success("Notifications cleared!");
    } catch (err) {
      console.error(err);
    }
  }

  // Clear AI chat history
  async function handleClearChatHistory() {
    if (!user) return;
    const confirmClear = window.confirm("Are you sure you want to clear your AI chat history?");
    if (!confirmClear) return;

    try {
      const q = query(collection(db, "users", user.uid, "chatHistory"));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      toast.success("AI Chat history cleared!");
    } catch (err) {
      console.error(err);
    }
  }

  // Manual Trigger Google Calendar Sync (real client-side integration)
  async function handleCalendarSync() {
    const calendarToken = getCalendarToken();
    if (!calendarToken) {
      toast.error("Google Calendar is not authorized.", {
        description: "Please connect Google Calendar via the 'Link Now' option on the Dashboard statistics card.",
      });
      return;
    }

    const syncPromise = (async () => {
      // 1. Fetch existing Google Calendar events with 'q=Deadline Guardian AI' to avoid duplication
      const listRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?q=Deadline%20Guardian%20AI",
        {
          headers: { Authorization: `Bearer ${calendarToken}` },
        }
      );
      if (!listRes.ok) {
        throw new Error("Failed to list Google Calendar events");
      }
      const listData = await listRes.json();
      const existingEvents = listData.items || [];

      // 2. Filter tasks that have deadlines and are not completed
      const syncableTasks = tasks.filter(
        (t: any) => t.deadline && (t.status === "active" || t.status === "missed")
      );

      if (syncableTasks.length === 0) {
        return "No active tasks with deadlines found to sync.";
      }

      let syncedCount = 0;

      // 3. Sync each task if not already in Google Calendar
      for (const task of syncableTasks) {
        const isAlreadySynced = existingEvents.some(
          (evt: any) => evt.summary === task.title
        );

        if (!isAlreadySynced) {
          const startDateTime = new Date(task.deadline).toISOString();
          const estHours = Number(task.estimatedHours) || 1;
          const endDateTime = new Date(
            new Date(task.deadline).getTime() + estHours * 60 * 60 * 1000
          ).toISOString();

          const createRes = await fetch(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${calendarToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                summary: task.title,
                description: `${task.description || ""}\n\nPriority: ${task.priority || "Medium"}\nAdded by Deadline Guardian AI`,
                start: {
                  dateTime: startDateTime,
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                  dateTime: endDateTime,
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
              }),
            }
          );

          if (createRes.ok) {
            syncedCount++;
          } else {
            console.warn(`Failed to sync task: ${task.title}`, await createRes.text());
          }
        }
      }

      return syncedCount > 0
        ? `Successfully synced ${syncedCount} task(s) to Google Calendar!`
        : "All active tasks are already in Google Calendar!";
    })();

    toast.promise(syncPromise, {
      loading: "Syncing schedules with Google Calendar...",
      success: (data: string) => `📅 ${data}`,
      error: (err: any) => `Failed to sync calendar: ${err.message || err}`,
    });
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      // Clear local states
      unlinkCalendar();
      toast.success("Signed out successfully.");
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <nav className="relative z-40 flex items-center justify-between border-b border-border bg-card px-8 py-4 transition-colors duration-300">
      <div>
        <h1 
          className="text-xl font-bold text-foreground cursor-pointer hover:text-indigo-500 transition-colors"
          onClick={() => setCurrentPage("dashboard")}
        >
          🛡️ Deadline Guardian AI
        </h1>
        <p className="text-sm text-muted-foreground">
          AI Productivity Companion
        </p>
      </div>

      <div className="flex items-center gap-5">
        <ThemeToggle />

        {/* Navigation Buttons */}
        <Button 
          variant={currentPage === "dashboard" ? "default" : "outline"}
          onClick={() => setCurrentPage("dashboard")}
        >
          📋 Dashboard
        </Button>

        <Button 
          variant={currentPage === "history" ? "default" : "outline"}
          onClick={() => setCurrentPage("history")}
        >
          📜 History
        </Button>

        {/* Notification Bell with Dropdown */}
        <div className="relative" ref={notifRef}>
          <button 
            className="relative p-2 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setProfileOpen(false);
            }}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-border bg-card p-4 shadow-2xl text-foreground">
              <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                <span className="font-bold">Notifications</span>
                <div className="flex gap-2">
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-xs text-indigo-500 hover:underline"
                  >
                    Mark read
                  </button>
                  <button 
                    onClick={handleClearNotifications}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={`p-2 rounded-xl text-xs border ${
                        n.read ? "bg-card border-border/40 opacity-75" : "bg-muted border-indigo-500/20 font-medium"
                      }`}
                    >
                      <p className="font-semibold text-foreground flex items-center justify-between">
                        <span>{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full" />}
                      </p>
                      <p className="text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 text-right">
                        {new Date(n.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setProfileOpen(!profileOpen);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 border border-border rounded-full p-0.5 hover:ring-2 hover:ring-indigo-500/30 transition-all"
          >
            <Avatar className="h-9 w-9 border border-border">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="h-full w-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <AvatarFallback className="bg-muted text-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-3 w-72 rounded-2xl border border-border bg-card p-5 shadow-2xl text-foreground">
              {/* User Bio */}
              <div className="flex items-center gap-3 border-b border-border pb-4 mb-3">
                <Avatar className="h-12 w-12 border border-border">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="h-full w-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <AvatarFallback className="bg-muted text-foreground font-semibold">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="overflow-hidden">
                  <p className="font-semibold text-sm truncate">{user?.displayName || "Guardian User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email || "user@example.com"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Joined: {user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : "Active Member"}
                  </p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-1.5 text-sm">
                <button
                  onClick={() => {
                    handleCalendarSync();
                    setProfileOpen(false);
                  }}
                  className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted transition-colors text-foreground cursor-pointer"
                >
                  <Calendar size={16} className="text-indigo-500" />
                  <span>Sync Google Calendar</span>
                </button>

                <button
                  onClick={() => {
                    handleClearChatHistory();
                    setProfileOpen(false);
                  }}
                  className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted transition-colors text-foreground cursor-pointer"
                >
                  <MessageSquareX size={16} className="text-red-500" />
                  <span>Clear AI Chat History</span>
                </button>

                <div className="border-t border-border my-2 pt-2">
                  <button
                    onClick={() => {
                      handleLogout();
                      setProfileOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors text-foreground font-medium cursor-pointer"
                  >
                    <LogOut size={16} className="text-red-500" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
