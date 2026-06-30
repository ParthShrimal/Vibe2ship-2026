"use client";

import React, { useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { TaskProvider } from "@/context/TaskContext";
import { DashboardProvider } from "@/context/DashboardContext";
import { TimerProvider } from "@/context/TimerContext";
import Navbar from "@/components/dashboard/Navbar";
import HeroCard from "@/components/dashboard/HeroCard";
import TimerCard from "@/components/timer/TimerCard";
import AICommandBar from "@/components/ai/AICommandBar";
import TaskList from "@/components/task/TaskList";
import History from "@/components/history/History";
import AIChatbot from "@/components/ai/AIChatbot";
import LandingPage from "@/components/landing/LandingPage";
import { Toaster } from "sonner";
import { Bot, AlertTriangle, RefreshCw, ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function App() {
  const [user, loading, error] = useAuthState(auth);
  const [page, setPage] = useState<"dashboard" | "history">("dashboard");

  // Show a beautiful, minimal spinning load state while Firebase Auth is checking credentials
  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground space-y-4">
        <Bot size={48} className="text-indigo-600 animate-bounce" />
        <p className="text-sm font-semibold animate-pulse">Initializing Deadline Guardian AI...</p>
      </div>
    );
  }

  // Handle Firebase Auth errors (e.g. auth/network-request-failed) elegantly
  // Ignore harmless popup-closed errors so users can re-initiate login without being blocked.
  const authErr = error as any;
  const isPopupError = authErr && (
    authErr.code === "auth/popup-closed-by-user" ||
    authErr.message?.includes("popup-closed-by-user") ||
    authErr.code === "auth/cancelled-popup-request" ||
    authErr.message?.includes("cancelled-popup-request")
  );

  if (error && !isPopupError) {
    return (
      <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 text-red-500">
            <ShieldAlert size={36} />
            <h2 className="text-2xl font-bold tracking-tight">Connection Issue</h2>
          </div>

          <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
            <p>
              Firebase Authentication failed to connect to Google's authentication servers:
            </p>
            <div className="bg-black/40 p-3 rounded-xl border border-zinc-800/80 font-mono text-xs text-red-400 overflow-x-auto">
              {error.message || "auth/network-request-failed"}
            </div>
            <p className="font-semibold text-zinc-200">
              Why is this happening?
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-300">
              <li>
                <strong>Ad-Blockers or Brave Shields</strong>: Privacy extensions often block Google identity domains (like <code className="text-indigo-400">identitytoolkit.googleapis.com</code>) by default.
              </li>
              <li>
                <strong>Third-Party Cookies</strong>: Your browser might be blocking cookies or storage access in this iframe.
              </li>
              <li>
                <strong>Network Firewall</strong>: A corporate or local firewall may be restricting Firebase endpoints.
              </li>
            </ul>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-6 rounded-xl cursor-pointer"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={16} />
              Reload Application
            </Button>
            
            <a 
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium py-3 rounded-xl transition-colors text-sm"
            >
              <ExternalLink size={14} />
              Open App in New Tab
            </a>
          </div>
          
          <p className="text-center text-xs text-zinc-500">
            Tip: Disabling your ad-blocker for this site or opening in a new tab will solve this instantly.
          </p>
        </div>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  // If unauthorized, showcase the high-conversion Landing Page
  if (!user) {
    return (
      <>
        <LandingPage />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  // Authorized User Shell
  return (
    <TaskProvider>
      <DashboardProvider>
        <TimerProvider>
          <div className="min-h-screen bg-background text-foreground transition-colors duration-300 pb-24">
            <Navbar currentPage={page} setCurrentPage={setPage} />

            {page === "dashboard" ? (
              <main className="mx-auto max-w-6xl p-8 space-y-8 animate-in fade-in duration-500">
                {/* Hero greeting & Action Buttons */}
                <HeroCard />

                {/* Main grid with command bars, timer widgets, and active lists */}
                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Natural language task adder */}
                    <AICommandBar />
                    {/* Filterable/clickable task cards */}
                    <TaskList />
                  </div>

                  <div className="lg:col-span-1">
                    {/* Floating Pomodoro Focus block */}
                    <TimerCard />
                  </div>
                </div>
              </main>
            ) : (
              <div className="animate-in fade-in duration-500">
                {/* Focus analytics, completed log summaries, and charts */}
                <History />
              </div>
            )}

            {/* floating contextual chat bot */}
            <AIChatbot />

            {/* Application Toast Alerts */}
            <Toaster position="top-right" richColors />
          </div>
        </TimerProvider>
      </DashboardProvider>
    </TaskProvider>
  );
}
