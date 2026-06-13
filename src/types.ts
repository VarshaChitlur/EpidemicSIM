export type SocialDistanceLevel = 'none' | 'mild' | 'moderate' | 'strict';

export interface SimulationParams {
  vaccRate: number;
  socialDistance: SocialDistanceLevel;
  testingIntensity: number;
}

export interface SimulationResult {
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

export interface ScenarioComparison {
  scenario1: { name: string } & SimulationResult;
  scenario2: { name: string } & SimulationResult;
  winner: string;
  peakCaseDiff: number;
  durationDiff: number;
}

export interface SearchSource {
  name: string;
  url: string;
  snippet: string;
}

export interface SearchGrounding {
  query: string;
  answer: string;
  sources: SearchSource[];
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  group: 'public_health' | 'hospital' | 'policy' | 'media';
  region: 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME' | 'All';
  priority: 'High' | 'Medium' | 'Low';
  dueTime: string;
  status: 'open' | 'done';
  createdAt: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  simulationResult?: SimulationResult;
  comparison?: ScenarioComparison;
  searchGrounding?: SearchGrounding;
  tasksCreated?: Task[];
}

export interface AppConfig {
  googleAiKey?: string;
  copilotKitPubKey?: string;
  copilotKitSecretKey?: string;
  linkUpKey?: string;
  useRedis: boolean;
  redisUrl?: string;
  mem0Key?: string;
}
