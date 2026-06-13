import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// -------------------------------------------------------------
// 1. Mathematical Epidemic Simulation (180-day SIR Model)
// -------------------------------------------------------------
type SocialDistanceLevel = 'none' | 'mild' | 'moderate' | 'strict';

interface SimulationParams {
  vaccRate: number;
  socialDistance: SocialDistanceLevel;
  testingIntensity: number;
}

interface SimulationResult {
  peakCases: number;
  peakDay: number;
  totalDurationDays: number;
  rEffective: number;
  dailyCases: number[];
  dailyBeds: number[];
  hospitalPeakBeds: number;
  regionalDistribution: {
    northeast: number;
    midwest: number;
    south: number;
    west: number;
  };
  params: SimulationParams;
  summary: string;
}

export function runSIRModel({ vaccRate, socialDistance, testingIntensity }: SimulationParams): SimulationResult {
  const POPULATION = 100_000_000;
  let S = POPULATION - 2_400_000; // Susceptible (initially 97.6M)
  let I = 2_400_000;              // Infected (initially 2.4M)
  let R = 0;                       // Recovered
  const R0 = 3.2;                  // Base reproduction rate

  // Reduction factors
  const vaccEffect = (vaccRate / 100) * 0.72; // max 72% transmission reduction
  const sdEffect = { none: 0, mild: 0.18, moderate: 0.48, strict: 0.75 }[socialDistance] || 0;
  const testEffect = (testingIntensity / 100) * 0.25; // max 25% early detection isolation reduction
  const totalReduction = Math.min(vaccEffect + sdEffect + testEffect, 0.95);
  const Reff = R0 * (1 - totalReduction);

  const dailyCases: number[] = [];
  const dailyBeds: number[] = [];
  let peakCases = I;
  let peakDay = 0;

  for (let day = 0; day < 180; day++) {
    // Standard SIR formulation
    const newI = (S / POPULATION) * I * Reff * 0.15; // daily transmission coefficient
    const newR = I * 0.08; // 8% recovery/turnover rate daily
    S = Math.max(0, S - newI);
    I = Math.max(0, I + newI - newR);
    R += newR;
    
    dailyCases.push(Math.round(I));
    // 0.8% of active cases might need high-care or regular beds
    dailyBeds.push(Math.round(I * 0.008));
    
    if (I > peakCases) {
      peakCases = I;
      peakDay = day;
    }
  }

  // Find day where infections drop below 12,000 threshold
  const endDay = dailyCases.findIndex((c, i) => i > peakDay && c < 12000);
  const totalDurationDays = endDay === -1 ? 180 : endDay;
  const peakCasesRounded = Math.round(peakCases);

  return {
    peakCases: peakCasesRounded,
    peakDay,
    totalDurationDays,
    rEffective: parseFloat(Reff.toFixed(2)),
    dailyCases,
    dailyBeds,
    hospitalPeakBeds: Math.round(peakCasesRounded * 0.008),
    regionalDistribution: {
      northeast: Math.round(peakCasesRounded * 0.22),
      midwest: Math.round(peakCasesRounded * 0.24),
      south: Math.round(peakCasesRounded * 0.30),
      west: Math.round(peakCasesRounded * 0.24)
    },
    params: { vaccRate, socialDistance, testingIntensity },
    summary: `With a ${vaccRate}% vaccination rate, ${socialDistance} social mitigation mandates, and ${testingIntensity}% surveillance diagnostics scope, the transmission rate (Reff) is limited to ${Reff.toFixed(2)}. This results in a peak caseload of ${(peakCasesRounded / 1e6).toFixed(2)}M infections on day ${peakDay}, requiring up to ${Math.round(peakCasesRounded * 0.008).toLocaleString()} localized surge capacity beds.`
  };
}

