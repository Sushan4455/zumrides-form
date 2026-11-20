import { GoogleGenerativeAI } from '@google/generative-ai';

export const DEFAULT_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

export const getStoredGeminiApiKey = (overrideKey = '') => {
  if (overrideKey && overrideKey.trim()) return overrideKey.trim();
  try {
    const saved = localStorage.getItem('zum_gemini_api_key');
    if (saved && saved.trim()) return saved.trim();
  } catch (e) {}
  return (import.meta.env.VITE_GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY).trim();
};

const callVertexOrGeminiRest = async (apiKey, modelName, prompt) => {
  const endpoints = apiKey.startsWith('AQ.')
    ? [
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`
      ]
    : [
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`
      ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (text.trim()) return text.trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini API request failed');
};

const generateWithFallback = async (apiKey, prompt) => {
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      return await callVertexOrGeminiRest(apiKey, modelName, prompt);
    } catch (err) {
      lastError = err;
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        if (text) return text;
      } catch (sdkErr) {
        lastError = sdkErr;
      }
    }
  }
  throw lastError || new Error('Unable to reach Gemini AI model.');
};

// Smart local fallback refiner if offline or API quota reached
const localSmartRefine = (rawText, style = 'professional') => {
  if (!rawText || !rawText.trim()) return rawText;
  let cleaned = rawText
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bi\b/g, 'I');
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?]$/.test(cleaned)) cleaned += '.';

  if (/^no\s+pre[\s-]*task/i.test(cleaned)) {
    return 'Pre-task cross checks were not conducted during this shift as noted by operations.';
  }
  if (/^no\s+routine/i.test(cleaned)) {
    return 'No routine cycle checkup issues were recorded during this operational shift.';
  }
  if (style === 'concise') {
    return cleaned;
  }
  return cleaned;
};

export const refineTextWithAI = async (rawText, customApiKey = '', style = 'professional', sectionTitle = '') => {
  const API_KEY = getStoredGeminiApiKey(customApiKey);

  if (!rawText || !rawText.trim()) {
    return rawText;
  }

  const styleInstruction =
    style === 'grammar'
      ? 'Fix all grammar, spelling, punctuation, and awkward phrasing while keeping the original meaning and length.'
      : style === 'concise'
      ? 'Rewrite into a crisp, concise, and direct operational summary without unnecessary words.'
      : 'Rewrite into a highly professional, clear, and formal tone suitable for an executive operations report.';

  try {
    const prompt = `
You are an expert operational manager tasked with writing formal shift reports.
${sectionTitle ? `Section Title: "${sectionTitle}"` : ''}
${styleInstruction}
Keep all cycle IDs, staff names, numbers, and facts 100% accurate.

CRITICAL RULES:
1. ONLY output the rewritten text.
2. DO NOT add any conversational filler (e.g. "Here is the rewritten text", "Sure", "Certainly").
3. DO NOT complain about missing context or say "No data found". Even if the input is very short, rephrase it into a clean professional statement (e.g. "no pre task due to rain" -> "Pre-task cross checks were suspended due to adverse weather conditions.").
4. Do not invent or fabricate facts.

Raw Text:
"${rawText}"
    `;

    return await generateWithFallback(API_KEY, prompt);
  } catch (error) {
    console.warn('Falling back to smart local refiner:', error);
    return localSmartRefine(rawText, style);
  }
};

