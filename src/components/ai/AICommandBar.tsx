"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createTask } from "@/services/taskService";
import { formatDate, getClientTime } from "@/lib/date";
import { useTasks } from "@/context/TaskContext";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { getCalendarToken } from "@/services/calendarAuth";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function AICommandBar() {
  const [user] = useAuthState(auth);
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const { refreshTasks } = useTasks();

  async function analyzeTask() {
    if (!task.trim()) return;

    try {
      setLoading(true);

      const response = await fetch("/api/analyze-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task,
          clientTime: getClientTime(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.data);
      } else {
        toast.error(data.error || "Failed to analyze task.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to analyze task.");
    } finally {
      setLoading(false);
    }
  }

  async function saveTask() {
    if (!analysis) return;

    try {
      setSaving(true);

      await createTask({
        title: analysis.title,
        description: analysis.description,
        deadline: analysis.deadline,
        priority: analysis.priority,
        estimatedHours: analysis.estimatedHours,
        createdAt: Date.now(),
      }, user?.uid);

      // Real Google Calendar Integration
      const calendarToken = getCalendarToken();
      if (calendarToken) {
        try {
          const startDateTime = new Date(analysis.deadline).toISOString();
          const estHours = Number(analysis.estimatedHours) || 1;
          const endDateTime = new Date(new Date(analysis.deadline).getTime() + estHours * 60 * 60 * 1000).toISOString();

          const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${calendarToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              summary: analysis.title,
              description: `${analysis.description || ""}\n\nAdded by Deadline Guardian AI`,
              start: {
                dateTime: startDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
              },
              end: {
                dateTime: endDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            })
          });

          if (!calRes.ok) {
            console.warn("Failed to auto-sync calendar event:", await calRes.text());
          } else {
            toast.success("📅 Added to Google Calendar!");
          }
        } catch (calErr) {
          console.error("Failed to add calendar event:", calErr);
        }
      }

      await refreshTasks();

      setTask("");
      setAnalysis(null);

      toast.success("✅ Task Saved Successfully!", {
        description: `Successfully added "${analysis.title}" to your active goals.`,
      });

    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to save task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl p-6 shadow-lg border border-border bg-card">
        <h2 className="mb-4 text-xl font-bold flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-500 animate-pulse" />
          What do you need to finish?
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Finish my DBMS assignment before Friday evening..."
            className="h-12 bg-muted/30 rounded-xl"
          />

          <Button
            onClick={analyzeTask}
            disabled={loading}
            className="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </Button>
        </div>
      </Card>

      {analysis && (
        <Card className="rounded-3xl p-6 shadow-lg border border-border bg-card animate-in fade-in duration-300">
          <h2 className="mb-6 text-2xl font-bold flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
            ✨ AI Analysis Results
          </h2>

          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</p>
              <p className="font-bold text-lg mt-0.5">{analysis.title}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
              <p className="text-foreground mt-0.5 leading-relaxed">{analysis.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deadline</p>
                <p className="mt-0.5">{formatDate(analysis.deadline)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority</p>
                <p className="font-bold mt-0.5">{analysis.priority}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated Time</p>
              <p className="mt-0.5 font-medium">{analysis.estimatedHours} hrs</p>
            </div>

            <Button
              onClick={saveTask}
              disabled={saving}
              className="mt-4 w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold"
            >
              {saving ? "Saving..." : "Save Task & Lock to Board"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
