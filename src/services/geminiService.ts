import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function analyzeTask(input: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
Extract this task into JSON.

Return ONLY valid JSON.

Fields:
title
description
deadline
priority
estimatedHours

Task:
${input}
`,
  });

  return response.text;
}