export const analyzeReportAndGenerateSummariesWithAI = async (reportSnapshot, customApiKey = '') => {
  const API_KEY = getStoredGeminiApiKey(customApiKey);

  const prompt = `
You are an executive operations analyst for Zum Operations.
Analyze the entire daily shift report data below (including all sections, paragraphs, and table rows) and generate three professional sections:
1. "opening": The Opening / Executive Operations Summary (Section 1). Summarize all operational activities, total checkups, issues identified in tables, and repairs recorded across the report in 2 clear, formal paragraphs.
2. "individual": The Individual Staff Work Summary (Section 6). Analyze every table and section in the report to identify each staff member and list exactly what they accomplished (e.g., routine checkups, pre-task checks, overall inspections, station visits, mechanical repairs, battery swaps, or issues logged). Format as an array of strings, one per staff member (e.g., "Kabir: Completed routine checkups on cycles 101, 55 and reported a brake issue on cycle 55."). If no specific staff names appear in the data, provide a clean professional summary of the team's shift status.
3. "closing": The Operational Closing Summary. Synthesize the overall shift status, total activities and issues found across the report, follow-up action items for maintenance/operations before cycles return to service, and a formal closing statement in 2 paragraphs.

Report Content Snapshot:
${JSON.stringify(reportSnapshot, null, 2)}

CRITICAL RULES:
1. Respond ONLY with a valid JSON object with keys: "opening" (string), "individual" (array of strings), and "closing" (string).
2. Do NOT wrap in markdown code fences (\`\`\`json). Output raw JSON only.
3. Base all numbers, cycle IDs, staff names, and issue descriptions strictly on what is present in the Report Content Snapshot.
`;

  try {
    let text = await generateWithFallback(API_KEY, prompt);
    if (text.startsWith('```json')) text = text.substring(7);
    else if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);
    const parsed = JSON.parse(text.trim());
    if (parsed && (parsed.opening || parsed.individual || parsed.closing)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Gemini API unreachable, generating smart analytical summary from report DOM:', error);
  }

  // Deterministic intelligent analyzer fallback using the live report snapshot
  const staffMap = new Map();
  let totalTableEntries = 0;
  let totalIssuesOrRepairs = 0;
  const activeSections = [];

  (reportSnapshot.sections || []).forEach(sec => {
    const titleLower = (sec.title || '').toLowerCase();
    if (titleLower.includes('executive') || titleLower.includes('closing') || titleLower.includes('individual')) {
      return;
    }
    if (sec.rows && sec.rows.length > 0) {
      activeSections.push(`${sec.title.replace(/^\d+[\.\)]\s*/, '')} (${sec.rows.length} entry/entries)`);
      sec.rows.forEach(row => {
        totalTableEntries++;
        const cId = row[0] || '';
        const sName = row[1] || '';
        const desc = row[2] || '';
        if (desc && desc !== '—' && !/^no\s+/i.test(desc)) {
          totalIssuesOrRepairs++;
        }
        if (sName && sName !== '—' && !/grand\s*total|staff/i.test(sName)) {
          if (!staffMap.has(sName)) staffMap.set(sName, []);
          staffMap.get(sName).push(
            `${sec.title.replace(/^\d+[\.\)]\s*/, '')}: Cycle ${cId}${desc && desc !== '—' ? ` (${desc})` : ''}`
          );
        }
      });
    }
  });

  const staffCount = staffMap.size;
  const opening =
    totalTableEntries > 0
      ? `This report summarizes the operational activities and inspection findings recorded for the current shift. Across the active operational categories (${activeSections.join(', ')}), the team documented ${totalTableEntries} table record(s) involving ${staffCount || 'assigned'} staff member(s), with ${totalIssuesOrRepairs} actionable issue or maintenance detail(s) logged for review.\n\nThe sections below detail the cycle-level inspections, reported mechanical or electrical conditions, staff-level contributions, and repair actions completed during the reporting window.`
      : `This report summarizes the operational status recorded for the current shift. All inspection sections, checkup tables, and maintenance logs have been initialized and reviewed for the current reporting window.\n\nThe sections below provide the structured breakdown of routine checkups, pre-task cross checks, overall cycle inspections, station visits, and mechanical maintenance records.`;

  const individual =
    staffMap.size > 0
      ? Array.from(staffMap.entries()).map(
          ([name, items]) => `${name}: Logged ${items.length} operational record(s) — ${items.join('; ')}.`
        )
      : [
          'Operations & Maintenance Team: All shift checkup channels and inspection logs were monitored; no individual staff exceptions were flagged outside the recorded section tables.'
        ];

  const closing =
    totalTableEntries > 0
      ? `In closing, this shift accounted for ${totalTableEntries} documented operational table record(s) across ${staffCount || 'the'} team member(s), including ${totalIssuesOrRepairs} noted issue or repair item(s). Any cycles flagged with mechanical, electrical, or part deficiencies must be verified by the maintenance team prior to redeployment.\n\nThis operational report reflects the verified data and live inspection tables recorded in the Zum Operations system for the date indicated above.`
      : `In closing, all operational categories for this shift have been reviewed with no unresolved critical incidents remaining outside the documented sections. Any cycles scheduled for upcoming routine or overall inspections should proceed according to the daily assignment roster.\n\nThis operational report reflects the verified information entered in the Zum Operations system for the reporting period shown above.`;

  return { opening, individual, closing };
};

