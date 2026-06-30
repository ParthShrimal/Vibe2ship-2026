import express from "express";
import path from "path";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: ".env.example" });
}

const app = express();
const PORT = 3000;

console.log("ENV KEYS:", Object.keys(process.env).filter(k => k.includes("GOOGLE") || k.includes("OAUTH") || k.includes("CLIENT") || k.includes("ID") || k.includes("SECRET")));

app.use(cors());
app.use(express.json());

// Initialize Gemini API
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Robust Local Fallback Analyzers to handle Quota / Rate Limits gracefully
function fallbackAnalyzeTask(taskStr: string, time: any) {
  const normalized = taskStr.toLowerCase();
  
  // 1. Detect Priority
  let priority = "Medium";
  if (normalized.includes("high") || normalized.includes("urgent") || normalized.includes("asap") || normalized.includes("critical")) {
    priority = "High";
  } else if (normalized.includes("low") || normalized.includes("easy") || normalized.includes("minor")) {
    priority = "Low";
  }
  
  // 2. Detect Deadline & 3. Detect Estimated Hours
  let deadlineDate = new Date();
  let deadlineSet = false;

  const inMinutesMatch = taskStr.match(/(?:in\s*)?(\d+)\s*(?:minutes?|mins?|m\b)/i);
  const inHoursMatch = taskStr.match(/(?:in\s*)?(\d+)\s*(?:hours?|hrs?|h\b)/i);
  const inDaysMatch = taskStr.match(/(?:in\s*)?(\d+)\s*(?:days?|d\b)/i);

  if (inMinutesMatch && (normalized.includes("minute") || normalized.includes("min") || normalized.includes("2minute") || /\b\d+m\b/.test(normalized) || /in\s*\d+\s*minutes?/.test(normalized))) {
    deadlineDate = new Date(Date.now() + Number(inMinutesMatch[1]) * 60 * 1000);
    deadlineSet = true;
  } else if (inHoursMatch) {
    deadlineDate = new Date(Date.now() + Number(inHoursMatch[1]) * 60 * 60 * 1000);
    deadlineSet = true;
  } else if (inDaysMatch) {
    deadlineDate = new Date(Date.now() + Number(inDaysMatch[1]) * 24 * 60 * 60 * 1000);
    deadlineSet = true;
  } else if (normalized.includes("tomorrow")) {
    deadlineDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    deadlineDate.setHours(17, 0, 0, 0); // 5 PM tomorrow
    deadlineSet = true;
  } else if (normalized.includes("tonight") || normalized.includes("today")) {
    deadlineDate = new Date();
    deadlineDate.setHours(23, 59, 0, 0); // 11:59 PM today
    deadlineSet = true;
  } else if (normalized.includes("next week")) {
    deadlineDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    deadlineSet = true;
  } else {
    // Check for days of the week
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < 7; i++) {
      if (normalized.includes(days[i])) {
        const todayDay = new Date().getDay();
        const targetDay = i;
        let diff = targetDay - todayDay;
        if (diff <= 0) diff += 7; // Next week's day
        deadlineDate = new Date(Date.now() + diff * 24 * 60 * 60 * 1000);
        deadlineDate.setHours(17, 0, 0, 0);
        deadlineSet = true;
        break;
      }
    }
  }

  if (!deadlineSet) {
    // Default deadline 24 hours from now
    deadlineDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  // Detect Estimated Hours
  let estimatedHours = 2;
  const minsMatch = taskStr.match(/(\d+)\s*(?:minutes?|mins?)/i);
  const hoursMatch = taskStr.match(/(\d+)\s*(?:hrs?|hours?)/i);
  if (minsMatch) {
    estimatedHours = Math.max(0.1, Math.round((parseInt(minsMatch[1], 10) / 60) * 100) / 100);
  } else if (hoursMatch) {
    estimatedHours = parseInt(hoursMatch[1], 10) || 2;
  }

  // Ensure estimatedHours does not exceed remaining time
  const hoursLeft = (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft > 0 && estimatedHours > hoursLeft) {
    estimatedHours = Math.max(0.1, Math.round(hoursLeft * 100) / 100);
  }

  // 4. Create Title and Description
  let cleanTask = taskStr
    .replace(/add\s+task\s*/i, "")
    .replace(/create\s+task\s*/i, "")
    .replace(/schedule\s*/i, "")
    .trim();

  if (cleanTask.length > 0) {
    cleanTask = cleanTask.charAt(0).toUpperCase() + cleanTask.slice(1);
  } else {
    cleanTask = "New Task";
  }

  let title = cleanTask;
  let description = "Automatically scheduled task.";

  // If there's a delimiter, split for description
  const splitIndex = cleanTask.search(/\s+(?:by|in|at|on|due|priority)\s+/i);
  if (splitIndex !== -1) {
    title = cleanTask.substring(0, splitIndex).trim();
    description = cleanTask.substring(splitIndex).trim();
  }

  if (title.length > 50) {
    title = title.substring(0, 47) + "...";
  }

  return {
    title,
    description,
    deadline: deadlineDate.toISOString(),
    priority,
    estimatedHours,
    isFallback: true
  };
}

