"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Play, CheckCircle } from "lucide-react";

import { formatDate } from "@/lib/date";
import { deleteTask, markTaskCompleted } from "@/services/taskService";
import { useTasks } from "@/context/TaskContext";
import { useTimer } from "@/context/TimerContext";

export default function TaskList() {
  const { tasks, refreshTasks } = useTasks();
  const { startTimer, timerState } = useTimer();

  const activeTasks = tasks.filter((task: any) => task.status === "active");

  async function handleDelete(id: string) {
    const confirmDelete = window.confirm("Are you sure you want to delete this task?");
    if (!confirmDelete) return;

    try {
      await deleteTask(id);
      await refreshTasks();
    } catch (error) {
      console.error(error);
      alert("Failed to delete task.");
    }
  }

  async function handleComplete(id: string) {
    try {
      await markTaskCompleted(id);
      await refreshTasks();
    } catch (error) {
      console.error(error);
      alert("Failed to mark task as completed.");
    }
  }

  function priorityColor(priority: string) {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
      case "Medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300";
      default:
        return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
    }
  }

  return (
    <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-colors duration-300">
      <h2 className="mb-6 text-2xl font-bold text-foreground">
        📋 Your Tasks
      </h2>

      {activeTasks.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">
          There are no active tasks. Create a task using the Command Bar to start tracking!
        </p>
      ) : (
        <div className="space-y-4">
          {activeTasks.map((task: any) => {
            const isCurrentlyFocusing = timerState.taskId === task.id && timerState.status === "running";

            return (
              <div
                key={task.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:shadow-lg hover:border-indigo-500/30"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-foreground truncate">
                    {task.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      📅 Due: {formatDate(task.deadline)}
                    </span>
                    <span className="flex items-center gap-1">
                      ⏱ {task.estimatedHours} Hours Est.
                    </span>
                  </div>

                  <span
                    className={`mt-3 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${priorityColor(
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                </div>

                {/* Inline Action shortcuts */}
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {/* Start Focus Short-cut button */}
                  <Button
                    variant="outline"
                    className={`h-9 rounded-xl text-xs font-semibold flex items-center gap-1 px-3 ${
                      isCurrentlyFocusing
                        ? "bg-indigo-50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-600 font-bold"
                        : "border-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/10"
                    }`}
                    onClick={() => startTimer(task.id, task.title)}
                  >
                    <Play size={12} className={isCurrentlyFocusing ? "animate-pulse fill-indigo-600" : ""} />
                    {isCurrentlyFocusing ? "Focusing..." : "Start Focus"}
                  </Button>

                  <Button
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 px-3"
                    onClick={() => handleComplete(task.id)}
                  >
                    <CheckCircle size={12} />
                    ✓ Done
                  </Button>

                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
