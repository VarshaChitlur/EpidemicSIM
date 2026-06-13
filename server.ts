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

export interface EpidemicType {
  id: string;
  name: string;
  r0: number;
  vaccEffectiveness: number;
  hospitalRate: number;
  recoveryRate: number;
  description: string;
}

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

export function runSIRModel(
  { vaccRate, socialDistance, testingIntensity }: SimulationParams,
  epidemic?: EpidemicType
): SimulationResult {
  const POPULATION = 100_000_000;
  let S = POPULATION - 2_400_000; // Susceptible (initially 97.6M)
  let I = 2_400_000;              // Infected (initially 2.4M)
  let R = 0;                       // Recovered
  
  const R0 = epidemic ? epidemic.r0 : 3.2;                  // Base reproduction rate
  const vaccEffCoeff = epidemic ? epidemic.vaccEffectiveness : 0.72;
  const hospitalRateCoeff = epidemic ? epidemic.hospitalRate : 0.008;
  const recoveryRateCoeff = epidemic ? epidemic.recoveryRate : 0.08;

  // Reduction factors
  const vaccEffect = (vaccRate / 100) * vaccEffCoeff; // max reduction
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
    const newR = I * recoveryRateCoeff; // recovery/turnover rate daily
    S = Math.max(0, S - newI);
    I = Math.max(0, I + newI - newR);
    R += newR;
    
    dailyCases.push(Math.round(I));
    dailyBeds.push(Math.round(I * hospitalRateCoeff));
    
    if (I > peakCases) {
      peakCases = I;
      peakDay = day;
    }
  }

  // Find day where infections drop below 12,000 threshold
  const endDay = dailyCases.findIndex((c, i) => i > peakDay && c < 12000);
  const totalDurationDays = endDay === -1 ? 180 : endDay;
  const peakCasesRounded = Math.round(peakCases);

  const epName = epidemic ? epidemic.name : "COVID-19";

  return {
    peakCases: peakCasesRounded,
    peakDay,
    totalDurationDays,
    rEffective: parseFloat(Reff.toFixed(2)),
    dailyCases,
    dailyBeds,
    hospitalPeakBeds: Math.round(peakCasesRounded * hospitalRateCoeff),
    regionalDistribution: {
      northeast: Math.round(peakCasesRounded * 0.22),
      midwest: Math.round(peakCasesRounded * 0.24),
      south: Math.round(peakCasesRounded * 0.30),
      west: Math.round(peakCasesRounded * 0.24)
    },
    params: { vaccRate, socialDistance, testingIntensity },
    summary: `For ${epName} with a ${vaccRate}% vaccination rate, ${socialDistance} social mitigation mandates, and ${testingIntensity}% surveillance diagnostics scope, the transmission rate (Reff) is limited to ${Reff.toFixed(2)}. This results in a peak caseload of ${(peakCasesRounded / 1e6).toFixed(2)}M infections on day ${peakDay}, requiring up to ${Math.round(peakCasesRounded * hospitalRateCoeff).toLocaleString()} localized surge capacity beds.`
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
// 2.7 AG UI & A2UI Open Protocol State Engine
// -------------------------------------------------------------

interface AgentActionLogEntry {
  id: string;
  timestamp: string;
  sender: 'agent_antigravity' | 'agent_gemini' | 'system' | 'user';
  type: 'SET_PARAMS' | 'ADD_TASK' | 'PROTOCOL_INIT' | 'TRIGGER_WAVE' | 'RESET';
  payload: any;
}

interface AgentSessionState {
  currentParams: {
    vaccRate: number;
    socialDistance: SocialDistanceLevel;
    testingIntensity: number;
    selectedEpidemicId: string;
  };
  actionsLog: AgentActionLogEntry[];
  externalTasks: Array<{
    id: string;
    title: string;
    group: 'public_health' | 'hospital' | 'policy' | 'media';
    region: 'All' | 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME';
    priority: 'High' | 'Medium' | 'Low';
    dueTime: string;
  }>;
}

let agentSession: AgentSessionState = {
  currentParams: {
    vaccRate: 45,
    socialDistance: 'moderate',
    testingIntensity: 50,
    selectedEpidemicId: 'covid19'
  },
  actionsLog: [
    {
      id: 'init-protocol-node',
      timestamp: new Date().toISOString(),
      sender: 'system',
      type: 'PROTOCOL_INIT',
      payload: { 
        version: '1.2.0', 
        profile: 'Epidemic Spread Coordinator Gateway',
        ag_ui_supported: true,
        a2ui_supported: true 
      }
    }
  ],
  externalTasks: []
};

// -------------------------------------------------------------
// 3. API Endpoints
// -------------------------------------------------------------

// A1: A2UI Specificaiton Discovery Schema Endpoint
app.get('/api/a2ui/config', (req, res) => {
  return res.json({
    protocol: "Agent-to-User-Interface (A2UI) & Antigravity (AG) UI Open Standards",
    spec_version: "1.2.0",
    client_bridge: "Express/React 19 Active Polling Bridge",
    documentation: {
      overview: "Allows autonomous agent systems (such as Antigravity and Gemini) to discover UI controls, read state variables, register visual manifests, and dispatch deterministic action instructions.",
      schemas: {
        A2UI_State_Sync_Request: "GET /api/a2ui/state",
        A2UI_Action_Execution: "POST /api/a2ui/action",
        AG_UI_Discovery: "GET /api/a2ui/config"
      }
    },
    capabilities: {
      simulationControl: {
        parameters: {
          vaccRate: { type: "integer", min: 0, max: 100, default: 45, description: "Active vaccination target threshold percentage" },
          socialDistance: { type: "enum", values: ["none", "mild", "moderate", "strict"], default: "moderate", description: "Mandated community movement restrictions" },
          testingIntensity: { type: "integer", min: 0, max: 100, default: 50, description: "Surveillance diagnostics and contact isolation level" },
          selectedEpidemicId: { type: "string", values: ["covid19", "h5n1", "disease_x", "ebola", "mpox", "nipah"], default: "covid19", description: "The active pathogen epidemic footprint being simulated" }
        },
        actions: {
          SET_PARAMS: "Directly instructs the UI state to align with specified mathematical vectors",
          RESET: "Reverts entire environmental state back to default offline coordinates"
        }
      },
      coordinationBoard: {
        actions: {
          ADD_TASK: {
            description: "Syndicates a high-importance public health mandate task directly onto the global stakeholder board",
            arguments: {
              title: { type: "string", required: true },
              group: { type: "enum", values: ["public_health", "hospital", "policy", "media"], required: true },
              region: { type: "enum", values: ["All", "Americas", "Europe", "Asia-Pacific", "Africa & ME"], required: true },
              priority: { type: "enum", values: ["High", "Medium", "Low"], required: true },
              dueTime: { type: "string", default: "24h" }
            }
          }
        }
      }
    },
    endpoints: {
      get_discovery: "GET /api/a2ui/config",
      get_session_state: "GET /api/a2ui/state",
      post_agent_action: "POST /api/a2ui/action"
    }
  });
});

// A2: A2UI Active State Sync Retrieval
app.get('/api/a2ui/state', (req, res) => {
  return res.json(agentSession);
});

// A3: A2UI Deterministic Action Ingress Dispatcher
app.post('/api/a2ui/action', (req, res) => {
  try {
    const { actionType, payload, sender = 'agent_antigravity' } = req.body;
    if (!actionType) {
      return res.status(400).json({ error: "Required field actionType missing in protocol envelop." });
    }

    const entryId = `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();

    if (actionType === 'SET_PARAMS') {
      const { vaccRate, socialDistance, testingIntensity, selectedEpidemicId } = payload || {};
      
      if (vaccRate !== undefined) agentSession.currentParams.vaccRate = Math.max(0, Math.min(100, Number(vaccRate)));
      if (testingIntensity !== undefined) agentSession.currentParams.testingIntensity = Math.max(0, Math.min(100, Number(testingIntensity)));
      if (selectedEpidemicId !== undefined) agentSession.currentParams.selectedEpidemicId = String(selectedEpidemicId);
      if (socialDistance !== undefined && ['none', 'mild', 'moderate', 'strict'].includes(socialDistance)) {
        agentSession.currentParams.socialDistance = socialDistance as SocialDistanceLevel;
      }

      agentSession.actionsLog.unshift({
        id: entryId,
        timestamp,
        sender: sender as any,
        type: 'SET_PARAMS',
        payload
      });
      
      // Limit audit log size
      if (agentSession.actionsLog.length > 50) {
        agentSession.actionsLog = agentSession.actionsLog.slice(0, 50);
      }

      return res.json({ success: true, message: "A2UI Action standard parameters synced successfully.", state: agentSession });
    }

    if (actionType === 'ADD_TASK') {
      const { title, group, region = 'All', priority = 'Medium', dueTime = '24h' } = payload || {};
      if (!title || !group) {
        return res.status(400).json({ error: "Missing required properties (title, group) for ADD_TASK action payload." });
      }

      const newTask = {
        id: `ext-${Date.now()}`,
        title,
        group: group as any,
        region: region as any,
        priority: priority as any,
        dueTime
      };

      agentSession.externalTasks.unshift(newTask);
      
      agentSession.actionsLog.unshift({
        id: entryId,
        timestamp,
        sender: sender as any,
        type: 'ADD_TASK',
        payload: newTask
      });

      if (agentSession.actionsLog.length > 50) {
        agentSession.actionsLog = agentSession.actionsLog.slice(0, 50);
      }

      return res.json({ success: true, message: "A2UI stakeholder Action task registered.", state: agentSession });
    }

    if (actionType === 'RESET') {
      agentSession.currentParams = {
        vaccRate: 45,
        socialDistance: 'moderate',
        testingIntensity: 50,
        selectedEpidemicId: 'covid19'
      };
      agentSession.externalTasks = [];
      agentSession.actionsLog.unshift({
        id: entryId,
        timestamp,
        sender: sender as any,
        type: 'RESET',
        payload: {}
      });

      return res.json({ success: true, message: "A2UI state reset executed.", state: agentSession });
    }

    return res.status(400).json({ error: `Unsupported A2UI/AG UI actionType: '${actionType}'` });

  } catch (err: any) {
    console.error("A2UI Action execution trap error:", err);
    return res.status(500).json({ error: err.message || "Failed to parse and dispatch A2UI protocol action." });
  }
});

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
    const { vaccRate = 45, socialDistance = 'moderate', testingIntensity = 50, epidemic } = req.body;
    let validDistance: SocialDistanceLevel = 'moderate';
    if (['none', 'mild', 'moderate', 'strict'].includes(socialDistance)) {
      validDistance = socialDistance as SocialDistanceLevel;
    }
    const result = runSIRModel({
      vaccRate: Math.max(0, Math.min(100, Number(vaccRate))),
      socialDistance: validDistance,
      testingIntensity: Math.max(0, Math.min(100, Number(testingIntensity)))
    }, epidemic);
    return res.json(result);
  } catch (err: any) {
    console.error("Simulation endpoint error:", err);
    return res.status(500).json({ error: err.message || "Failed to execute epidemiological simulation." });
  }
});

// Chatbot prompt model coordinator
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], currentParams, webSearchEnabled = false, epidemic } = req.body;
    if (!message) {
      return res.status(400).json({ error: "A message prompt is required." });
    }

    const ai = getGeminiClient();
    let isFallbackMode = false;
    
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

        Currently, the active epidemic being simulated is:
        - Name: "${epidemic?.name || 'COVID-19'}"
        - R0 (Base Transmission): ${epidemic?.r0 || 3.2}
        - Hospitalization Rate: ${((epidemic?.hospitalRate || 0.008) * 100).toFixed(1)}%
        - Recovery Rate: ${((epidemic?.recoveryRate || 0.08) * 100).toFixed(1)}% daily
        - Details: "${epidemic?.description || 'Standard respiratory pathogen'}"

        Ensure your response "answerText" is highly specific to the transmission rate, symptoms, geographical context, and public health impact of this specific pathogen. Provide customized advice (e.g. emphasize vaccine mobilization if it's COVID, extreme isolation/PPE controls if it's Ebola, bat vector precautions if it's Nipah, etc.).

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
        isFallbackMode = true;
        console.log("Notice: Operational rate limit constraint met or offline. Engaging high-fidelity local SIR projection simulator.");
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
      isFallbackMode = true;
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
    }, epidemic);

    if (searchGrounding) {
      searchGrounding.answer = answerText;
    }

    return res.json({
      answerText,
      extractedParams,
      simulationResult: simResult,
      searchGrounding,
      isFallbackMode,
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