function fallbackGenerateDay(tasks: any[], time: any) {
  if (!tasks || tasks.length === 0) {
    return `No tasks scheduled for today. Take some time to relax or add a new deadline!`;
  }

  const sorted = [...tasks].sort((a, b) => {
    const priorities: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const pA = priorities[a.priority] || 2;
    const pB = priorities[b.priority] || 2;
    if (pA !== pB) return pB - pA;
    return new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime();
  });

  let schedule = `📅 Offline AI Scheduler Mode (Fallback Plan)\nGenerated: ${time.localDate} at ${time.localTime}\n\n`;
  let currentHour = 9;
  let currentMinute = 0;

  const formatTime = (h: number, m: number) => {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  sorted.slice(0, 4).forEach((task) => {
    const startStr = formatTime(currentHour, currentMinute);
    schedule += `${startStr} - Focus Session: ${task.title} (${task.priority} Priority)\n`;
    
    currentMinute += 25;
    if (currentMinute >= 60) {
      currentHour += 1;
      currentMinute -= 60;
    }

    const breakStart = formatTime(currentHour, currentMinute);
    schedule += `${breakStart} - Short Break ☕\n`;

    currentMinute += 5;
    if (currentMinute >= 60) {
      currentHour += 1;
      currentMinute -= 60;
    }
  });

  schedule += `${formatTime(currentHour, currentMinute)} - Review Scheduled Milestones & Check off Completed Items`;
  return schedule;
}

function fallbackAICoach(tasks: any[], time: any) {
  if (!tasks || tasks.length === 0) {
    return {
      highestPriority: "N/A",
      startTime: "Now",
      message: "You have a clean slate today! Take a moment to set your goals and map out a strategic deadline.",
      isFallback: true
    };
  }

  const activeTasks = tasks.filter(t => t.status !== "completed" && t.status !== "missed");
  if (activeTasks.length === 0) {
    return {
      highestPriority: "All Done!",
      startTime: "Rest Mode",
      message: "Fantastic job! All current tasks are fully checked off. Celebrate this milestone!",
      isFallback: true
    };
  }

  const sorted = [...activeTasks].sort((a, b) => {
    const priorities: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const pA = priorities[a.priority] || 2;
    const pB = priorities[b.priority] || 2;
    if (pA !== pB) return pB - pA;
    return new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime();
  });

  const topTask = sorted[0];
  return {
    highestPriority: topTask.title,
    startTime: "Immediate Action",
    message: `🛡️ Guardian Coach Fallback: "${topTask.title}" has a pressing deadline and is flagged as ${topTask.priority} priority. We highly recommend starting this task in a distraction-free Pomodoro sprint immediately.`,
    isFallback: true
  };
}

function fallbackRescueMode(tasks: any[], time: any) {
  const task = tasks?.[0] || { title: "Urgent Task", deadline: new Date(Date.now() + 3600000).toISOString() };
  
  const now = new Date();
  const deadline = new Date(task.deadline);
  const diffMs = deadline.getTime() - now.getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeRemaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const timeline = [];
  let currentHour = typeof time.localHour === "number" ? time.localHour : now.getHours();
  let currentMinute = typeof time.localMinute === "number" ? time.localMinute : now.getMinutes();

  const formatTime = (h: number, m: number) => {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  timeline.push({
    time: formatTime(currentHour, currentMinute),
    activity: "🚨 Rescue Mode activated: Turn off all notifications and social media!"
  });

  currentMinute += 15;
  if (currentMinute >= 60) { currentHour = (currentHour + 1) % 24; currentMinute -= 60; }

  timeline.push({
    time: formatTime(currentHour, currentMinute),
    activity: `Sprint 1: Draft key components of "${task.title}"`
  });

  currentMinute += 30;
  if (currentMinute >= 60) { currentHour = (currentHour + 1) % 24; currentMinute -= 60; }

  timeline.push({
    time: formatTime(currentHour, currentMinute),
    activity: "Quick Hydration Break 🥤"
  });

  currentMinute += 5;
  if (currentMinute >= 60) { currentHour = (currentHour + 1) % 24; currentMinute -= 60; }

  timeline.push({
    time: formatTime(currentHour, currentMinute),
    activity: `Sprint 2: Finalize core details & double check against instructions`
  });

  currentMinute += 30;
  if (currentMinute >= 60) { currentHour = (currentHour + 1) % 24; currentMinute -= 60; }

  timeline.push({
    time: formatTime(currentHour, currentMinute),
    activity: "🏆 Final review & Task Completion checkpoint!"
  });

  return {
    taskTitle: task.title,
    riskLevel: hours < 2 ? "Extreme" : "High",
    timeRemaining: timeRemaining,
    completionChance: Math.min(95, Math.max(30, 100 - (hours * 5 + (hours === 0 ? 30 : 5)))),
    firstStep: "Identify the absolute minimal viable output and build that first.",
    timeline: timeline,
    isFallback: true
  };
}

function fallbackChat(message: string, tasks: any[]) {
  const normalized = message.toLowerCase();
  let responseText = "";

  if (normalized.includes("task") || normalized.includes("list") || normalized.includes("pending")) {
    const activeTasks = (tasks || []).filter(t => t.status === "active");
    if (activeTasks.length === 0) {
      responseText = "📋 **Your Task List is empty!** You have no active pending tasks. Use the command bar to create one!";
    } else {
      responseText = "📋 **Active Tasks on Your Watch:**\n\n" + 
        activeTasks.map((t, i) => `${i + 1}. **${t.title}** (Priority: \`${t.priority}\`, Estimated: ${t.estimatedHours || 1}h)`).join("\n") +
        "\n\n*Focus on the high-priority deadlines first!*";
    }
  } else if (normalized.includes("hello") || normalized.includes("hi") || normalized.includes("hey") || normalized.includes("greet")) {
    responseText = "👋 **Hello! I am your Deadline Guardian AI.**\n\nI am fully online in **Guardian offline-safe fallback mode** to keep you safe from missing deadlines! \n\nYou can ask me to **list your tasks**, provide **deadline tips**, or guide you through a **productivity sprint**. What are you working on today?";
  } else if (normalized.includes("tip") || normalized.includes("advice") || normalized.includes("help") || normalized.includes("strategy")) {
    responseText = "🛡️ **Guardian Pro-Tips for Hitting Deadlines:**\n\n" +
      "1. **Eat the Frog:** Tackle your highest priority, most critical task first thing.\n" +
      "2. **Pomodoro Method:** Work intensely for 25 minutes, then take a 5-minute break to restore cognitive capacity.\n" +
      "3. **Minimize Context-Switching:** Close distracting tabs and silence phone alerts.\n" +
      "4. **Time Boxing:** Estimate how long a task should take, set a timer, and strive to finish within that boundary.";
  } else {
    responseText = `🛡️ **Guardian Assistant (Offline Fallback Mode):**\n\nI received your query: "${message}".\n\nI am currently in smart local assistant mode. You can ask me about your active **tasks** or ask for general **productivity tips** to keep you moving towards completion!`;
  }

  return responseText;
}

// Helper for time context
function getCurrentContext(reqBody?: any) {
  if (reqBody?.clientTime) {
    return {
      iso: reqBody.clientTime.iso || new Date().toISOString(),
      localDate: reqBody.clientTime.localDate || new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      localTime: reqBody.clientTime.localTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
      localHour: typeof reqBody.clientTime.localHour === "number" ? reqBody.clientTime.localHour : new Date().getHours(),
      localMinute: typeof reqBody.clientTime.localMinute === "number" ? reqBody.clientTime.localMinute : new Date().getMinutes()
    };
  }
  const now = new Date();
  return {
    iso: now.toISOString(),
    localDate: now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    localTime: now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    localHour: now.getHours(),
    localMinute: now.getMinutes()
  };
}

function parseRobustJSON(text: string): any {
  const cleaned = text.trim();
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonStr = cleaned.slice(startIdx, endIdx + 1);
    return JSON.parse(jsonStr);
  }
  return JSON.parse(cleaned);
}

// API Routes

// 1. Analyze Task Route
app.post("/api/analyze-task", async (req, res) => {
  const { task } = req.body;
  if (!task) {
    res.status(400).json({ success: false, error: "Task is required" });
    return;
  }
  const time = getCurrentContext(req.body);

  try {
    let resolvedDeadline = null;
    const normalizedTask = task.toLowerCase().trim();
    const minuteMatch = normalizedTask.match(/(?:in\s*)?(\d+)\s*(?:minutes?|mins?|m\b)/i);
    const hourMatch = normalizedTask.match(/(?:in\s*)?(\d+)\s*(?:hours?|hrs?|h\b)/i);
    const dayMatch = normalizedTask.match(/(?:in\s*)?(\d+)\s*(?:days?|d\b)/i);

    if (minuteMatch && (normalizedTask.includes("minute") || normalizedTask.includes("min") || normalizedTask.includes("2minute") || /\b\d+m\b/.test(normalizedTask) || /in\s*\d+\s*minutes?/.test(normalizedTask))) {
      resolvedDeadline = new Date(Date.now() + Number(minuteMatch[1]) * 60 * 1000).toISOString();
    } else if (hourMatch) {
      resolvedDeadline = new Date(Date.now() + Number(hourMatch[1]) * 60 * 60 * 1000).toISOString();
    } else if (dayMatch) {
      resolvedDeadline = new Date(Date.now() + Number(dayMatch[1]) * 24 * 60 * 60 * 1000).toISOString();
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an AI productivity assistant.
Today's date is: ${time.iso}
The user may refer to dates like: today, tomorrow, next Friday, this weekend. Always interpret them relative to today's date.

Extract the user's task. Return ONLY valid JSON. Do NOT use markdown or triple backticks.

Schema:
{
  "title": "",
  "description": "",
  "deadline": "ISO-8601 date and time",
  "priority": "Low | Medium | High",
  "estimatedHours": 0
}

Current Date Context:
LocalDate: ${time.localDate}
LocalTime: ${time.localTime}
ISO: ${time.iso}
Resolved Deadline: ${resolvedDeadline ?? "Not specified"}

If a resolved deadline is provided, use it exactly. Do NOT modify it.
If the user says "today", return today's date.
If the user says "tomorrow", return tomorrow's date.
If the user says "in 10 hours", return the exact ISO timestamp 10 hours from now.
If no deadline is mentioned, set deadline to null.

Return ONLY valid JSON.
Task: ${task}
`,
    });

    const rawText = response.text || "";
    const text = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = parseRobustJSON(text);

    if (!parsed.deadline) {
      parsed.deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    // Ensure estimated hours does not exceed remaining time
    const deadlineTime = new Date(parsed.deadline).getTime();
    const nowTime = Date.now();
    const hoursLeft = (deadlineTime - nowTime) / (1000 * 60 * 60);
    if (hoursLeft > 0 && parsed.estimatedHours > hoursLeft) {
      parsed.estimatedHours = Math.max(0.1, Math.round(hoursLeft * 100) / 100);
    }

    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.log("[Fallback] Analyze Task API currently unavailable. Triggering smart local fallback.");
    try {
      const parsed = fallbackAnalyzeTask(task, time);
      res.json({ success: true, data: parsed, isFallback: true });
    } catch (fallbackErr: any) {
      res.status(500).json({ success: false, error: "Failed to analyze task: " + error.message });
    }
  }
});

// 2. Generate My Day Route
app.post("/api/generate-day", async (req, res) => {
  const { tasks } = req.body;
  const time = getCurrentContext(req.body);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an expert productivity coach.
Using these tasks:
${JSON.stringify(tasks, null, 2)}

Current Date: ${time.localDate}
Current Time: ${time.localTime}

Generate today's schedule starting from the current time.
Never create events in the past.
Round to the next 15 minutes (e.g., if 3:40 PM, start at 3:45 PM).

Rules:
- Prioritize urgent tasks first.
- Include short breaks (e.g. 5m / 15m).
- Incorporate focus blocks (Pomodoro sessions) dynamically if the user is working on tasks with estimations (e.g. 25-minute focus session followed by short break).
- Return ONLY plain text schedule list.
- Use 24-hour time.

Format Example:
09:00 - Focus Session: Task title
09:25 - Short Break
09:30 - Focus Session: Task title
10:00 - Focus Session: Task title
10:25 - Short Break
`,
    });

    res.json({ success: true, plan: response.text || "" });
  } catch (error: any) {
    console.log("[Fallback] Generate Day API currently unavailable. Triggering fallback schedule planner.");
    try {
      const schedule = fallbackGenerateDay(tasks || [], time);
      res.json({ success: true, plan: schedule, isFallback: true });
    } catch (fallbackErr: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 3. AI Coach Route
app.post("/api/ai-coach", async (req, res) => {
  const { tasks } = req.body;
  const time = getCurrentContext(req.body);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an AI productivity coach.
Current Date: ${time.localDate}
Current Time: ${time.localTime}
ISO: ${time.iso}

Tasks:
${JSON.stringify(tasks)}

Provide customized advice for the user based on these tasks. Return ONLY JSON. Do NOT use markdown.

Schema:
{
  "highestPriority": "The highest priority task title",
  "startTime": "Recommended start time",
  "message": "Motivational/strategic coaching message"
}
`,
    });

    const rawText = response.text || "";
    const text = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = parseRobustJSON(text);
    res.json({ success: true, advice: parsed });
  } catch (error: any) {
    console.log("[Fallback] AI Coach API currently unavailable. Triggering dynamic coaching fallback.");
    try {
      const advice = fallbackAICoach(tasks || [], time);
      res.json({ success: true, advice, isFallback: true });
    } catch (fallbackErr: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 4. Rescue Mode Route
app.post("/api/rescue-mode", async (req, res) => {
  const { tasks } = req.body;
  const time = getCurrentContext(req.body);
  const task = tasks?.[0];

  if (!task) {
    res.status(400).json({ success: false, error: "No urgent task received." });
    return;
  }

  try {
    const now = new Date();
    const deadline = new Date(task.deadline);
    const diffMs = deadline.getTime() - now.getTime();
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const timeRemaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an expert productivity coach.
Current Date: ${time.localDate}
Current Time: ${time.localTime}
ISO: ${time.iso}
Current remaining time until deadline: ${timeRemaining}

The remaining time has ALREADY been calculated. Do NOT recalculate it. Use this exact value everywhere.
These are the user's tasks:
${JSON.stringify(tasks, null, 2)}

Identify the MOST URGENT task.
Include the title of the urgent task in taskTitle.
Return ONLY valid JSON. Do NOT return markdown or triple backticks.

Schema:
{
  "taskTitle": "${task.title}",
  "riskLevel": "High | Extreme",
  "timeRemaining": "${timeRemaining}",
  "completionChance": 75,
  "firstStep": "State clear initial task step.",
  "timeline": [
    {
      "time": "12:00",
      "activity": "Activity title"
    }
  ]
}
`,
    });

    const rawText = response.text || "";
    const text = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = parseRobustJSON(text);
    res.json({ success: true, plan: parsed });
  } catch (error: any) {
    console.log("[Fallback] Rescue Mode API currently unavailable. Triggering timeline recovery fallback.");
    try {
      const plan = fallbackRescueMode(tasks || [], time);
      res.json({ success: true, plan, isFallback: true });
    } catch (fallbackErr: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 5. Chatbot Route (Context-Aware Assistant)
app.post("/api/chat", async (req, res) => {
  const { message, history, tasks, plan, coach, rescue, focusTime } = req.body;
  const time = getCurrentContext(req.body);

  try {
    const contextPrompt = `
You are the Deadline Guardian AI chatbot companion. Your job is to help the user stay productive, focused, and on track with their deadlines.
You have full access to their real-time application data:

Today is: ${time.localDate} (${time.localTime})
Pending Tasks: ${JSON.stringify(tasks || [])}
Today's Schedule: ${plan || "No schedule generated yet."}
AI Coach Advice: ${JSON.stringify(coach || "No advice yet.")}
Rescue Plan: ${JSON.stringify(rescue || "No rescue plan active.")}
Today's Focus Time: ${focusTime || "0"} minutes

Answer the user's question directly, clearly, and concisely. Keep answers practical, structured, and motivational. Use Markdown.
If asked about deadlines, prioritize and list actual tasks.

Conversation History:
${(history || []).map((h: any) => `${h.role === "user" ? "User" : "Guardian"}: ${h.text}`).join("\n")}
User: ${message}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contextPrompt,
    });

    res.json({ success: true, text: response.text || "" });
  } catch (error: any) {
    console.log("[Fallback] Chatbot API currently unavailable. Triggering offline chatbot companion fallback.");
    try {
      const reply = fallbackChat(message, tasks || []);
      res.json({ success: true, text: reply, isFallback: true });
    } catch (fallbackErr: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// Vite/Static asset serving setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
