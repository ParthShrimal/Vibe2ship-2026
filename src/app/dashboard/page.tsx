import Navbar from "@/components/dashboard/Navbar";
import WelcomeCard from "@/components/dashboard/WelcomeCard";
import HeroCard from "@/components/dashboard/HeroCard";
import AICommandBar from "@/components/ai/AICommandBar";
import TaskList from "@/components/task/TaskList";
import { TaskProvider } from "@/context/TaskContext";

export default function Dashboard() {
  return (
    <TaskProvider>
    <main className="min-h-screen bg-background text-foreground transition-colors duration-300">

      <Navbar />

      <section className="mx-auto max-w-7xl space-y-8 p-8">
        <HeroCard />

        <AICommandBar />

        <TaskList />
        
      </section>

    </main>
    </TaskProvider>
  );
}