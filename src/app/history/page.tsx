"use client";

import { TaskProvider } from "@/context/TaskContext";
import History from "@/components/history/History";

export default function HistoryPage() {
  return (
    <TaskProvider>
      <History />
    </TaskProvider>
  );
}