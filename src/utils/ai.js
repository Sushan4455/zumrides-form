import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the API with the key from environment variables
// Vite exposes env variables prefixed with VITE_ via import.meta.env
export const refineTextWithAI = async (rawText) => {
  // Read the API key dynamically inside the function
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  
  if (!API_KEY) {
    throw new Error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file AND restart your server (npm run dev).');
  }
  
  if (!rawText || !rawText.trim()) {
    return rawText;
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Using the recommended latest model
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const prompt = `
You are an expert operational manager tasked with writing formal shift reports.
Rewrite the following raw notes into a highly professional, clear, and formal tone suitable for an executive operations report.
Keep it concise, factual, and direct. 

CRITICAL RULES:
1. ONLY output the rewritten text. 
2. DO NOT add any conversational filler (e.g. "Here is the rewritten text", "Sure", "Certainly").
3. DO NOT complain about missing context, missing data, or say "No data found". Even if the input is very short, simply rephrase it into a professional statement (e.g. "no pre task due to rain" -> "Pre-task cross checks were suspended due to adverse weather conditions.").
4. Do not add fabricated information.

Raw Notes:
"${rawText}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Error refining text with AI:', error);
    throw new Error('AI Error: ' + (error.message || 'Unknown error'));
  }
};
