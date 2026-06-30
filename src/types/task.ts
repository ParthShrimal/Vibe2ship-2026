export interface Task {
  id?: string;

  title: string;
  description: string;
  deadline: string;

  priority: "Low" | "Medium" | "High";

  estimatedHours: number;

  createdAt: number;
}