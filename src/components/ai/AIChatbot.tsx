"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, Trash2, ArrowDownCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, deleteDoc, writeBatch } from "firebase/firestore";
import { useTasks } from "@/context/TaskContext";
import { useDashboard } from "@/context/DashboardContext";
import { useTimer } from "@/context/TimerContext";
import { toast } from "sonner";
import { getClientTime } from "@/lib/date";

export default function AIChatbot() {
  const [user] = useAuthState(auth);
  const { tasks } = useTasks();
  const { dashboard } = useDashboard();
  const { timerState, analytics } = useTimer();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from Firestore
  useEffect(() => {
    if (!user || !open) return;

    const chatQuery = query(
      collection(db, "users", user.uid, "chatHistory"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(chatQuery, (snap) => {
      const list = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(list);
    }, (err) => {
      console.error("AIChatbot onSnapshot error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/chatHistory`);
    });

    return () => unsubscribe();
  }, [user, open]);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Compute stats for context
  const completedToday = analytics.filter(
    (s: any) => s.mode === "focus" && !s.interrupted
  ).length;
  const totalFocusMinutes = completedToday * 25;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !user || loading) return;

    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      const chatColRef = collection(db, "users", user.uid, "chatHistory");

      // 1. Save user message to Firestore
      await addDoc(chatColRef, {
        role: "user",
        text: userMsg,
        timestamp: Date.now(),
      });

      // 2. Format chat context for server API call
      const simplifiedHistory = messages.slice(-10).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      // 3. Send message to backend Gemini proxy
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: simplifiedHistory,
          tasks: tasks.map((t: any) => ({
            title: t.title,
            priority: t.priority,
            status: t.status,
            deadline: t.deadline,
          })),
          plan: dashboard?.todayPlan,
          coach: dashboard?.coach,
          rescue: dashboard?.rescue,
          focusTime: totalFocusMinutes,
          clientTime: getClientTime(),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to generate reply");

      // 4. Save model message response to Firestore
      await addDoc(chatColRef, {
        role: "model",
        text: data.text,
        timestamp: Date.now(),
      });

    } catch (err: any) {
      console.error(err);
      toast.error("Failed to fetch AI companion response.");
    } finally {
      setLoading(false);
    }
  }

  // Clear Chat History
  async function clearChat() {
    if (!user) return;
    const confirmClear = window.confirm("Clear all AI companion chats?");
    if (!confirmClear) return;

    try {
      const q = query(collection(db, "users", user.uid, "chatHistory"));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setMessages([]);
      toast.success("Conversation cleared.");
    } catch (err) {
      console.error(err);
    }
  }

  // Pure custom renderer for bulletproof Markdown in React 19 (prevents package mismatches)
  function renderMessageText(text: string) {
    if (!text) return "";
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let clean = line;
      // Handle bold tags
      clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

      // Handle bullets
      if (clean.startsWith("* ") || clean.startsWith("- ")) {
        return (
          <li
            key={idx}
            className="ml-4 list-disc text-sm text-foreground/90 my-1"
            dangerouslySetInnerHTML={{ __html: clean.substring(2) }}
          />
        );
      }

      // Handle headers
      if (clean.startsWith("### ")) {
        return (
          <h4
            key={idx}
            className="font-bold text-base mt-3 mb-1 text-indigo-500"
            dangerouslySetInnerHTML={{ __html: clean.substring(4) }}
          />
        );
      }
      if (clean.startsWith("## ")) {
        return (
          <h3
            key={idx}
            className="font-bold text-lg mt-4 mb-1 text-indigo-500"
            dangerouslySetInnerHTML={{ __html: clean.substring(3) }}
          />
        );
      }

      return (
        <p
          key={idx}
          className="text-sm my-1.5 leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      );
    });
  }

  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Expanded Chat Drawer */}
      {open && (
        <div className="mb-4 flex h-[500px] w-96 flex-col rounded-3xl border border-border bg-card shadow-2xl text-foreground overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white">
            <div className="flex items-center gap-2">
              <Bot className="animate-bounce" size={20} />
              <div>
                <h3 className="font-bold text-sm">Guardian AI</h3>
                <span className="text-[10px] text-indigo-100 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Productivity Companion Online
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={clearChat}
                className="p-1.5 hover:bg-white/15 rounded-lg transition-colors text-indigo-100"
                title="Clear Chat History"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-white/15 rounded-lg transition-colors text-indigo-100"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
                <Bot size={40} className="text-indigo-500/60" />
                <p className="text-sm font-semibold">Need advice, suggestions or scheduling support?</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  "What should I work on next?"<br />
                  "Summarize my tasks"<br />
                  "Help me structure my day"
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                      m.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-card border border-border/80"
                    }`}
                  >
                    {m.role === "user" ? (
                      <p>{m.text}</p>
                    ) : (
                      renderMessageText(m.text)
                    )}
                    <span
                      className={`block text-[9px] mt-1 text-right ${
                        m.role === "user" ? "text-indigo-200" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-card border border-border/80 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Footer Input */}
          <form onSubmit={handleSend} className="border-t border-border p-3 flex gap-2 bg-card">
            <input
              type="text"
              placeholder="Ask Guardian AI companion..."
              className="flex-1 text-sm bg-muted/50 border border-border rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground h-10"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" size="sm" className="h-10 rounded-xl" disabled={loading}>
              <Send size={15} />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <Button
        onClick={() => setOpen(!open)}
        size="lg"
        className="rounded-full h-14 w-14 shadow-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center justify-center p-0 transition-transform duration-300 hover:scale-105"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </Button>
    </div>
  );
}