// -------------------------------------------------------------
// 2. Gemini Client Initialization
// -------------------------------------------------------------
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Offline backup simulation modes will be active.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// -------------------------------------------------------------
// 2.5 Linkup Web Search utility
// -------------------------------------------------------------
async function fetchLinkupSearch(query: string, depth = 'standard'): Promise<any[]> {
  const apiKey = process.env.LINKUP_API_KEY || "4c0e0100-fe2a-422e-b706-d8d1556e664b";
  try {
    const response = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        q: query,
        query: query, // Provide both potential query keys to be safe
        depth: depth,
        outputType: "searchResults"
      })
    });
    
    if (!response.ok) {
      console.error(`Linkup Web Search responded with status: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    let resultsArray: any[] = [];
    
    if (Array.isArray(data)) {
      resultsArray = data;
    } else if (data && Array.isArray(data.results)) {
      resultsArray = data.results;
    } else if (data && Array.isArray(data.searchResults)) {
      resultsArray = data.searchResults;
    } else if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          resultsArray = data[key];
          break;
        }
      }
    }
    
    return resultsArray.map((item: any) => ({
      name: item.title || item.name || item.heading || "Web Result",
      url: item.url || item.href || item.link || "#",
      snippet: item.snippet || item.content || item.description || item.text || ""
    }));
  } catch (error) {
    console.error("Linkup search transaction error:", error);
    return [];
  }
}

// -------------------------------------------------------------
// 3. API Endpoints
// -------------------------------------------------------------

// Independent search route using the Linkup API securely
app.post('/api/search', async (req, res) => {
  try {
    const { query, depth = 'standard' } = req.body;
    if (!query) {
      return res.status(400).json({ error: "A search query is required." });
    }
    const results = await fetchLinkupSearch(query, depth);
    return res.json({ query, results });
  } catch (err: any) {
    console.error("Linkup API search endpoint error:", err);
    return res.status(500).json({ error: err.message || "Failed to execute Linkup search request." });
  }
});

// Single direct simulation parameters runner
app.post('/api/simulate', (req, res) => {
  try {
    const { vaccRate = 45, socialDistance = 'moderate', testingIntensity = 50 } = req.body;
    let validDistance: SocialDistanceLevel = 'moderate';
    if (['none', 'mild', 'moderate', 'strict'].includes(socialDistance)) {
      validDistance = socialDistance as SocialDistanceLevel;
    }
    const result = runSIRModel({
      vaccRate: Math.max(0, Math.min(100, Number(vaccRate))),
      socialDistance: validDistance,
      testingIntensity: Math.max(0, Math.min(100, Number(testingIntensity)))
    });
    return res.json(result);
  } catch (err: any) {
    console.error("Simulation endpoint error:", err);
    return res.status(500).json({ error: err.message || "Failed to execute epidemiological simulation." });
  }
});

// Chatbot prompt model coordinator
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], currentParams, webSearchEnabled = false } = req.body;
    if (!message) {
      return res.status(400).json({ error: "A message prompt is required." });
    }

    const ai = getGeminiClient();
    
    // Default fallback parameters in case AI fails or is not available
    let extractedParams = {
      vaccRate: currentParams?.vaccRate ?? 45,
      socialDistance: currentParams?.socialDistance ?? 'moderate',
      testingIntensity: currentParams?.testingIntensity ?? 50
    };
    
    let answerText = "";
    let potentialTasks: any[] = [];
    let searchGrounding: any = undefined;

    if (ai) {
      let systemInstruction = 
        `You are the expert epidemiological simulator agent representing the World Coordination Center.
        Analyze the user's scenario description or coordination directive.
        Your main goal is to extract three primary parameter values:
        - "vaccRate": Number (0-100), defaults to the past value or current baseline (45) if unspecified.
        - "socialDistance": One of: "none", "mild", "moderate", "strict", defaults to baseline if unspecified.
        - "testingIntensity": Number (0-100), defaults to the past value or current baseline (50) if unspecified.

        Analyze standard guidelines, vaccine rates, lockdowns, border closures, or policy updates mentioned.
        Provide a smart, clear, and professional response in "answerText". Ensure there is NO markdown-bold syntax like * or ** within variables. Keep it readable.
        Also, propose up to 4 contextual action tasks that should be added to the global stakeholder board under specific groups:
        - "public_health" (Public Health Officials)
        - "hospital" (Hospital Administrators)
        - "policy" (Policy Makers)
        - "media" (Media & Communication)
        Regions can be "Americas", "Europe", "Asia-Pacific", "Africa & ME", or "All".
        Priority is "High", "Medium", "Low".
        Provide realistic, actionable tasks based on the calculated severity of cases! If the caseload is extremely high, push High priority hospital tasks immediately.`;

      if (webSearchEnabled) {
        console.log(`Grounding Gemini with Linkup web search for query: "${message}"`);
        const sources = await fetchLinkupSearch(message, "standard");
        if (sources && sources.length > 0) {
          const matchedSources = sources.slice(0, 5);
          searchGrounding = {
            query: message,
            answer: "",
            sources: matchedSources
          };

          const searchContext = matchedSources.map((s: any, idx: number) => 
            `[Web Source #${idx+1}]
            Title: ${s.name}
            URL: ${s.url}
            Snippet: ${s.snippet}`
          ).join("\n\n");

          systemInstruction = `${systemInstruction}

          --- REAL-TIME LIVE WEB GROUNDING (Sourced via Linkup API) ---
          Here is hot-off-the-press world data, news, public health policies, or epidemic updates retrieved from the live web for this context:
          
          ${searchContext}

          Strict grounding instructions: Incorporate the search results into your reasoning. Reference them naturally if they contain real stats or qualitative recommendations. Cite them in your "answerText" as [1], [2], etc., corresponding to their source number. Inform the user that you are consulting live international intelligence.`;
        }
      }

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            ...history.map((h: any) => ({
              role: h.sender === 'user' ? 'user' : 'model',
              parts: [{ text: h.text }]
            })),
            { role: 'user', parts: [{ text: `Current parameters context: ${JSON.stringify(extractedParams)}. User action request: ${message}` }] }
          ],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                extractedParams: {
                  type: Type.OBJECT,
                  properties: {
                    vaccRate: { type: Type.INTEGER, description: "Extracted or estimated vaccine rate (0-100)" },
                    socialDistance: { type: Type.STRING, description: "Extracted or estimated social distancing level: 'none', 'mild', 'moderate', 'strict'" },
                    testingIntensity: { type: Type.INTEGER, description: "Extracted testing and diagnostics reach (0-100)" }
                  },
                  required: ["vaccRate", "socialDistance", "testingIntensity"]
                },
                answerText: { type: Type.STRING, description: "Professional, comprehensive description of the consequences and epidemic curves with no markdown styling" },
                potentialTasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Task title, e.g. 'Issue national booster advice'" },
                      group: { type: Type.STRING, description: "Target group: public_health, hospital, policy, or media" },
                      region: { type: Type.STRING, description: "Geographic scope: Americas, Europe, Asia-Pacific, Africa & ME, All" },
                      priority: { type: Type.STRING, description: "Priority level: High, Medium, Low" },
                      dueTime: { type: Type.STRING, description: "Timeframe limit, e.g. '3 hours', '1 day'" }
                    },
                    required: ["title", "group", "region", "priority", "dueTime"]
                  }
                }
              },
              required: ["extractedParams", "answerText", "potentialTasks"]
            }
          }
        });

        const parsedContent = JSON.parse(response.text || '{}');
        if (parsedContent.extractedParams) {
          extractedParams = {
            vaccRate: Math.max(0, Math.min(100, Number(parsedContent.extractedParams.vaccRate || 0))),
            socialDistance: (['none', 'mild', 'moderate', 'strict'].includes(parsedContent.extractedParams.socialDistance)
              ? parsedContent.extractedParams.socialDistance
              : 'moderate') as SocialDistanceLevel,
            testingIntensity: Math.max(0, Math.min(100, Number(parsedContent.extractedParams.testingIntensity || 0)))
          };
        }
        answerText = parsedContent.answerText || "Calculated optimal spread levels of transmission successfully.";
        potentialTasks = parsedContent.potentialTasks || [];
      } catch (innerError: any) {
        console.error("Gemini call fell back to pure heuristics:", innerError);
        // Simple word matches for offline/fallback mode
        const text = message.toLowerCase();
        if (text.includes("vaccin") || text.includes("vax")) {
          const match = text.match(/(\d+)%/);
          if (match) extractedParams.vaccRate = parseInt(match[1]);
        }
        if (text.includes("lockdown") || text.includes("isolation") || text.includes("distanc")) {
          if (text.includes("strict") || text.includes("hard")) extractedParams.socialDistance = 'strict';
          else if (text.includes("mild") || text.includes("low")) extractedParams.socialDistance = 'mild';
          else if (text.includes("none") || text.includes("free")) extractedParams.socialDistance = 'none';
          else extractedParams.socialDistance = 'moderate';
        }
        if (text.includes("test") || text.includes("diagnost")) {
          const match = text.match(/(\d+)%/);
          if (match) extractedParams.testingIntensity = parseInt(match[1]);
        }
        
        answerText = `I have updated the simulator scenario on your behalf. Vaccination level: ${extractedParams.vaccRate}%, Social mandate: ${extractedParams.socialDistance}, Diagnostics: ${extractedParams.testingIntensity}%. See updated disease curve projection charts on the control side-deck.`;
        potentialTasks = [
          { title: "Review vaccination surge", group: "public_health", region: "All", priority: "Medium", dueTime: "24h" },
          { title: "Align local hospital staffing levels", group: "hospital", region: "All", priority: "High", dueTime: "12h" }
        ];
      }
    } else {
      // Direct local extraction if API key is not supplied
      const text = message.toLowerCase();
      if (text.includes("vaccin") || text.includes("vax") || text.includes("percent")) {
        const match = text.match(/(\d+)%/);
        if (match) extractedParams.vaccRate = parseInt(match[1]);
      }
      if (text.includes("lockdown") || text.includes("strict") || text.includes("distanc")) {
        if (text.includes("strict") || text.includes("hard")) extractedParams.socialDistance = 'strict';
        else if (text.includes("mild") || text.includes("low")) extractedParams.socialDistance = 'mild';
        else if (text.includes("none") || text.includes("free")) extractedParams.socialDistance = 'none';
        else extractedParams.socialDistance = 'moderate';
      }
      if (text.includes("test")) {
        const match = text.match(/(\d+)%/);
        if (match) extractedParams.testingIntensity = parseInt(match[1]);
      }
      answerText = `The coordination deck has simulated the local scenarios safely. Social Mitigation: ${extractedParams.socialDistance.toUpperCase()}. Vaccination cover: ${extractedParams.vaccRate}%. Active quarantine tracking: ${extractedParams.testingIntensity}%. Projections are plotted instantly side-by-side.`;
      potentialTasks = [
        { title: "Initiate daily stakeholder response briefs", group: "policy", region: "All", priority: "High", dueTime: "6h" },
        { title: "Coordinate regional bed status update", group: "hospital", region: "Americas", priority: "Medium", dueTime: "12h" }
      ];
    }

    // Run actual SIR calculations based on final parameters
    const simResult = runSIRModel({
      vaccRate: extractedParams.vaccRate,
      socialDistance: extractedParams.socialDistance,
      testingIntensity: extractedParams.testingIntensity
    });

    if (searchGrounding) {
      searchGrounding.answer = answerText;
    }

    return res.json({
      answerText,
      extractedParams,
      simulationResult: simResult,
      searchGrounding,
      tasks: potentialTasks.map((t: any, idx: number) => ({
        id: `spawned-${Date.now()}-${idx}`,
        title: t.title,
        group: t.group,
        region: t.region,
        priority: t.priority,
        dueTime: t.dueTime,
        status: 'open',
        createdAt: new Date().toISOString()
      }))
    });

  } catch (err: any) {
    console.error("Unified chat processing fell over:", err);
    return res.status(500).json({ error: err.message || "An error occurred during conversational simulation." });
  }
});

// CSV Raw Export route
app.post('/api/export/csv', (req, res) => {
  try {
    const { results } = req.body;
    if (!results || !results.dailyCases) {
      return res.status(400).json({ error: "No active simulation results to generate an export." });
    }

    const { vaccRate, socialDistance, testingIntensity } = results.params;
    let csvContent = `Day,Active Infections,Beds Required\n`;
    for (let d = 0; d < 180; d++) {
      csvContent += `${d},${results.dailyCases[d] || 0},${results.dailyBeds[d] || 0}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="epidemic_simulation_v${vaccRate}_sd_${socialDistance}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err: any) {
    console.error("Export error:", err);
    return res.status(500).json({ error: "Failed to generate file export." });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// -------------------------------------------------------------
// 4. Vite Integration & App Startup
// -------------------------------------------------------------
const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve production static assets
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(` Epidemic Spread Simulator Server is running at:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

startServer();
