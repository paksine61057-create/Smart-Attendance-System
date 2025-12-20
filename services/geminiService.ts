
import { GoogleGenAI, Type } from "@google/genai";
import { CheckInRecord } from "../types";

// Initialize Gemini
// Fix: Use process.env.API_KEY directly as a named parameter in the constructor
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeCheckInImage = async (base64Image: string): Promise<string> => {
  try {
    // Remove header if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      // Fix: Use gemini-2.5-flash-image for image analysis tasks
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/jpeg',
            },
          },
          {
            text: 'Analyze this check-in photo. 1. Confirm if a real person is visible (Yes/No). 2. Briefly describe the person (e.g. "Person wearing a blue shirt"). Keep it under 15 words.',
          },
        ],
      },
    });

    // Fix: Access response.text as a property
    return response.text || "Analysis failed.";
  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    return "AI verification unavailable.";
  }
};

export const generateDailyReportSummary = async (records: CheckInRecord[]): Promise<string> => {
  try {
    const recordsText = records.map(r => 
      `- ${r.name} (${r.role}) [${r.type.toUpperCase()}]: ${r.status} at ${new Date(r.timestamp).toLocaleTimeString()}. Reason: ${r.reason || 'N/A'}`
    ).join('\n');

    const prompt = `
      Generate a professional executive summary for the School Daily Attendance Report.
      
      Attendance Data:
      ${recordsText}

      Summary Requirements:
      1. Mention total check-ins (Arrivals vs Departures).
      2. Highlight any Late arrivals (after 8:01) or Early Departures (before 16:00) and their reasons.
      3. Keep it formal and concise (max 3 sentences).
    `;

    const response = await ai.models.generateContent({
      // Fix: Use gemini-3-flash-preview for basic text tasks
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Fix: Access response.text as a property
    return response.text || "Summary unavailable.";
  } catch (error) {
    console.error("Gemini Report Error:", error);
    return "Could not generate AI summary.";
  }
};
