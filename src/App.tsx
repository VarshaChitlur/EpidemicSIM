import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Activity,
  FileSpreadsheet,
  Users,
  CheckCircle,
  Calendar,
  ShieldAlert,
  Send,
  RefreshCw,
  Sliders,
  Plus,
  Check,
  Globe,
  Building,
  Briefcase,
  Radio,
  Clock,
  HeartPulse,
  LogOut,
  Sparkles,
  Inbox,
  ChevronDown,
  ChevronUp,
  Terminal,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';

import {
  SocialDistanceLevel,
  EpidemicType,
  SimulationParams,
  SimulationResult,
  Task,
  Message
} from './types';

import { CopilotServiceVisualizer } from './components/CopilotPanel';

// Global Epidemic/Pathogen Profiles
export const DEFAULT_EPIDEMICS: EpidemicType[] = [
  {
    id: 'covid19',
    name: 'COVID-19',
    r0: 3.2,
    vaccEffectiveness: 0.72,
    hospitalRate: 0.008,
    recoveryRate: 0.08,
    description: 'Moderate to high transmission respiratory infection with established vaccine coverage pathways.'
  },
  {
    id: 'h5n1',
    name: 'H5N1 Avian Influenza (Bird Flu)',
    r0: 2.0,
    vaccEffectiveness: 0.60,
    hospitalRate: 0.04,
    recoveryRate: 0.07,
    description: 'High severity zoonotic avian strain with elevated clinical hospitality requirements.'
  },
  {
    id: 'disease_x',
    name: '"Disease X" — A Novel Pathogen',
    r0: 5.0,
    vaccEffectiveness: 0.50,
    hospitalRate: 0.015,
    recoveryRate: 0.06,
    description: 'Highly contagious hypothetical agent with extreme transmission dynamics and fast-tracked vaccine trials.'
  },
  {
    id: 'ebola',
    name: 'Ebola (Bundibugyo Virus — Central Africa 2026)',
    r0: 1.8,
    vaccEffectiveness: 0.40,
    hospitalRate: 0.15,
    recoveryRate: 0.05,
    description: 'Extremely severe viral hemorrhagic fever with major regional surge bed dependency.'
  },
  {
    id: 'mpox',
    name: 'Mpox (New Clades)',
    r0: 1.5,
    vaccEffectiveness: 0.80,
    hospitalRate: 0.02,
    recoveryRate: 0.09,
    description: 'Contact-driven viral agent with high vaccine efficacy and moderate hospitalization load.'
  },
  {
    id: 'nipah',
    name: 'Nipah Virus',
    r0: 1.6,
    vaccEffectiveness: 0.30,
    hospitalRate: 0.12,
    recoveryRate: 0.06,
    description: 'Zoonotic paramyxovirus with high case-fatality rates requiring extensive negative-pressure isolation wards.'
  }
];

// Client-side quick simulation math for seamless, zero-latency slider interactions
const runSIRSimulation = (params: SimulationParams, epidemic?: EpidemicType): SimulationResult => {
  const activeEpidemic = epidemic || DEFAULT_EPIDEMICS[0];
  const POPULATION = 100_000_000;
  let S = POPULATION - 2_400_000;
  let I = 2_400_000;
  let R = 0;
  
  const R0 = activeEpidemic.r0;
  const vaccEffCoeff = activeEpidemic.vaccEffectiveness;
  const hospitalRateCoeff = activeEpidemic.hospitalRate;
  const recoveryRateCoeff = activeEpidemic.recoveryRate;

  const vaccEffect = (params.vaccRate / 100) * vaccEffCoeff;
  const sdEffect = { none: 0, mild: 0.18, moderate: 0.48, strict: 0.75 }[params.socialDistance] || 0;
  const testEffect = (params.testingIntensity / 100) * 0.25;
  const totalReduction = Math.min(vaccEffect + sdEffect + testEffect, 0.95);
  const Reff = R0 * (1 - totalReduction);

  const dailyCases: number[] = [];
  const dailyBeds: number[] = [];
  let peakCases = I;
  let peakDay = 0;

  for (let day = 0; day < 180; day++) {
    const newI = (S / POPULATION) * I * Reff * 0.15;
    const newR = I * recoveryRateCoeff;
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
    hospitalPeakBeds: Math.round(peakCasesRounded * hospitalRateCoeff),
    regionalDistribution: {
      northeast: Math.round(peakCasesRounded * 0.22),
      midwest: Math.round(peakCasesRounded * 0.24),
      south: Math.round(peakCasesRounded * 0.30),
      west: Math.round(peakCasesRounded * 0.24)
    },
    params,
    summary: `For ${activeEpidemic.name} with ${params.vaccRate}% vaccination rate, ${params.socialDistance} mitigation level, and ${params.testingIntensity}% diagnostics focus, Rt is limited to ${Reff.toFixed(2)}. Peak reaches ${(peakCasesRounded / 1e6).toFixed(2)}M infections, requiring ${Math.round(peakCasesRounded * hospitalRateCoeff).toLocaleString()} surge beds.`
  };
};

// Standard Static unmitigated baseline scenario to compare performance
const BASELINE_PARAMS: SimulationParams = {
  vaccRate: 10,
  socialDistance: 'none',
  testingIntensity: 15
};

const FALLBACK_BASELINE_RESULT = runSIRSimulation(BASELINE_PARAMS);

interface MiniTrendVisualizerProps {
  result: SimulationResult;
  baseline?: SimulationResult;
}

