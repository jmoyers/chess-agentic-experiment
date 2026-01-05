import { create } from 'zustand';
import type { AnalysisInfo, AnalysisLine, AnalysisComplete, EngineInfo, AnalysisOptions } from '@chess/shared';

interface AnalysisState {
  // Engine state
  engineReady: boolean;
  engineInfo: EngineInfo | null;
  
  // Analysis state
  isAnalyzing: boolean;
  currentFen: string | null;
  
  // Streaming results
  lines: AnalysisLine[];
  currentDepth: number;
  hashfull: number;
  elapsed: number;
  
  // Best move (when analysis completes)
  bestMove: string | null;
  ponder: string | null;
  
  // Options
  options: AnalysisOptions;
  
  // Error
  error: string | null;
  
  // Actions
  setEngineReady: (info: EngineInfo) => void;
  handleAnalysisInfo: (info: AnalysisInfo) => void;
  handleAnalysisComplete: (result: AnalysisComplete) => void;
  handleAnalysisError: (error: string) => void;
  startAnalysis: (fen: string) => void;
  stopAnalysis: () => void;
  setOptions: (options: Partial<AnalysisOptions>) => void;
  reset: () => void;
}

const DEFAULT_OPTIONS: AnalysisOptions = {
  infinite: true,
  multiPv: 5,
  threads: undefined, // Use default
  hash: undefined, // Use default
};

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  // Initial state
  engineReady: false,
  engineInfo: null,
  isAnalyzing: false,
  currentFen: null,
  lines: [],
  currentDepth: 0,
  hashfull: 0,
  elapsed: 0,
  bestMove: null,
  ponder: null,
  options: DEFAULT_OPTIONS,
  error: null,
  
  setEngineReady: (info) => {
    set({ engineReady: true, engineInfo: info, error: null });
  },
  
  handleAnalysisInfo: (info) => {
    set({
      lines: info.lines,
      currentDepth: info.currentDepth,
      hashfull: info.hashfull,
      elapsed: info.elapsed,
      error: null,
    });
  },
  
  handleAnalysisComplete: (result) => {
    set({
      isAnalyzing: false,
      lines: result.lines,
      bestMove: result.bestMove,
      ponder: result.ponder,
    });
  },
  
  handleAnalysisError: (error) => {
    set({
      isAnalyzing: false,
      error,
    });
  },
  
  startAnalysis: (fen) => {
    set({
      isAnalyzing: true,
      currentFen: fen,
      lines: [],
      currentDepth: 0,
      hashfull: 0,
      elapsed: 0,
      bestMove: null,
      ponder: null,
      error: null,
    });
  },
  
  stopAnalysis: () => {
    set({ isAnalyzing: false });
  },
  
  setOptions: (newOptions) => {
    set((state) => ({
      options: { ...state.options, ...newOptions },
    }));
  },
  
  reset: () => {
    set({
      isAnalyzing: false,
      currentFen: null,
      lines: [],
      currentDepth: 0,
      hashfull: 0,
      elapsed: 0,
      bestMove: null,
      ponder: null,
      error: null,
    });
  },
}));

