import React, { useState, useEffect } from 'react';
import { Sparkles, Check, Play, Shield, Activity, RefreshCw } from 'lucide-react';
import { Message, SimulationResult, SimulationParams } from '../types';
import { SVGWorldMap } from './SVGWorldMap';

// Detector to parse which region is mentioned in the chatbot's scenario response text
export const detectMentionedRegion = (text: string): 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME' | 'All' => {
  const normalized = text.toLowerCase();
  if (normalized.includes('america') || normalized.includes('usa') || normalized.includes('caribbean')) {
    return 'Americas';
  }
  if (normalized.includes('europe') || normalized.includes('eu') || normalized.includes('russia')) {
    return 'Europe';
  }
  if (normalized.includes('asia') || normalized.includes('pacific') || normalized.includes('china') || normalized.includes('india') || normalized.includes('japan') || normalized.includes('australia')) {
    return 'Asia-Pacific';
  }
  if (normalized.includes('africa') || normalized.includes('middle east') || normalized.includes('gulf') || normalized.includes('me')) {
    return 'Africa & ME';
  }
  return 'All'; // Global if location is not specified
};

interface CopilotAction {
  id: string;
  name: string;
  description: string;
  parameters: {
    vaccRate?: number;
    socialDistance?: 'none' | 'mild' | 'moderate' | 'strict';
    testingIntensity?: number;
  };
  region: string;
  status: 'pending' | 'success';
}

interface CopilotServiceVisualizerProps {
  message: Message;
  result: SimulationResult;
  onApplyParams: (params: SimulationParams) => void;
}

export const CopilotServiceVisualizer: React.FC<CopilotServiceVisualizerProps> = ({
  message,
  result,
  onApplyParams
}) => {
  // Find mentioned region
  const initialRegion = detectMentionedRegion(message.text);
  const [activeRegion, setActiveRegion] = useState<'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME' | 'All'>(initialRegion);
  const [copilotActions, setCopilotActions] = useState<CopilotAction[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Generate dynamic CopilotKit intelligent actions based on the parameters of this specific message's simulation results
  useEffect(() => {
    const simRes = message.simulationResult || result;
    const { vaccRate, socialDistance, testingIntensity } = simRes.params;

    const actionsList: CopilotAction[] = [];

    // Action 1: Elevate Vaccination
    if (vaccRate < 80) {
      actionsList.push({
        id: `vax-boost-${message.id}`,
        name: 'Deploy Regional Vaccination Initiative',
        description: `Scale up immunology program from ${vaccRate}% to 85% to mitigate transmissibility.`,
        parameters: { vaccRate: 85 },
        region: activeRegion === 'All' ? 'Global' : activeRegion,
        status: 'pending'
      });
    }

    // Action 2: Tighten Quarantine
    if (socialDistance !== 'strict' && socialDistance !== 'moderate') {
      actionsList.push({
        id: `sd-enforce-${message.id}`,
        name: 'Strengthen Social Mandate Enforcements',
        description: `Upgrade community social distancing from "${socialDistance}" to "moderate" containment rules.`,
        parameters: { socialDistance: 'moderate' },
        region: activeRegion === 'All' ? 'Global' : activeRegion,
        status: 'pending'
      });
    } else if (socialDistance === 'moderate') {
      actionsList.push({
        id: `sd-strict-${message.id}`,
        name: 'Enact Strict Containment Lockdown',
        description: `Issue targeted strict confinement directives due to active peak outbreak wave.`,
        parameters: { socialDistance: 'strict' },
        region: activeRegion === 'All' ? 'Global' : activeRegion,
        status: 'pending'
      });
    }

    // Action 3: Expand Testing Capabilities
    if (testingIntensity < 75) {
      actionsList.push({
        id: `test-escalate-${message.id}`,
        name: 'Escalate Testing & Isolation Capacities',
        description: `Boost clinical testing capability from ${testingIntensity}% to 80% to shorten duration.`,
        parameters: { testingIntensity: 80 },
        region: activeRegion === 'All' ? 'Global' : activeRegion,
        status: 'pending'
      });
    }

    setCopilotActions(actionsList);
  }, [message, result, activeRegion]);

  const handleExecuteAction = (action: CopilotAction) => {
    setExecutingId(action.id);
    
    // Simulate smart Copilot agent executing the request
    setTimeout(() => {
      const simRes = message.simulationResult || result;
      const updatedParams: SimulationParams = {
        vaccRate: action.parameters.vaccRate ?? simRes.params.vaccRate,
        socialDistance: action.parameters.socialDistance ?? simRes.params.socialDistance,
        testingIntensity: action.parameters.testingIntensity ?? simRes.params.testingIntensity
      };

      // Set the global simulation state
      onApplyParams(updatedParams);

      // Mark the action as executed
      setCopilotActions(prev => 
        prev.map(act => act.id === action.id ? { ...act, status: 'success' } : act)
      );
      setExecutingId(null);
    }, 900);
  };

  const simRes = message.simulationResult || result;

  return (
    <div className="mt-4 border border-indigo-500/20 bg-indigo-950/10 rounded-2xl p-4.5 space-y-4" id={`copilotkit-service-${message.id}`}>
      {/* Copilot Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1 rounded-lg">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span className="text-[9.5px] font-black text-indigo-300 uppercase tracking-widest font-mono">
            CopilotKit Active Workspace
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>secure decision pipeline</span>
        </div>
      </div>

      {/* Embedded interactive SVG map linked with simulated outcomes */}
      <div id={`map-container-${message.id}`}>
        <SVGWorldMap
          result={simRes}
          selectedRegion={activeRegion}
          onRegionSelect={setActiveRegion}
          mentionedRegion={initialRegion !== 'All' ? initialRegion : undefined}
        />
      </div>

      {/* Suggested Copilot Actions List */}
      <div className="space-y-2 border-t border-white/5 pt-3">
        <div className="flex items-center justify-between">
          <h5 className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Suggested Copilot Ops ({copilotActions.length})
          </h5>
          <span className="text-[9px] text-white/30 font-mono">
            Click to live-inject parameters changes
          </span>
        </div>

        {copilotActions.length === 0 ? (
          <div className="bg-emerald-950/10 border border-emerald-500/15 p-3 rounded-xl flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <p className="text-[10px] text-emerald-300">
              All regional outbreak indices are controlled. No suggested interventions required for this scenario response.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {copilotActions.map((action) => (
              <div
                key={action.id}
                className={`p-3 border rounded-xl flex flex-col justify-between transition-all ${
                  action.status === 'success'
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                    : 'bg-white/5 border-white/5 hover:border-indigo-500/20 text-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-[10px] leading-tight block w-[70%] text-white">
                      {action.name}
                    </span>
                    <span className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded uppercase ${
                      action.status === 'success'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-indigo-500/10 text-indigo-400'
                    }`}>
                      {action.status === 'success' ? 'Applied' : 'Inject'}
                    </span>
                  </div>
                  <p className="text-[9.5px] text-white/50 leading-relaxed font-sans">
                    {action.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[8px] font-mono text-white/25">Target: {action.region}</span>
                  <button
                    type="button"
                    disabled={action.status === 'success' || executingId === action.id}
                    onClick={() => handleExecuteAction(action)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold transition-all cursor-pointer ${
                      action.status === 'success'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : executingId === action.id
                        ? 'bg-white/10 text-white animate-pulse'
                        : 'bg-white text-black hover:bg-indigo-100'
                    }`}
                  >
                    {action.status === 'success' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        Executed
                      </>
                    ) : executingId === action.id ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin text-white" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-2.5 h-2.5" />
                        Run Copilot Action
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