const MiniTrendVisualizer: React.FC<MiniTrendVisualizerProps> = ({ result, baseline }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const activeBaseline = baseline || FALLBACK_BASELINE_RESULT;

  const maxVal = Math.max(...result.dailyCases, ...activeBaseline.dailyCases, 1);
  const width = 280;
  const height = 75;

  const points = result.dailyCases.map((val, index) => {
    const x = (index / 179) * width;
    const y = height * 0.95 - (val / maxVal) * (height * 0.9);
    return `${x},${y}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  const baselinePoints = activeBaseline.dailyCases.map((val, index) => {
    const x = (index / 179) * width;
    const y = height * 0.95 - (val / maxVal) * (height * 0.9);
    return `${x},${y}`;
  });
  const baselinePath = `M ${baselinePoints.join(' L ')}`;

  const hoverX = hoverIndex !== null ? (hoverIndex / 179) * width : 0;
  const hoverYActive = hoverIndex !== null ? height * 0.95 - (result.dailyCases[hoverIndex] / maxVal) * (height * 0.9) : 0;
  const hoverYBaseline = hoverIndex !== null ? height * 0.95 - (activeBaseline.dailyCases[hoverIndex] / maxVal) * (height * 0.9) : 0;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.round((x / rect.width) * 179);
    if (index >= 0 && index <= 179) {
      setHoverIndex(index);
    }
  };

  const peakDiffPercent = Math.round((1 - result.peakCases / activeBaseline.peakCases) * 100);
  const isBetterThanBaseline = result.peakCases < activeBaseline.peakCases;
  const isControlled = result.rEffective < 1.0;

  const formatCaseNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k';
    return num.toString();
  };

  return (
    <div className="mt-3 p-3.5 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white/90 space-y-3 shadow-inner relative overflow-hidden group">
      {/* Mini background glass highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />

      {/* Title */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-1.5 font-bold text-white/95">
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          <span>SCENARIO TREND PROJECTION</span>
        </div>
        <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded border ${
          isControlled 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          Rt: {result.rEffective} {isControlled ? '(Controlled)' : '(Outbreak)'}
        </span>
      </div>

      {/* Meta parameters row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-white/50 font-mono border-b border-white/10 pb-2 relative z-10">
        <span>Vax: <b className="text-white">{result.params?.vaccRate ?? 45}%</b></span>
        <span className="opacity-40">•</span>
        <span>SD Mandates: <b className="text-white capitalize">{result.params?.socialDistance ?? 'moderate'}</b></span>
        <span className="opacity-40">•</span>
        <span>Testing: <b className="text-white">{result.params?.testingIntensity ?? 50}%</b></span>
      </div>

      {/* Highlights & Trend message */}
      <div className="grid grid-cols-2 gap-2 text-xs relative z-10 font-sans">
        <div className="bg-white/5 border border-white/10 p-2 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] text-white/40 font-semibold block mb-0.5 uppercase tracking-wide">Peak Infections</span>
          <div>
            <span className="font-extrabold text-white text-sm block font-mono">{formatCaseNumber(result.peakCases)}</span>
            <span className="text-[10px] text-white/55 block">Day {result.peakDay}</span>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 p-2 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] text-white/40 font-semibold block mb-0.5 uppercase tracking-wide">Healthcare Surge</span>
          <div>
            <span className="font-extrabold text-white text-sm block font-mono">{formatCaseNumber(result.hospitalPeakBeds)}</span>
            <span className="text-[10px] text-white/55 block">ICU Beds Peak</span>
          </div>
        </div>
      </div>

      {/* Live Trend commentary */}
      <div className={`p-2 rounded-xl border relative z-10 font-sans ${
        isBetterThanBaseline
          ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400/90'
          : 'bg-yellow-500/5 border-yellow-500/15 text-yellow-300/90'
      }`}>
        {isBetterThanBaseline ? (
          <p className="leading-snug">
            ✨ <b>Downward Trend:</b> Active simulation policies reduced peak spread by <b>{peakDiffPercent}%</b> relative to unmitigated defaults, keeping daily clinical surge risks minimized.
          </p>
        ) : (
          <p className="leading-snug">
            ⚠️ <b>High Load Trend:</b> Caseload curves closely mirror the unmitigated benchmark wave. Higher vaccinations or physical distancing levels are advised.
          </p>
        )}
      </div>

      {/* Interactive Sparkline Chart */}
      <div className="relative pt-1 border border-white/5 bg-black/15 rounded-xl p-2 z-10">
        <div className="flex justify-between items-center text-[9px] text-white/40 font-mono mb-1.5">
          <span>DAY 0</span>
          <span className="text-[10px] font-bold text-white/60">Caseload Waves Comparison (180 Days)</span>
          <span>DAY 180</span>
        </div>

        <div className="relative h-[85px] w-full mt-1">
          <svg
            className="w-full h-full cursor-crosshair overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={`grad-active-${result.peakCases}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Baseline trend dashed line */}
            <path
              d={baselinePath}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />

            {/* Active scenario area gradient fill */}
            <path
              d={areaPath}
              fill={`url(#grad-active-${result.peakCases})`}
              stroke="none"
            />

            {/* Active scenario line */}
            <path
              d={linePath}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Hover marker lines & dots */}
            {hoverIndex !== null && (
              <>
                {/* Vertical slider line */}
                <line
                  x1={hoverX}
                  y1={0}
                  x2={hoverX}
                  y2={height}
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth="1"
                />

                {/* Active curve dot */}
                <circle
                  cx={hoverX}
                  cy={hoverYActive}
                  r="4"
                  fill="#818cf8"
                  stroke="#fff"
                  strokeWidth="1.5"
                />

                {/* Baseline curve dot */}
                <circle
                  cx={hoverX}
                  cy={hoverYBaseline}
                  r="3"
                  fill="rgba(255,255,255,0.3)"
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="1"
                />
              </>
            )}

            {/* Peak indicator reference circle */}
            <circle
              cx={(result.peakDay / 179) * width}
              cy={height * 0.95 - (result.peakCases / maxVal) * (height * 0.9)}
              r="3.5"
              fill="#ef4444"
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Hover info tooltip */}
        <div className="mt-2 text-[10px] text-white/50 text-center font-mono h-4">
          {hoverIndex !== null ? (
            <div className="flex justify-between px-1 text-white/80">
              <span>Day {hoverIndex}</span>
              <span>Active Cases: <strong className="text-indigo-300">{result.dailyCases[hoverIndex].toLocaleString()}</strong></span>
              <span>Beds Needed: <strong className="text-teal-300">{result.dailyBeds[hoverIndex].toLocaleString()}</strong></span>
            </div>
          ) : (
            <span className="text-[9px] italic text-white/30 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Hover or touch the trend curve for precise daily dataload inspect
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface ExpandableTrendVisualizerProps {
  result: SimulationResult;
  message?: Message;
  onApplyParams?: (params: SimulationParams) => void;
  baseline?: SimulationResult;
}

const ExpandableTrendVisualizer: React.FC<ExpandableTrendVisualizerProps> = ({ 
  result, 
  message, 
  onApplyParams,
  baseline
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const isControlled = result.rEffective < 1.0;

  const formatCaseNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k';
    return num.toString();
  };

  return (
    <div className="w-full border border-white/10 bg-white/5 rounded-2xl overflow-hidden mb-3.5 transition-all duration-200 hover:border-indigo-400/30 group/expandable">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-white/5 transition-colors focus:outline-none bg-white/[0.02]"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400 group-hover/expandable:text-indigo-300 transition-colors" />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[11px] text-slate-200 tracking-wider uppercase">Projection Overview</span>
              {message?.isFallbackMode && (
                <span className="text-[7.5px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-bold select-none animate-pulse">
                  Local Simulation Engine
                </span>
              )}
            </div>
            <span className="text-[10px] text-white/40 font-mono block mt-0.5">
              Peak {formatCaseNumber(result.peakCases)} on Day {result.peakDay}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded border leading-none transition-all uppercase tracking-wider ${
            isControlled 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            Rt: {result.rEffective}
          </span>
          <div className="p-1 rounded-lg bg-white/5 border border-white/5 group-hover/expandable:bg-white/10 transition-colors">
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-white/60" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-white/60" />
            )}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-white/5 bg-slate-950/45 space-y-4">
          {/* 1. Actual chat reply text inside the expandable row */}
          {message && (
            <div className="text-slate-100 text-[12px] leading-relaxed font-sans whitespace-pre-line border-b border-white/5 pb-4">
              {message.text}
            </div>
          )}

          {/* 2. Visualisations: Trend curve graph */}
          <div className="space-y-1.5">
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
              📊 Outbreak Trend Forecast
            </span>
            <MiniTrendVisualizer result={result} baseline={baseline} />
          </div>

          {/* 3. Visualisations: Copilot active workspace SVG map */}
          {message && onApplyParams && (
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                🪐 Copilot & Spatial Vectors Mapping
              </span>
              <CopilotServiceVisualizer
                message={message}
                result={result}
                onApplyParams={onApplyParams}
              />
            </div>
          )}

          {/* 4. Spawned coordinated task list */}
          {message && message.tasksCreated && message.tasksCreated.length > 0 && (
            <div className="pt-2 border-t border-white/5 text-[11px]">
              <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                <CheckCircle className="w-3.5 h-3.5" />
                Coordinated Stakeholder Tasks Spawned:
              </div>
              <ul className="list-disc pl-4 space-y-1 text-white/60">
                {message.tasksCreated.map((t, i) => (
                  <li key={i}>{t.title} (<span className="text-[10px] font-mono">{t.group.replace('_', ' ')}</span>)</li>
                ))}
              </ul>
              <div className="mt-1.5 text-white/40 italic text-[10px]">Added automatically to the Task Coordination Board!</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [epidemics, setEpidemics] = useState<EpidemicType[]>(DEFAULT_EPIDEMICS);
  const [selectedEpidemicId, setSelectedEpidemicId] = useState<string>('covid19');

  const activeEpidemic = epidemics.find(e => e.id === selectedEpidemicId) || DEFAULT_EPIDEMICS[0];

  const baselineResult = useMemo(() => {
    return runSIRSimulation({
      vaccRate: 10,
      socialDistance: 'none',
      testingIntensity: 15,
      selectedEpidemicId: selectedEpidemicId
    }, activeEpidemic);
  }, [activeEpidemic, selectedEpidemicId]);

  const [params, setParams] = useState<SimulationParams>({
    vaccRate: 45,
    socialDistance: 'moderate',
    testingIntensity: 50,
    selectedEpidemicId: 'covid19'
  });

  const [activeTab, setActiveTab ] = useState<'simulation' | 'advisor' | 'coordination' | 'protocols'>('simulation');
  const [regionFilter, setRegionFilter] = useState<'All' | 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME'>('All');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  
  // A2UI Standard Protocol states
  const [a2uiSession, setA2uiSession] = useState<any>(null);
  const [isInjectingAction, setIsInjectingAction] = useState(false);
  const [injectionSuccess, setInjectionSuccess] = useState<boolean | null>(null);
  const [showDiscoveryJson, setShowDiscoveryJson] = useState(false);

  // Poll A2UI and AG UI Server State
  useEffect(() => {
    let active = true;
    const pollA2UIState = async () => {
      try {
        const response = await fetch('/api/a2ui/state');
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;

        setA2uiSession(data);

        // Check if server variables are different from client parameters
        const sParams = data.currentParams;
        if (sParams) {
          if (
            sParams.vaccRate !== params.vaccRate ||
            sParams.socialDistance !== params.socialDistance ||
            sParams.testingIntensity !== params.testingIntensity ||
            sParams.selectedEpidemicId !== selectedEpidemicId
          ) {
            // Update client parameters
            setParams({
              vaccRate: sParams.vaccRate,
              socialDistance: sParams.socialDistance,
              testingIntensity: sParams.testingIntensity,
              selectedEpidemicId: sParams.selectedEpidemicId
            });
            setSelectedEpidemicId(sParams.selectedEpidemicId);
            
            // Re-run simulation
            const scenarioEpidemic = epidemics.find(e => e.id === sParams.selectedEpidemicId) || activeEpidemic;
            const updatedResult = runSIRSimulation({
              vaccRate: sParams.vaccRate,
              socialDistance: sParams.socialDistance,
              testingIntensity: sParams.testingIntensity,
              selectedEpidemicId: sParams.selectedEpidemicId
            }, scenarioEpidemic);
            setActiveResult(updatedResult);
          }
        }

        // Handle external tasks pushed through A2UI ADD_TASK
        if (data.externalTasks && data.externalTasks.length > 0) {
          setTasks((currTasks) => {
            const updated = [...currTasks];
            let changed = false;
            data.externalTasks.forEach((extTask: any) => {
              const alreadyExists = currTasks.some((t) => t.id === extTask.id || t.title === extTask.title);
              if (!alreadyExists) {
                updated.unshift({
                  id: extTask.id,
                  title: extTask.title,
                  assignee: 'A2UI Standard Ingress',
                  group: extTask.group,
                  region: extTask.region,
                  priority: extTask.priority,
                  dueTime: extTask.dueTime,
                  status: 'open',
                  createdAt: new Date().toISOString()
                });
                changed = true;
              }
            });
            return changed ? updated : currTasks;
          });
        }
      } catch (err) {
        console.error("A2UI protocol sync polling error:", err);
      }
    };

    pollA2UIState();
    const interval = setInterval(pollA2UIState, 4000); // Poll every 4 seconds
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [params, selectedEpidemicId, epidemics, activeEpidemic]);

  const initialActiveResult = runSIRSimulation({
    vaccRate: 45,
    socialDistance: 'moderate',
    testingIntensity: 50,
    selectedEpidemicId: 'covid19'
  }, DEFAULT_EPIDEMICS[0]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Global Coordination Center active. Here you can run disease surge simulation models to assess regional healthcare impacts. Ask a question such as: 'What if we vaccinate 75% of the population with moderate social distancing?' or use the controls to simulate.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      simulationResult: initialActiveResult
    }
  ]);

  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeResult, setActiveResult] = useState<SimulationResult>(initialActiveResult);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 'task-1',
      title: 'Issue urgent regional booster drive recommendations',
      assignee: 'Dr. Katherine Vance',
      group: 'public_health',
      region: 'Americas',
      priority: 'High',
      dueTime: '24h',
      status: 'open',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-2',
      title: 'Audit emergency ventilator reserve inventories',
      assignee: 'Mark Ridley (Staff Coordinator)',
      group: 'hospital',
      region: 'Europe',
      priority: 'High',
      dueTime: '12h',
      status: 'open',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-3',
      title: 'Draft social communication brief on transmission mitigation',
      assignee: 'Helena Petrova',
      group: 'media',
      region: 'Asia-Pacific',
      priority: 'Medium',
      dueTime: '2 days',
      status: 'open',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-4',
      title: 'Update Cabinet on peak healthcare bed capacity expectations',
      assignee: 'Ministerial Liaison',
      group: 'policy',
      region: 'All',
      priority: 'High',
      dueTime: '6h',
      status: 'done',
      createdAt: new Date().toISOString()
    }
  ]);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    assignee: '',
    group: 'public_health' as Task['group'],
    region: 'All' as Task['region'],
    priority: 'Medium' as Task['priority'],
    dueTime: '24 hours'
  });

  // Global Epidemic selection and file uploading states
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  
  // Custom disease attributes
  const [customName, setCustomName] = useState('');
  const [customR0, setCustomR0] = useState('');
  const [customHospitalRate, setCustomHospitalRate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEpidemicChange = (id: string) => {
    setSelectedEpidemicId(id);
    const chosen = epidemics.find(e => e.id === id) || DEFAULT_EPIDEMICS[0];
    const newSim = runSIRSimulation(params, chosen);
    setActiveResult(newSim);
  };

  const handleParseFileContent = (text: string, filename: string) => {
    setUploadedFileName(filename);
    try {
      if (filename.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (parsed.name) setCustomName(parsed.name);
        if (parsed.r0 !== undefined || parsed.R0 !== undefined) {
          setCustomR0(String(parsed.r0 !== undefined ? parsed.r0 : parsed.R0));
        }
        if (parsed.hospitalRate !== undefined) {
          setCustomHospitalRate(String(parsed.hospitalRate * 100)); // display as percentage input
        } else if (parsed.hospitalizationRate !== undefined) {
          setCustomHospitalRate(String(parsed.hospitalizationRate * 100));
        } else if (parsed.severity !== undefined) {
          setCustomHospitalRate(String(parsed.severity));
        }
        return;
      }

      // Check CSV/TXT line-by-line helper metrics
      const lines = text.split('\n');
      let detectedName = filename.replace(/\.[^/.]+$/, "");
      let detectedR0 = 2.8;
      let detectedHospital = 3.5;

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('r0') || lower.includes('reproduction')) {
          const match = line.match(/[\d\.]+/);
          if (match) detectedR0 = parseFloat(match[0]);
        }
        if (lower.includes('hospital') || lower.includes('severity') || lower.includes('bed')) {
          const match = line.match(/[\d\.]+/);
          if (match) {
            const val = parseFloat(match[0]);
            detectedHospital = val < 1 ? val * 100 : val;
          }
        }
        if (lower.includes('name') || lower.includes('title')) {
          const parts = line.split(/[:,=]/);
          if (parts.length > 1) {
            detectedName = parts[1].trim().replace(/['"'\r]/g, '');
          }
        }
      }

      setCustomName(detectedName);
      setCustomR0(String(detectedR0));
      setCustomHospitalRate(String(detectedHospital));
    } catch (e) {
      console.error("Pathogen telemetry parse failed, falling back:", e);
      setCustomName(filename.replace(/\.[^/.]+$/, ""));
      setCustomR0("2.5");
      setCustomHospitalRate("4.5");
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleParseFileContent(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleParseFileContent(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCreateCustomEpidemic = () => {
    const finalName = customName.trim() || uploadedFileName.replace(/\.[^/.]+$/, "") || "Custom Super-Strain";
    const finalR0 = Math.max(0.2, Math.min(20.0, parseFloat(customR0) || 2.4));
    const finalHospital = Math.max(0.1, Math.min(80.0, parseFloat(customHospitalRate) || 5.0)) / 100;

    const newEpic: EpidemicType = {
      id: `custom_${Date.now()}`,
      name: finalName,
      r0: finalR0,
      vaccEffectiveness: 0.55,
      hospitalRate: finalHospital,
      recoveryRate: 0.07,
      description: `Custom pathogen defined via telemetry dataset: transmission index R0 ${finalR0.toFixed(1)}, clinical hospital demand index of ${(finalHospital * 100).toFixed(1)}%.`
    };

    setEpidemics(prev => [...prev, newEpic]);
    setSelectedEpidemicId(newEpic.id);
    
    const newSim = runSIRSimulation(params, newEpic);
    setActiveResult(newSim);

    const aiLogMsg: Message = {
      id: `custom-log-${Date.now()}`,
      sender: 'ai',
      text: `Alert: Cataloged user-defined custom pathogen "${finalName}" into the global active observation registry. Simulated projections, regional distribution caseload curves, and advisor guidelines are adjusted immediately to support active quarantine planning.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      simulationResult: newSim
    };
    setMessages(prev => [...prev, aiLogMsg]);

    setCustomName('');
    setCustomR0('');
    setCustomHospitalRate('');
    setUploadedFileName('');
    setShowUploadSection(false);
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Recalculate simulation local-state snapshot instantly whenever users modify sliders
  const handleSliderChange = (key: keyof SimulationParams, value: any) => {
    const updated = { ...params, [key]: value };
    setParams(updated);
    const newSim = runSIRSimulation(updated, activeEpidemic);
    setActiveResult(newSim);
  };

  const handleApplyParams = (updatedParams: SimulationParams) => {
    setParams(updatedParams);
    const newSim = runSIRSimulation(updatedParams, activeEpidemic);
    setActiveResult(newSim);
  };

  const executeChatAction = async (promptText: string) => {
    if (!promptText.trim() || isLoading) return;
    setIsLoading(true);

    const userMsgId = `user-${Date.now()}`;
    const newUserMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMsg]);
    setChatInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: promptText,
          history: messages.slice(-8).map(m => ({ sender: m.sender, text: m.text })),
          currentParams: params,
          webSearchEnabled: webSearchEnabled,
          epidemic: activeEpidemic
        })
      });

      if (!response.ok) {
        throw new Error("Outpost communication node experienced a response latency error.");
      }

      const data = await response.json();
      
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        simulationResult: data.simulationResult,
        searchGrounding: data.searchGrounding,
        tasksCreated: data.tasks,
        isFallbackMode: data.isFallbackMode
      };

      setMessages(prev => [...prev, aiMsg]);

      if (data.extractedParams) {
        setParams(data.extractedParams);
      }
      if (data.simulationResult) {
        setActiveResult(data.simulationResult);
      }
      if (data.tasks && data.tasks.length > 0) {
        setTasks(prev => [...data.tasks, ...prev]);
      }
    } catch (err: any) {
      console.error(err);
      // Fallback response with offline math computation to keep app fully functional
      const searchTerms = promptText.toLowerCase();
      let estVacc = params.vaccRate;
      let estSD = params.socialDistance;
      let estTest = params.testingIntensity;

      const vaxMatch = searchTerms.match(/(\d+)%/);
      if (vaxMatch) {
        estVacc = Math.max(0, Math.min(100, parseInt(vaxMatch[1])));
      }
      if (searchTerms.includes("strict") || searchTerms.includes("harsh") || searchTerms.includes("heavy")) {
        estSD = 'strict';
      } else if (searchTerms.includes("mild") || searchTerms.includes("lax") || searchTerms.includes("light")) {
        estSD = 'mild';
      } else if (searchTerms.includes("none") || searchTerms.includes("unmitigated")) {
        estSD = 'none';
      } else if (searchTerms.includes("moderate")) {
        estSD = 'moderate';
      }

      const updatedParams = { vaccRate: estVacc, socialDistance: estSD, testingIntensity: estTest };
      setParams(updatedParams);
      const computedResult = runSIRSimulation(updatedParams, activeEpidemic);
      setActiveResult(computedResult);

      const fallbackMsg: Message = {
        id: `ai-fallback-${Date.now()}`,
        sender: 'ai',
        text: `Command interpreted. Based on your prompt, I updated the simulation variables to: ${estVacc}% Vaccination, ${estSD.toUpperCase()} Social Mandates, and ${estTest}% Testing Capacity. Epidemic caseload projections have updated instantly.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        simulationResult: computedResult
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInjectProtocolAction = async (actionType: string, payload: any, sender: string = 'agent_antigravity') => {
    setIsInjectingAction(true);
    setInjectionSuccess(null);
    try {
      const response = await fetch('/api/a2ui/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, payload, sender })
      });
      if (response.ok) {
        setInjectionSuccess(true);
        const stateRes = await fetch('/api/a2ui/state');
        if (stateRes.ok) {
          const data = await stateRes.json();
          setA2uiSession(data);
        }
      } else {
        setInjectionSuccess(false);
      }
    } catch (err) {
      console.error("A2UI Action Injection Error:", err);
      setInjectionSuccess(false);
    } finally {
      setIsInjectingAction(false);
      setTimeout(() => setInjectionSuccess(null), 3000);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: activeResult })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `epidemic_simulation_v${params.vaccRate}_sd_${params.socialDistance}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert("Failed to export. Please check node readiness.");
      }
    } catch (err) {
      alert("Export unavailable in localized isolated host sandbox.");
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    const taskToInsert: Task = {
      id: `manual-task-${Date.now()}`,
      title: newTask.title,
      assignee: newTask.assignee || 'Unassigned Officer',
      group: newTask.group,
      region: newTask.region,
      priority: newTask.priority,
      dueTime: newTask.dueTime,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    setTasks(prev => [taskToInsert, ...prev]);
    setShowTaskModal(false);
    setNewTask({
      title: '',
      assignee: '',
      group: 'public_health',
      region: 'All',
      priority: 'Medium',
      dueTime: '24 hours'
    });
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'open' ? 'done' : 'open' } : t));
  };

  const formatCaseNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k';
    return num.toString();
  };

  // Convert simulation coordinates for line chart data points
  const chartData = activeResult.dailyCases.map((casesVal, index) => ({
    Day: index,
    'Your Scenario': casesVal,
    'Baseline (No Action)': baselineResult.dailyCases[index] || 0,
    'Surge Capacity (Beds)': activeResult.dailyBeds[index] || 0,
    'Baseline Beds Needed': baselineResult.dailyBeds[index] || 0,
  }));

  const regionalBars = [
    { name: 'Northeast', cases: activeResult.regionalDistribution.northeast, color: '#3b82f6' },
    { name: 'Midwest', cases: activeResult.regionalDistribution.midwest, color: '#10b981' },
    { name: 'South', cases: activeResult.regionalDistribution.south, color: '#f59e0b' },
    { name: 'West', cases: activeResult.regionalDistribution.west, color: '#8b5cf6' },
  ];

  // Filtration indicators
  const filteredTasks = tasks.filter(t => regionFilter === 'All' || t.region === 'All' || t.region === regionFilter);
  const openTasksCount = filteredTasks.filter(t => t.status === 'open').length;
  const completedTasksCount = filteredTasks.filter(t => t.status === 'done').length;
  const totalTasksCount = filteredTasks.length;
  const completionPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative overflow-hidden" id="main-app">
      {/* Mesh Gradient Background Elements */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-600/15 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Upper Navigation Header */}
      <header className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 mx-6 mt-6 flex flex-col md:flex-row md:items-center md:justify-between sticky top-6 z-40 shadow-xl" id="header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-rose-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <HeartPulse className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Epidemic Spread Simulator
              <span className="text-xs bg-white/10 text-slate-200 font-medium px-2.5 py-0.5 rounded-full border border-white/10">
                WCC Outpost v4.0
              </span>
            </h1>
            <p className="text-xs text-white/50">Epidemiological Mathematical projection modeling & crisis control coordination</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('simulation')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all pointer-events-auto cursor-pointer ${
                activeTab === 'simulation'
                  ? 'bg-white/15 text-white border border-white/10 shadow'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              id="tab-simulation"
            >
              <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Projections
            </button>
            <button
              onClick={() => setActiveTab('coordination')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all pointer-events-auto cursor-pointer ${
                activeTab === 'coordination'
                  ? 'bg-white/15 text-white border border-white/10 shadow'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              id="tab-coordination"
            >
              <Users className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Task Coordination Board ({openTasksCount})
            </button>
          </div>

          <button
            onClick={() => setActiveTab('advisor')}
            className={`flex items-center gap-2 border rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all pointer-events-auto cursor-pointer ${
              activeTab === 'advisor'
                ? 'bg-indigo-600 border-indigo-505 text-white shadow shadow-indigo-600/30'
                : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white'
            }`}
            id="tab-advisor"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Advisor</span>
          </button>

          <button
            onClick={() => setActiveTab('protocols')}
            className={`flex items-center gap-2 border rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all pointer-events-auto cursor-pointer ${
              activeTab === 'protocols'
                ? 'bg-gradient-to-r from-teal-500 to-indigo-600 border-teal-500 text-white shadow shadow-teal-500/30'
                : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white'
            }`}
            id="tab-protocols"
          >
            <Terminal className="w-4 h-4 text-teal-400" />
            <span>Agent Protocol Hub & Stack</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="Download CSV dataset"
            id="btn-export"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Export Dataset</span>
          </button>
        </div>
      </header>

      {/* Main Container Viewport */}
      {activeTab === 'simulation' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden max-w-[1600px] mx-auto w-full" id="sim-viewport">
          {/* LEFT COLUMN: Param sliders */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="left-column">
            {/* Epidemic Type Selection & Dropdown */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-xl" id="epidemic-panel">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-rose-500 animate-spin-slow" />
                <h3 className="text-sm font-bold tracking-wider text-white uppercase">
                  Global Epidemic Selector
                </h3>
              </div>

              {/* Dropdown */}
              <div className="mb-4">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Select Active Pathogen
                </label>
                <div className="relative">
                  <select
                    value={selectedEpidemicId}
                    onChange={(e) => handleEpidemicChange(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-100 font-medium"
                    id="epidemic-dropdown"
                  >
                    {epidemics.map((ep) => (
                      <option key={ep.id} value={ep.id} className="bg-slate-950 text-white">
                        {ep.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 w-4 h-4 text-white/50 pointer-events-none" />
                </div>
              </div>

              {/* Active Pathogen Specs Card */}
              <div className="bg-white/5 rounded-2xl border border-white/5 p-3.5 mb-4 text-xs space-y-2">
                <p className="text-[11px] text-white/80 leading-relaxed font-medium">
                  {activeEpidemic.description}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1 pb-0.5 text-center font-mono text-[10px]">
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-white/40 block uppercase text-[8px] font-sans font-bold">Base R0</span>
                    <span className="text-rose-400 font-bold">{activeEpidemic.r0.toFixed(1)}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-white/40 block uppercase text-[8px] font-sans font-bold">Severity</span>
                    <span className="text-amber-400 font-bold">{(activeEpidemic.hospitalRate * 100).toFixed(1)}% Hospital</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-white/40 block uppercase text-[8px] font-sans font-bold">Recovery</span>
                    <span className="text-emerald-400 font-bold">{(activeEpidemic.recoveryRate * 100).toFixed(0)}% Daily</span>
                  </div>
                </div>
              </div>

              {/* Catalog Custom Pathogen Drawer / Collapsible Trigger */}
              <div className="border-t border-white/10 pt-4">
                <button
                  onClick={() => setShowUploadSection(!showUploadSection)}
                  className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                  id="btn-toggle-upload"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    Catalog New Custom Pathogen
                  </span>
                  {showUploadSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showUploadSection && (
                  <div className="mt-3.5 space-y-3.5 animate-fadeIn">
                    {/* Drag and Drop Uploader Area */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                        isDragging 
                          ? 'border-indigo-500 bg-indigo-500/10' 
                          : 'border-white/15 hover:border-white/25 bg-white/5 hover:bg-white/10'
                      }`}
                      id="drag-drop-uploader"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept=".json,.csv,.txt"
                        id="uploader-file-input"
                      />
                      <FileSpreadsheet className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
                      <span className="text-[11px] font-semibold text-slate-200 block">
                        {uploadedFileName ? `Ready: ${uploadedFileName}` : 'Drag & drop parameters file'}
                      </span>
                      <span className="text-[9px] text-white/40 block font-mono mt-0.5">
                        Supports CSV, JSON, TXT files
                      </span>
                    </div>

                    {/* Manual Parameter Customizer Form */}
                    <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Pathogen Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Marburg Strain 2026"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-white/30"
                          id="input-custom-name"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                            R0 Transmission
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="15.0"
                            placeholder="e.g. 2.4"
                            value={customR0}
                            onChange={(e) => setCustomR0(e.target.value)}
                            className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                            id="input-custom-r0"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                            Hospital rate (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="50.0"
                            placeholder="e.g. 6.5"
                            value={customHospitalRate}
                            onChange={(e) => setCustomHospitalRate(e.target.value)}
                            className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                            id="input-custom-severity"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleCreateCustomEpidemic}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-3 rounded-xl transition-colors cursor-pointer text-xs mt-1"
                        id="btn-add-custom-epidemic"
                      >
                        Register Custom Pathogen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Slider Mitigation Overrides */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-xl" id="sliders-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Mitigation Policy Sliders
                </h3>
                <span className="text-[11px] text-indigo-300 font-mono bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">Rt Projection: {activeResult.rEffective}</span>
              </div>

              <div className="space-y-4">
                {/* Vaccination cover */}
                <div>
                  <div className="flex justify-between items-center text-xs text-white/75 mb-1.5">
                    <span className="font-semibold text-slate-300">Vaccination Coverage</span>
                    <span className="text-indigo-300 font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">{params.vaccRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={params.vaccRate}
                    onChange={(e) => handleSliderChange('vaccRate', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    id="slider-vax"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5 font-mono">
                    <span>Unvaccinated</span>
                    <span>70% Herd Immunity</span>
                    <span>100% Coverage</span>
                  </div>
                </div>

                {/* Social Distancing Level */}
                <div>
                  <div className="flex justify-between items-center text-xs text-white/75 mb-1.5">
                    <span className="font-semibold text-slate-300">Social Mandates & Lockdown Lock</span>
                    <span className="text-indigo-300 font-mono font-bold capitalize bg-white/5 px-2 py-0.5 rounded border border-white/10">{params.socialDistance}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10" id="sd-level-selector">
                    {(['none', 'mild', 'moderate', 'strict'] as SocialDistanceLevel[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => handleSliderChange('socialDistance', level)}
                        className={`text-[10px] uppercase font-bold tracking-wider py-2 rounded-lg transition-all cursor-pointer ${
                          params.socialDistance === level
                            ? 'bg-white/15 text-white border border-white/10 shadow-md'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                        }`}
                        id={`sd-btn-${level}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Diagnostics testing intensity */}
                <div>
                  <div className="flex justify-between items-center text-xs text-white/75 mb-1.5">
                    <span className="font-semibold text-slate-300">Diagnostics & Contact Tracing scope</span>
                    <span className="text-indigo-300 font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">{params.testingIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={params.testingIntensity}
                    onChange={(e) => handleSliderChange('testingIntensity', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    id="slider-testing"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5 font-mono">
                    <span>No monitoring</span>
                    <span>Robust early isolation</span>
                    <span>Universal Testing</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Results Dashboard, Charts & Cards */}
          <div className="lg:col-span-8 flex flex-col gap-6" id="right-column">
            {/* Simulation Performance Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" id="metrics-cards">
              {/* Card 1: Peak Cases */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl text-center relative overflow-hidden group shadow-lg" id="metric-cases">
                <div className="absolute top-2 right-2 p-1.5 bg-rose-500/10 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Peak Active Load</span>
                <div className="text-2xl font-black text-rose-500 font-mono tracking-tight">{formatCaseNumber(activeResult.peakCases)}</div>
                <div className="text-[10px] text-white/50 mt-1.5 flex items-center justify-center gap-1 font-medium">
                  {activeResult.peakCases < baselineResult.peakCases ? (
                    <>
                      <span className="text-emerald-400 font-bold font-mono font-semibold">-{Math.round((1 - activeResult.peakCases/baselineResult.peakCases)*100)}%</span>
                      v. Baseline
                    </>
                  ) : (
                    <span>No mitigation change</span>
                  )}
                </div>
              </div>

              {/* Card 2: Peak Day */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl text-center relative overflow-hidden group shadow-lg" id="metric-peak-day">
                <div className="absolute top-2 right-2 p-1.5 bg-yellow-500/10 rounded-lg">
                  <Calendar className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Peak Case Day</span>
                <div className="text-2xl font-black text-yellow-500 font-mono tracking-tight">Day {activeResult.peakDay}</div>
                <div className="text-[10px] text-white/50 mt-1.5 flex items-center justify-center gap-1 font-medium">
                  {activeResult.peakDay > baselineResult.peakDay ? (
                    <>
                      Delayed by <span className="text-emerald-400 font-bold font-mono font-semibold">+{activeResult.peakDay - baselineResult.peakDay}</span> days
                    </>
                  ) : (
                    <span>Rapid peak onset danger</span>
                  )}
                </div>
              </div>

              {/* Card 3: ICU Beds Needed */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl text-center relative overflow-hidden group shadow-lg" id="metric-beds">
                <div className="absolute top-2 right-2 p-1.5 bg-indigo-500/10 rounded-lg">
                  <HeartPulse className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Peak Beds Needed</span>
                <div className="text-2xl font-black text-indigo-400 font-mono tracking-tight">{formatCaseNumber(activeResult.hospitalPeakBeds)}</div>
                <div className="text-[10px] text-white/50 mt-1.5 mb-0.5">ICU limit capacity: 160k</div>
              </div>

              {/* Card 4: Total Epidemic Duration */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl text-center relative overflow-hidden group shadow-lg" id="metric-duration">
                <div className="absolute top-2 right-2 p-1.5 bg-teal-500/10 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Active Duration</span>
                <div className="text-2xl font-black text-teal-400 font-mono tracking-tight">{activeResult.totalDurationDays} Days</div>
                <div className="text-[10px] text-white/40 mt-1.5 font-mono">Transmission Rt: {activeResult.rEffective}</div>
              </div>
            </div>

            {/* Line Chart: Infection Wave Projection */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl flex-1 flex flex-col shadow-xl" id="cases-chart-container">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 border-b border-white/10 pb-3 gap-2">
                <div>
                  <h4 className="text-sm font-bold tracking-wider text-slate-200">ACTIVE INFECTIONS TIMELINE (180 DAYS)</h4>
                  <p className="text-[11px] text-white/50 mt-0.5">Comparing Unmitigated Baseline vs Active Scenario</p>
                </div>
                <div className="flex gap-4 text-[10px] font-mono shrink-0">
                  <span className="text-rose-400 font-bold">&#9612; Selected Model Wave Peak: {formatCaseNumber(activeResult.peakCases)}</span>
                  <span className="text-white/45">&#9612; Baseline Wave Peak: {formatCaseNumber(baselineResult.peakCases)}</span>
                </div>
              </div>

              <div className="flex-1 min-h-[220px]" id="recharts-cases">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="Day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tickFormatter={formatCaseNumber} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(10, 12, 20, 0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.15)', color: '#f1f5f9', borderRadius: '16px' }}
                      labelClassName="text-slate-400 font-bold text-[11px]"
                      itemStyle={{ textTransform: 'capitalize', fontSize: '11px', color: '#e2e8f0' }}
                    />
                    <ReferenceLine x={activeResult.peakDay} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `Peak: Day ${activeResult.peakDay}`, fill: '#f59e0b', fontSize: 9, position: 'top' }} />
                    <Line type="monotone" dataKey="Your Scenario" stroke="#4f46e5" strokeWidth={3.5} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Baseline (No Action)" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom 2 mini charts in responsive grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="bottom-charts">
              {/* Bar Chart: Regional caseload peak caseload */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl shadow-lg" id="regional-chart-container">
                <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase mb-3">Est. Regional Shockwaves</h4>
                <div className="h-[150px]" id="recharts-regional">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionalBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 9 }} />
                      <YAxis stroke="rgba(255,255,255,0.4)" tickFormatter={formatCaseNumber} tick={{ fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(10, 12, 20, 0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '16px' }}
                        itemStyle={{ fontSize: '10px', color: '#fff' }}
                      />
                      <Bar dataKey="cases" radius={[4, 4, 0, 0]} name="Peak Caseload">
                        {regionalBars.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.7} stroke={entry.color} strokeWidth={1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Area Chart: Healthcare Capacity Threshold */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl shadow-lg" id="hospital-chart-container">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase">Hospital ICU Capacity Limit</h4>
                  <span className="text-[10px] bg-red-500/10 text-red-400 font-mono px-1.5 py-0.5 rounded font-bold">Limit: 160k Beds</span>
                </div>
                <div className="h-[150px]" id="recharts-hospital">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="Day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 9 }} />
                      <YAxis stroke="rgba(255,255,255,0.4)" tickFormatter={formatCaseNumber} tick={{ fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(10, 12, 20, 0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '16px' }}
                        itemStyle={{ fontSize: '10px', color: '#fff' }}
                      />
                      <ReferenceLine y={160000} stroke="#ef4444" strokeWidth={1.5} label={{ value: "Capacity Threshold", fill: '#ef4444', fontSize: 8, position: 'insideTopLeft' }} />
                      <Area type="monotone" dataKey="Surge Capacity (Beds)" stroke="#818cf8" fill="#4f46e5" fillOpacity={0.15} name="Beds Occupied" />
                      <Area type="monotone" dataKey="Baseline Beds Needed" stroke="rgba(255,255,255,0.2)" fill="rgba(255,255,255,0.03)" fillOpacity={0.05} name="Unmitigated Beds" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'advisor' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden max-w-[1600px] mx-auto w-full" id="advisor-viewport">
          {/* LEFT COLUMN: Stats/Projection Snapshot & Info */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="advisor-left-col">
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-xl flex flex-col gap-2.5" id="advisor-intro-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow">
                  <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white uppercase text-xs tracking-wider">Epidemiology Advisor</h3>
                  <p className="text-[10px] text-white/40 font-mono">wcc decision aid context</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed font-sans">
                Interact with the WCC Epidemiological Forecasting Agent. Ask queries, simulate vaccination or quarantine parameters, and request live Intel grounded on real-time search.
              </p>
            </div>

            {/* Current Active Variables Info */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl shadow-xl flex-1 flex flex-col justify-between" id="advisor-stats-card">
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5 border-b border-white/10 pb-2">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Live Params Context
                </h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                    <span className="text-white/50">Vaccination Coverage:</span>
                    <span className="font-mono font-bold text-white">{params.vaccRate}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                    <span className="text-white/50">Social Distancing:</span>
                    <span className="font-mono font-bold text-white capitalize">{params.socialDistance}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5">
                    <span className="text-white/50">Testing capacity:</span>
                    <span className="font-mono font-bold text-white">{params.testingIntensity}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-indigo-500/5 p-2 rounded-xl border border-indigo-500/10">
                    <span className="text-indigo-200">Rt Projection:</span>
                    <span className="font-mono font-black text-indigo-400 text-sm">{activeResult.rEffective}</span>
                  </div>
                </div>
              </div>

              {/* Mini trend projection */}
              <div className="mt-4">
                <MiniTrendVisualizer result={activeResult} />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: The persistent chatbot interface */}
          <div className="lg:col-span-8 flex flex-col gap-6" id="advisor-right-col">
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl flex flex-col h-full min-h-[500px] overflow-hidden shadow-xl" id="chat-panel">
              <div className="px-5 py-4 border-b border-white/10 bg-transparent flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <h3 className="text-sm font-bold tracking-wider text-white uppercase">Advisor Conversation Log</h3>
                </div>
                <button
                  onClick={() => {
                    setMessages([
                      {
                        id: 'welcome',
                        sender: 'ai',
                        text: "Advisor log restarted. What mitigation parameters or vaccine strategies can I projects for you today?",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        simulationResult: initialActiveResult
                      }
                    ]);
                  }}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer"
                  title="Reset conversation logs"
                  id="btn-reset-chat"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Chat Message Lists */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 text-xs leading-relaxed" id="chat-messages-container">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[92%] rounded-2xl p-3.5 ${
                      m.sender === 'user'
                        ? 'bg-indigo-600/90 text-white ml-auto rounded-tr-none shadow-md shadow-indigo-600/10 border border-white/10'
                        : 'bg-white/5 border border-white/10 text-white/90 mr-auto rounded-tl-none font-sans w-full'
                    }`}
                    id={`message-${m.id}`}
                  >
                    {/* Render our expandable interactive ExpandableTrendVisualizer containing all visualizations and the actual reply */}
                    {m.sender === 'ai' ? (
                      <div className="space-y-3 w-full">
                        {/* 1. Standard readable response text */}
                        <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-100 px-1">
                          {m.text}
                        </p>

                        {/* 2. Expandable Interactive Visualizer with Dynamic Projections and Copilot Map */}
                        <ExpandableTrendVisualizer 
                          result={m.simulationResult || activeResult}
                          baseline={baselineResult}
                          message={m}
                          onApplyParams={handleApplyParams}
                        />
                      </div>
                    ) : (
                      <p className="whitespace-pre-line text-[12px] leading-relaxed">{m.text}</p>
                    )}

                    <span className="text-[10px] text-white/40 self-end mt-1 font-mono">{m.timestamp}</span>
                  </div>
                ))}

                {isLoading && (
                  <div className="mr-auto bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-2 max-w-[80%] rounded-tl-none" id="chat-loading">
                    <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-xs text-white/50 italic">Epidemiological model formulating peak estimations...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Quick Prompts Pills */}
              <div className="px-4 py-2 bg-transparent border-t border-white/5 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-1.5 py-2" id="quick-prompts">
                {[
                  "What if we vaccinate 85% with lockdown?",
                  "Strict lockdown vs no restrictions",
                  "Worst case scenario peaks",
                  "Current vaccination levels support",
                ].map((txt) => (
                  <button
                    key={txt}
                    onClick={() => executeChatAction(txt)}
                    className="text-[10.5px] bg-white/5 border border-white/10 hover:border-white/30 text-white/60 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer font-medium inline-block shrink-0"
                    id={`quick-prompt-${txt.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {txt}
                  </button>
                ))}
              </div>

              {/* Web Search Grounding Status Control Banner */}
              <div className="px-5 py-2.5 bg-white/5 border-t border-b border-white/10 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <Globe className={`w-3.5 h-3.5 ${webSearchEnabled ? 'text-indigo-400 animate-spin-slow' : 'text-white/30'}`} />
                  <span className="font-semibold text-slate-300">Live Linkup Intelligence Search</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-black transition-all cursor-pointer ${
                    webSearchEnabled
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 tracking-wider'
                      : 'bg-white/5 text-white/40 border border-white/10'
                  }`}
                  id="toggle-web-search-advisor"
                >
                  {webSearchEnabled ? '● GROUNDING ON' : '○ GROUNDING OFF'}
                </button>
              </div>

              {/* Chat Input form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeChatAction(chatInput);
                }}
                className="p-3 bg-transparent flex gap-2"
                id="chat-form-advisor"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask advisor or tweak parameters here..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 font-sans"
                  id="chat-input-advisor"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isLoading}
                  className="bg-white hover:bg-white/90 disabled:bg-white/5 disabled:text-white/20 text-black p-3 rounded-xl transition-all cursor-pointer flex items-center justify-center shadow shadow-white/5"
                  id="btn-chat-send-advisor"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : activeTab === 'coordination' ? (
        /* TAB: COORDINATION BOARD */
        <div className="flex-1 flex flex-col p-6 max-w-[1400px] mx-auto w-full gap-6" id="coordination-viewport">
          {/* Status Bar */}
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl" id="coordination-status">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Inter-Agency Task Command Board
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Assign and orchestrate actions across Public Health Officials, Hospitals, Policy, and Media. Filter tasks by target sector or region.
              </p>
            </div>

            {/* Region Filtering Tab List */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-white/60 font-medium">Filter region:</span>
              <div className="bg-white/5 border border-white/10 p-1 rounded-xl flex gap-1">
                {(['All', 'Americas', 'Europe', 'Asia-Pacific', 'Africa & ME'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRegionFilter(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      regionFilter === r
                        ? 'bg-white/15 text-white border border-white/10 shadow'
                        : 'text-white/60 hover:text-white'
                    }`}
                    id={`region-tab-${r.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowTaskModal(true)}
                className="bg-white hover:bg-white/90 text-black rounded-xl px-4 py-2 text-xs font-bold shadow flex items-center gap-1.5 transition-colors cursor-pointer"
                id="btn-create-task"
              >
                <Plus className="w-4 h-4 text-black" strokeWidth={3} />
                Add Action Item
              </button>
            </div>
          </div>

          {/* Coordination board progress percentage */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-center justify-between" id="progress-meter">
            <div className="text-xs text-white/80">
              Coordinated Response Milestones: <span className="text-white font-bold">{completedTasksCount} / {totalTasksCount} completed</span> ({completionPercent}%)
            </div>
            <div className="w-2/3 h-2 bg-white/10 rounded-full overflow-hidden max-w-sm">
              <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${completionPercent}%` }}></div>
            </div>
          </div>

          {/* Core Grid Task columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="coordination-grid">
            {/* Sector Column definitions */}
            {[
              {
                id: 'public_health',
                title: 'Public Health Officials',
                theme: 'border-t-4 border-t-cyan-500',
                icon: <Globe className="w-4 h-4 text-cyan-400" />,
                bg: 'bg-cyan-500/10'
              },
              {
                id: 'hospital',
                title: 'Hospital Logistics',
                theme: 'border-t-4 border-t-rose-500',
                icon: <Building className="w-4 h-4 text-rose-400" />,
                bg: 'bg-rose-500/10'
              },
              {
                id: 'policy',
                title: 'Policy & Lockdown Authorities',
                theme: 'border-t-4 border-t-teal-500',
                icon: <Briefcase className="w-4 h-4 text-teal-400" />,
                bg: 'bg-teal-500/10'
              },
              {
                id: 'media',
                title: 'Media & Public Outreach',
                theme: 'border-t-4 border-t-amber-500',
                icon: <Radio className="w-4 h-4 text-amber-400" />,
                bg: 'bg-amber-500/10'
              }
            ].map((sector) => {
              const sectorTasks = filteredTasks.filter(t => t.group === sector.id);
              
              return (
                <div key={sector.id} className={`bg-white/5 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl flex flex-col min-h-[460px] ${sector.theme} shadow-lg`} id={`column-${sector.id}`}>
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${sector.bg}`}>
                        {sector.icon}
                      </div>
                      <h3 className="font-bold text-xs text-white uppercase tracking-wider">{sector.title}</h3>
                    </div>
                    <span className="text-[11px] bg-white/10 border border-white/10 text-slate-200 px-2 py-0.5 rounded-full font-mono">{sectorTasks.length}</span>
                  </div>
 
                  {/* Task card list inside this column */}
                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px]" id={`list-tasks-${sector.id}`}>
                    {sectorTasks.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-white/35 italic border border-dashed border-white/10 rounded-2xl">
                        <Inbox className="w-8 h-8 opacity-40 mb-2" />
                        <span className="text-[10.5px]">No active mandates</span>
                      </div>
                    ) : (
                      sectorTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            task.status === 'done'
                              ? 'bg-white/5 border-white/5 opacity-50 text-white/50 line-through'
                              : 'bg-white/5 border border-white/10 text-slate-100 hover:border-white/25 hover:bg-white/10 hover:shadow-md'
                          }`}
                          id={`task-card-${task.id}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => toggleTaskStatus(task.id)}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer mt-0.5 ${
                                task.status === 'done'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'border-white/15 hover:border-white/30 bg-white/5'
                              }`}
                              id={`toggle-${task.id}`}
                            >
                              {task.status === 'done' && <Check className="w-3.5 h-3.5" />}
                            </button>
                            <div className="flex-1">
                              <p className="text-[12px] font-bold leading-tight">{task.title}</p>
                              
                              <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-[10px] font-mono text-white/50">
                                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 truncate max-w-[120px]">{task.assignee}</span>
                                <span className={`px-1.5 py-0.5 rounded border ${
                                  task.priority === 'High'
                                    ? 'bg-rose-500/15 border-rose-500/25 text-rose-400'
                                    : task.priority === 'Medium'
                                    ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-450 font-semibold'
                                    : 'bg-white/5 border border-white/10 text-white/40'
                                } font-bold`}>{task.priority}</span>
                                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">Limit: {task.dueTime}</span>
                                {task.region !== 'All' && <span className="bg-indigo-500/15 border border-indigo-550/20 text-indigo-300 font-semibold">{task.region}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* TAB: AGENT PROTOCOLS & TECH STACK HUB */
        <div className="flex-1 flex flex-col p-6 max-w-[1400px] mx-auto w-full gap-8 overflow-y-auto" id="protocols-viewport">
          
          {/* Section A: Header Introduction Card */}
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl" id="protocol-header-status">
            <div>
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block font-mono mb-1">Standardized Interoperability Gateway</span>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-teal-400" />
                AG UI & A2UI Protocol Hub
              </h2>
              <p className="text-xs text-white/50 mt-1 max-w-2xl">
                Exposing system variables, discovery maps, and structured handlers. This workspace allows autonomous developer agents to read coordinates, trigger simulation updates, and sync actions programmatically.
              </p>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>A2UI PORT STATE: LISTENING</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="protocols-grid">
            
            {/* LEFT SIDE: PROTOCOL INSTRUMENTS (Terminals, Actions, Stream Logs) */}
            <div className="lg:col-span-7 flex flex-col gap-6" id="protocol-instruments-panel">
              
              {/* Card 1: Action Injection Sandbox (Command Center) */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-lg" id="sandbox-card">
                <h3 className="text-xs font-bold tracking-wider text-teal-300 uppercase mb-1.5 flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  Agent Protocol Action Sandbox
                </h3>
                <p className="text-[11px] text-white/50 mb-5 leading-normal">
                  Inject synthetic A2UI actions. These send JSON packages directly to <code className="text-slate-300 bg-white/5 px-1.5 py-0.5 rounded font-mono">POST /api/a2ui/action</code>. The Express server processes the action, mutates simulation variables, and broadcasts the sync event back to the React client runtime.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="sandbox-buttons">
                  <button
                    onClick={() => handleInjectProtocolAction('SET_PARAMS', { vaccRate: 85, selectedEpidemicId: selectedEpidemicId })}
                    disabled={isInjectingAction}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-500/30 text-slate-200 hover:text-white px-4 py-3 rounded-2xl text-xs text-left transition-all relative flex flex-col justify-between group cursor-pointer"
                  >
                    <span className="font-bold text-white group-hover:text-teal-400">💉 Boost Vaccination Cover</span>
                    <span className="text-[10px] text-white/40 font-mono mt-1">SET_PARAMS {"{ vaccRate: 85 }"}</span>
                  </button>

                  <button
                    onClick={() => handleInjectProtocolAction('SET_PARAMS', { socialDistance: 'strict', selectedEpidemicId: selectedEpidemicId })}
                    disabled={isInjectingAction}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-500/30 text-slate-200 hover:text-white px-4 py-3 rounded-2xl text-xs text-left transition-all relative flex flex-col justify-between group cursor-pointer"
                  >
                    <span className="font-bold text-white group-hover:text-teal-400">🛡️ Mandate Strict Lockdowns</span>
                    <span className="text-[10px] text-white/40 font-mono mt-1">SET_PARAMS {"{ socialDistance: 'strict' }"}</span>
                  </button>

                  <button
                    onClick={() => handleInjectProtocolAction('SET_PARAMS', { testingIntensity: 95, selectedEpidemicId: selectedEpidemicId })}
                    disabled={isInjectingAction}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-500/30 text-slate-200 hover:text-white px-4 py-3 rounded-2xl text-xs text-left transition-all relative flex flex-col justify-between group cursor-pointer"
                  >
                    <span className="font-bold text-white group-hover:text-teal-400">🔍 Surge Surveillance Tests</span>
                    <span className="text-[10px] text-white/40 font-mono mt-1">SET_PARAMS {"{ testingIntensity: 95 }"}</span>
                  </button>

                  <button
                    onClick={() => handleInjectProtocolAction('ADD_TASK', {
                      title: "Syndicate urgent booster advice and mobilize regional staff resources",
                      group: "public_health",
                      region: "Americas",
                      priority: "High",
                      dueTime: "6 hours"
                    })}
                    disabled={isInjectingAction}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-500/30 text-slate-200 hover:text-white px-4 py-3 rounded-2xl text-xs text-left transition-all relative flex flex-col justify-between group cursor-pointer"
                  >
                    <span className="font-bold text-white group-hover:text-teal-400">🚨 Syndicate Strategic Task</span>
                    <span className="text-[10px] text-white/40 font-mono mt-1">ADD_TASK {"{ group: public_health }"}</span>
                  </button>
                </div>

                <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs" id="sandbox-footer">
                  <div className="flex items-center gap-1.5 min-h-[22px]">
                    {isInjectingAction && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
                    {injectionSuccess === true && <span className="text-emerald-400 font-bold font-mono">✔ PROTOCOL_ACTION_ACKNOWLEDGED (200 OK)</span>}
                    {injectionSuccess === false && <span className="text-rose-400 font-bold font-mono">❌ PROTOCOL_ACTION_REJECTED (500 Error)</span>}
                    {!isInjectingAction && injectionSuccess === null && <span className="text-white/30 font-mono">[READY] Click any action vector above to inject standard packet.</span>}
                  </div>

                  <button
                    onClick={() => handleInjectProtocolAction('RESET', {})}
                    disabled={isInjectingAction}
                    className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 font-bold px-3 py-1 text-[10px] rounded-lg tracking-wider font-mono cursor-pointer"
                  >
                    HARD RESET PROTOCOL
                  </button>
                </div>
              </div>

              {/* Card 2: Discovery Specification Explorer */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-lg" id="discovery-config-card">
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="text-xs font-bold tracking-wider text-teal-300 uppercase flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    AG UI Schema Discovery Schema
                  </h3>
                  <button
                    onClick={() => setShowDiscoveryJson(!showDiscoveryJson)}
                    className="bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white font-mono font-bold text-[9.5px] px-2.5 py-1 rounded cursor-pointer leading-tight border border-white/10"
                  >
                    {showDiscoveryJson ? '[-] COLLAPSE RAW JSON' : '[+] EXPAND CONFIG MAP'}
                  </button>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed font-sans">
                  The discovery schema is declared to let external agents dynamically scan. The standard endpoint operates at <code className="text-white/80 bg-white/5 px-1 rounded font-mono font-bold">GET /api/a2ui/config</code> reporting metadata, action parameters limits, and ingress coordinates automatically.
                </p>

                {showDiscoveryJson && (
                  <div className="mt-4 bg-[#07090f] border border-white/5 p-4 rounded-2xl max-h-[300px] overflow-y-auto" id="discovery-json-block">
                    <pre className="text-[10px] font-mono text-zinc-300 leading-relaxed select-all">
                      {JSON.stringify({
                        protocol: "Agent-to-User-Interface (A2UI) & Antigravity (AG) UI Open Standards",
                        spec_version: "1.2.0",
                        client_bridge: "Express/React 19 Active Polling Bridge",
                        capabilities: {
                          simulationControl: {
                            parameters: {
                              vaccRate: { type: "integer", min: 0, max: 100, default: 45 },
                              socialDistance: { type: "enum", values: ["none", "mild", "moderate", "strict"], default: "moderate" },
                              testingIntensity: { type: "integer", min: 0, max: 100, default: 50 },
                              selectedEpidemicId: { type: "string", values: ["covid19", "h5n1", "disease_x", "ebola", "mpox", "nipah"] }
                            },
                            actions: {
                              SET_PARAMS: "Instructs UI components to sync params values vectors",
                              RESET: "Reverts entire environmental state back to offline coordinates"
                            }
                          },
                          coordinationBoard: {
                            actions: {
                              ADD_TASK: {
                                description: "Syndicates high-importance public health mandate directly to stakeholder board"
                              }
                            }
                          }
                        },
                        endpoints: {
                          get_discovery: "GET /api/a2ui/config",
                          get_session_state: "GET /api/a2ui/state",
                          post_agent_action: "POST /api/a2ui/action"
                        }
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Card 3: live state stream feed log  */}
              <div className="bg-[#0f121e]/40 border border-white/10 p-6 rounded-3xl shadow-lg flex-1 flex flex-col justify-between" id="stream-logs-box">
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase mb-1.5 flex items-center gap-1.5 border-b border-white/10 pb-2">
                    <Radio className="w-4 h-4 text-indigo-400 rotate-12" />
                    Ingress Signal Feed & Actions Audit Log
                  </h3>
                  
                  <div className="space-y-3 mt-4 max-h-[285px] overflow-y-auto pr-1" id="log-entries-list">
                    {!a2uiSession || !a2uiSession.actionsLog || a2uiSession.actionsLog.length === 0 ? (
                      <div className="text-center py-12 text-white/30 italic text-xs">
                        No transactions registered. Ready for input actions.
                      </div>
                    ) : (
                      a2uiSession.actionsLog.map((log: any) => {
                        return (
                          <div key={log.id} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col gap-1 text-[11px] font-mono hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-center">
                              <span className={`text-[9.5px]/none font-black px-1.5 py-0.5 rounded ${
                                log.sender === 'agent_antigravity'
                                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                  : log.sender === 'agent_gemini'
                                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                                  : log.sender === 'system'
                                  ? 'bg-slate-500/10 text-slate-400'
                                  : 'bg-white/10 text-white'
                              }`}>
                                @{log.sender.toUpperCase()}
                              </span>
                              <span className="text-white/30 text-[9px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-200 mt-1 font-sans">
                              <span>Action Type: <strong className="text-teal-300 font-mono text-[10.5px]">{log.type}</strong></span>
                              <span className="text-[10px] text-white/50 font-mono font-medium font-bold">TxID: {log.id}</span>
                            </div>
                            {log.payload && Object.keys(log.payload).length > 0 && (
                              <pre className="mt-2 bg-[#090b13] p-2 rounded-lg text-[9.5px] text-zinc-400 overflow-x-auto whitespace-pre-wrap max-h-[85px] border border-white/5 font-mono">
                                {JSON.stringify(log.payload, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-white/40 text-[10px] font-mono">
                  <span>Audit Sync Protocol active</span>
                  <span>Total captured logs: {a2uiSession?.actionsLog?.length || 0}</span>
                </div>
              </div>

            </div>

            {/* RIGHT SIDE: INTERACTIVE SYSTEM TECH STACK SHEET */}
            <div className="lg:col-span-5 flex flex-col gap-6" id="system-architecture-panel">
              
              {/* Tech Stack Bento Grid Card */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-lg" id="tech-sheet-card">
                <span className="text-[9.5px] font-bold text-indigo-400 uppercase tracking-widest block font-mono mb-1">Production Spec Sheet</span>
                <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  WCC Node Tech Stack Sheet
                </h3>
                <p className="text-xs text-white/60 leading-relaxed mb-6 font-sans">
                  Official operational report cataloging core packages, compilers, heuristic pathways and visual runtimes fueling this outpost node.
                </p>

                {/* Grid of Tech Stack Spec cards */}
                <div className="space-y-3.5" id="spec-sheet-list">
                  {[
                    { tier: "Runtime Environment", name: "Node.js (LTS Engine v22)", spec: "v22 Standalone Container Environment", badge: "Runtime", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" },
                    { tier: "System Coding Layer", name: "TypeScript (Type Compiler)", spec: "v5.8 Strict Type Safety Verification", badge: "Language", color: "text-blue-400 border-blue-500/20 bg-blue-500/5" },
                    { tier: "Client UI Framework", name: "React 19 (Functional Hooks UI)", spec: "v19 Virtual-DOM Component Nodes", badge: "Frontend", color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5" },
                    { tier: "Web Server Infrastructure", name: "Express Framework API Routes", spec: "v4.21 Full-Stack Routing Proxy", badge: "Backend", color: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5" },
                    { tier: "Compiler & Asset bundler", name: "Vite + Esbuild Pipeline Node", spec: "Vite v6 Client / Esbuild v0.25 CJS Bundler", badge: "Build Pipeline", color: "text-purple-400 border-purple-500/20 bg-purple-500/5" },
                    { tier: "Design Styling System", name: "Tailwind CSS v4.x Web Compiler", spec: "Native @tailwindcss/vite CSS Variable Themes", badge: "CSS Utility", color: "text-teal-400 border-teal-500/20 bg-teal-500/5" },
                    { tier: "Heuristic Intel Pipeline", name: "Google Gemini 3.5 Flash Model", spec: "@google/genai TS SDK Server-Side Client proxy", badge: "AI Core", color: "text-rose-400 border-rose-500/20 bg-rose-500/5" },
                    { tier: "Qualitative Web Grounding", name: "Linkup Live Search indexing service", spec: "Grounding indexes integration /v1/search api", badge: "External API", color: "text-amber-400 border-amber-500/25 bg-amber-500/5" },
                    { tier: "Data & Charts plotting", name: "Recharts Node & HTML5 SVG Canvas", spec: "v3 Graphics Coordinate mapping & custom tooltips", badge: "Graphics", color: "text-orange-400 border-orange-500/20 bg-orange-500/5" }
                  ].map((tech, i) => (
                    <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex justify-between items-center hover:bg-white/10 hover:border-white/10 transition-colors">
                      <div>
                        <span className="text-[10px] text-white/40 block font-mono uppercase tracking-wide">{tech.tier}</span>
                        <span className="text-[12px] font-black text-white mt-0.5 block">{tech.name}</span>
                        <span className="text-[10px] text-white/50 block font-mono mt-0.5">{tech.spec}</span>
                      </div>
                      <span className={`text-[9.5px]/none font-bold font-mono tracking-wider uppercase border rounded-md px-2 py-0.5 shrink-0 ${tech.color}`}>
                        {tech.badge}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-white/5 p-4 rounded-2xl border border-white/15 mt-6" id="architecture-notes">
                  <h4 className="text-[11px] uppercase font-bold text-white tracking-widest font-mono">Structural Sandbox Details</h4>
                  <p className="text-[10.5px] text-white/45 mt-1.5 leading-normal font-sans">
                    This full-stack model abstracts environment variables completely from client exposure. Secure transactions flow exclusively through reverse proxy pipelines to maintain sovereign encryption and credential sandboxing.
                  </p>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Manual Add Task Light modals Dialog */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-[#0a0c14]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" id="modal-backdrop">
          <div className="bg-[#0f121d]/90 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative" id="task-modal">
            <h3 className="text-base font-black text-white flex items-center gap-2 mb-4 uppercase tracking-wider">
              <Plus className="w-5 h-5 text-indigo-400" />
              Coordinate New Agency Mandate
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-white/60 font-semibold mb-1">Mandate Title / Instruction</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit diagnostic backup capacity reserves"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-indigo-400"
                  id="modal-input-title"
                />
              </div>

              <div>
                <label className="block text-white/60 font-semibold mb-1">Agency Officer Assignee</label>
                <input
                  type="text"
                  placeholder="e.g. Director Rachel Green"
                  value={newTask.assignee}
                  onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-indigo-400"
                  id="modal-input-officer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/60 font-semibold mb-1">Target Sector Column</label>
                  <select
                    value={newTask.group}
                    onChange={(e) => setNewTask({ ...newTask, group: e.target.value as Task['group'] })}
                    className="w-full bg-[#11131e] border border-white/10 rounded-xl px-2 py-2 text-white focus:outline-none focus:border-indigo-400"
                    id="modal-select-group"
                  >
                    <option value="public_health">Public Health</option>
                    <option value="hospital">Hospital logistics</option>
                    <option value="policy">Policy Authorities</option>
                    <option value="media">Media & Media Press</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white/60 font-semibold mb-1">Target Region</label>
                  <select
                    value={newTask.region}
                    onChange={(e) => setNewTask({ ...newTask, region: e.target.value as Task['region'] })}
                    className="w-full bg-[#11131e] border border-white/10 rounded-xl px-2 py-2 text-white focus:outline-none focus:border-indigo-400"
                    id="modal-select-region"
                  >
                    <option value="All">Global (All)</option>
                    <option value="Americas">Americas</option>
                    <option value="Europe">Europe</option>
                    <option value="Asia-Pacific">Asia-Pacific</option>
                    <option value="Africa & ME">Africa & ME</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/60 font-semibold mb-1">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                    className="w-full bg-[#11131e] border border-white/10 rounded-xl px-2 py-2 text-white focus:outline-none focus:border-indigo-400"
                    id="modal-select-priority"
                  >
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white/60 font-semibold mb-1">Due Timeframe Limit</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 24 hours, 3 days"
                    value={newTask.dueTime}
                    onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-indigo-400"
                    id="modal-input-time"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2 text-sm justify-end">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl px-4 py-2 font-semibold transition-colors cursor-pointer"
                  id="modal-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-white hover:bg-white/90 text-black rounded-xl px-5 py-2 font-bold shadow transition-colors cursor-pointer"
                  id="modal-btn-emit"
                >
                  Emit Command
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
