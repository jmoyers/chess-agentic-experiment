import { create } from 'zustand';
import type { ExplorerResult, LichessDatabase, ExplorerMoveStats, ExplorerStatus } from '@chess/shared';

export type ExplorerSource = 'remote' | 'local';

interface ExplorerState {
  // Active source (toggle between remote API and local database)
  activeSource: ExplorerSource;
  
  // Local database availability
  localAvailable: boolean;
  localPositionCount: number | undefined;
  
  // Data for all databases
  mastersResult: ExplorerResult | null;
  lichessResult: ExplorerResult | null;
  localResult: ExplorerResult | null;
  
  // Loading states
  mastersLoading: boolean;
  lichessLoading: boolean;
  localLoading: boolean;
  
  // Error states
  mastersError: string | null;
  lichessError: string | null;
  localError: string | null;
  
  // Last queried position (to detect changes)
  lastQueriedFen: string | null;
  
  // Actions
  setActiveSource: (source: ExplorerSource) => void;
  setExplorerStatus: (status: ExplorerStatus) => void;
  setMastersResult: (result: ExplorerResult) => void;
  setLichessResult: (result: ExplorerResult) => void;
  setLocalResult: (result: ExplorerResult) => void;
  setMastersError: (error: string | null) => void;
  setLichessError: (error: string | null) => void;
  setLocalError: (error: string | null) => void;
  setMastersLoading: (loading: boolean) => void;
  setLichessLoading: (loading: boolean) => void;
  setLocalLoading: (loading: boolean) => void;
  setLastQueriedFen: (fen: string) => void;
  clear: () => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  activeSource: 'remote',
  localAvailable: false,
  localPositionCount: undefined,
  
  mastersResult: null,
  lichessResult: null,
  localResult: null,
  
  mastersLoading: false,
  lichessLoading: false,
  localLoading: false,
  
  mastersError: null,
  lichessError: null,
  localError: null,
  
  lastQueriedFen: null,
  
  setActiveSource: (source) => set({ activeSource: source }),
  setExplorerStatus: (status) => set({ 
    localAvailable: status.localAvailable,
    localPositionCount: status.localPositionCount,
  }),
  setMastersResult: (result) => set({ mastersResult: result, mastersLoading: false, mastersError: null }),
  setLichessResult: (result) => set({ lichessResult: result, lichessLoading: false, lichessError: null }),
  setLocalResult: (result) => set({ localResult: result, localLoading: false, localError: null }),
  setMastersError: (error) => set({ mastersError: error, mastersLoading: false }),
  setLichessError: (error) => set({ lichessError: error, lichessLoading: false }),
  setLocalError: (error) => set({ localError: error, localLoading: false }),
  setMastersLoading: (loading) => set({ mastersLoading: loading }),
  setLichessLoading: (loading) => set({ lichessLoading: loading }),
  setLocalLoading: (loading) => set({ localLoading: loading }),
  setLastQueriedFen: (fen) => set({ lastQueriedFen: fen }),
  clear: () => set({ 
    mastersResult: null, 
    lichessResult: null,
    localResult: null,
    mastersError: null, 
    lichessError: null,
    localError: null,
    mastersLoading: false,
    lichessLoading: false,
    localLoading: false,
  }),
}));

// Expose store for testing
if (typeof window !== 'undefined') {
  (window as any).__ZUSTAND_EXPLORER_STORE__ = useExplorerStore;
}

/**
 * Format large numbers with K/M suffix
 */
export function formatGameCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get the top N moves sorted by popularity
 */
export function getTopMoves(result: ExplorerResult | null, limit: number = 12): ExplorerMoveStats[] {
  if (!result) return [];
  return result.moves.slice(0, limit);
}
