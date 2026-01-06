export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR',
  LIVE_SCAN = 'LIVE_SCAN'
}

export interface Insight {
  title: string;
  description: string;
  type: 'positive' | 'warning' | 'neutral' | 'critical';
  confidence: number;
}

export interface NutritionalDimension {
  subject: string;
  A: number; // Score out of 100
  fullMark: number;
}

export interface Villain {
  name: string;
  explanation: string;
}

export interface AnalysisResult {
  productName?: string;
  summary: string; // High-level verdict
  audioScript: string; // Short, punchy script for Text-to-Speech
  shareContent: string; // Viral-ready social media text
  intentInference: string; // What the AI thinks the user cares about
  dietaryClassification: 'veg' | 'non-veg' | 'vegan' | 'unknown';
  uncertainty: {
    detected: boolean;
    reason: string; // Explanation of ambiguity (e.g. "Unspecified oil source")
  };
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  villains: Villain[]; // List of specific bad ingredients mentioned in text
  insights: Insight[];
  healthScore: number;
  radarData: NutritionalDimension[];
  reasoningTrace: string[]; // Steps the AI took to reach conclusion
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}