export const refineReportParagraphsWithAI = async (paragraphsArray, customApiKey = '', style = 'professional') => {
  const API_KEY = getStoredGeminiApiKey(customApiKey);

  if (!API_KEY) {
    throw new Error('Gemini API key is missing. Please enter your Google Gemini API key in the AI settings.');
  }

  if (!Array.isArray(paragraphsArray) || paragraphsArray.length === 0) {
    return paragraphsArray;
  }

  try {
    const prompt = `
You are an expert operational manager refining the language of a daily shift operations report.
You are given a JSON array of strings (paragraphs and issue descriptions from the report).
Refine the English grammar, clarity, and professional executive tone of each string while strictly preserving all cycle IDs, staff names, dates, counts, and technical facts.

CRITICAL RULES:
1. Return ONLY a valid JSON array of strings with the EXACT same number of items and in the EXACT same order as the input array.
2. Do NOT wrap the response in markdown code fences (\`\`\`json). Output raw JSON only.
3. If an item is just a short label, date line (e.g. "Date: ... | Prepared by: ..."), or single number/ID, keep it clean and intact.

Input JSON Array:
${JSON.stringify(paragraphsArray, null, 2)}
    `;

    let text = await generateWithFallback(API_KEY, prompt);
    if (text.startsWith('```json')) text = text.substring(7);
    else if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);

    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed) && parsed.length === paragraphsArray.length) {
      return parsed;
    }
    return paragraphsArray;
  } catch (error) {
    console.error('Error refining report paragraphs with AI:', error);
    throw new Error('AI Refine Error: ' + (error.message || 'Unknown error'));
  }
};

export const executeAICommand = async (currentOverrides, userCommand, customApiKey = '') => {
  const API_KEY = getStoredGeminiApiKey(customApiKey);

  if (!API_KEY) {
    throw new Error('Gemini API key is missing. Please enter your Google Gemini API key.');
  }

  try {
    const prompt = `
You are an expert operational manager AI assistant. Your task is to update a shift report's configuration based on the user's command.
The report has 9 sections. The user will ask you to add, remove, or modify something in the report.
You must return the updated sections as a valid JSON object. ONLY return the JSON.

Current Sections Data:
${JSON.stringify(currentOverrides, null, 2)}

User Command:
"${userCommand}"

CRITICAL RULES:
1. Respond ONLY with a valid JSON object containing the exact keys: executive, routine, pretask, overall, station, individual, rider, mechanical, extra.
2. Maintain a highly professional, formal tone.
3. If the user asks to "add" something, append it professionally to the appropriate section.
4. If a section doesn't need changes, leave its text exactly as it was.
5. DO NOT include markdown code block formatting (like \`\`\`json) in your response, output just the raw JSON object string.
`;

    let text = await generateWithFallback(API_KEY, prompt);

    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }

    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error processing AI command:', error);
    throw new Error('AI Command Error: ' + (error.message || 'Unknown error'));
  }
};
