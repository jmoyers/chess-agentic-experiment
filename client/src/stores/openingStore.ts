import { create } from 'zustand';
import type { OpeningSearchResult } from '@chess/shared';

interface CurrentOpening {
  eco: string;
  name: string;
  pgn: string;
}

interface OpeningState {
  // Current opening loaded on the board
  currentOpening: CurrentOpening | null;
  
  // Search state
  searchQuery: string;
  searchResults: OpeningSearchResult[];
  isSearching: boolean;
  
  // Actions
  setCurrentOpening: (opening: CurrentOpening | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: OpeningSearchResult[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  clearSearch: () => void;
}

export const useOpeningStore = create<OpeningState>((set) => ({
  currentOpening: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  
  setCurrentOpening: (opening) => set({ currentOpening: opening }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results, isSearching: false }),
  setIsSearching: (isSearching) => set({ isSearching }),
  clearSearch: () => set({ searchQuery: '', searchResults: [], isSearching: false }),
}));


