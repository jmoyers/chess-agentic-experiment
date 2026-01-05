import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useOpeningStore } from '../../stores/openingStore';
import './OpeningSelector.css';

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

interface OpeningSelectorProps {
  onSelect?: (openingName: string) => void;
}

export function OpeningSelector({ onSelect }: OpeningSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const loadOpeningByPgn = useConnectionStore((state) => state.loadOpeningByPgn);
  const searchOpenings = useConnectionStore((state) => state.searchOpenings);
  const isConnected = useConnectionStore((state) => state.isConnected);
  
  const searchResults = useOpeningStore((state) => state.searchResults);
  const isSearching = useOpeningStore((state) => state.isSearching);
  const clearSearch = useOpeningStore((state) => state.clearSearch);
  
  // Debounce search query
  const debouncedQuery = useDebounce(searchQuery, 200);
  
  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length >= 2 && isConnected) {
      searchOpenings(debouncedQuery);
    } else if (debouncedQuery.length < 2) {
      clearSearch();
    }
  }, [debouncedQuery, isConnected, searchOpenings, clearSearch]);
  
  // Group results by ECO family for better organization
  const groupedResults = useMemo(() => {
    if (searchResults.length === 0) return null;
    
    const groups: Record<string, typeof searchResults> = {};
    for (const opening of searchResults) {
      const family = opening.eco[0]; // A, B, C, D, or E
      if (!groups[family]) groups[family] = [];
      groups[family].push(opening);
    }
    return groups;
  }, [searchResults]);

  const handleSelect = useCallback((pgn: string, name: string) => {
    loadOpeningByPgn(pgn);
    onSelect?.(name);
    setIsExpanded(false);
    setSearchQuery('');
    clearSearch();
  }, [loadOpeningByPgn, onSelect, clearSearch]);
  
  // Popular openings to show when no search query
  const popularOpenings = [
    { eco: 'C50', name: 'Italian Game', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
    { eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
    { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
    { eco: 'C00', name: 'French Defense', pgn: '1. e4 e6' },
    { eco: 'B10', name: 'Caro-Kann Defense', pgn: '1. e4 c6' },
    { eco: 'D06', name: "Queen's Gambit", pgn: '1. d4 d5 2. c4' },
    { eco: 'E60', name: "King's Indian Defense", pgn: '1. d4 Nf6 2. c4 g6' },
    { eco: 'D00', name: 'London System', pgn: '1. d4 d5 2. Bf4' },
  ];

  return (
    <div className="opening-selector">
      <button
        className="opening-selector-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="toggle-text">Opening Library</span>
        <span className="opening-count">3,600+ openings</span>
      </button>

      {isExpanded && (
        <div className="opening-selector-content">
          <div className="opening-search">
            <input
              type="text"
              placeholder="Search openings... (e.g., Sicilian, Italian, Caro-Kann)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              autoFocus
            />
            {isSearching && (
              <span className="search-spinner">⟳</span>
            )}
          </div>

          <div className="opening-list">
            {/* Show search results if query exists */}
            {searchQuery.length >= 2 ? (
              searchResults.length > 0 ? (
                groupedResults && Object.entries(groupedResults).map(([family, openings]) => (
                  <div key={family} className="eco-group">
                    <div className="eco-group-header">ECO {family}</div>
                    {openings.slice(0, 10).map((opening, idx) => (
                      <div
                        key={`${opening.eco}-${idx}`}
                        className="opening-item"
                        onClick={() => handleSelect(opening.pgn, opening.name)}
                      >
                        <div className="opening-header">
                          <span className="opening-eco">{opening.eco}</span>
                          <span className="opening-name">{opening.name}</span>
                        </div>
                        <div className="opening-moves">{opening.pgn}</div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="opening-empty">
                  {isSearching ? 'Searching...' : 'No openings found'}
                </div>
              )
            ) : (
              /* Show popular openings when no search */
              <>
                <div className="popular-header">Popular Openings</div>
                {popularOpenings.map((opening) => (
                  <div
                    key={opening.eco + opening.name}
                    className="opening-item"
                    onClick={() => handleSelect(opening.pgn, opening.name)}
                  >
                    <div className="opening-header">
                      <span className="opening-eco">{opening.eco}</span>
                      <span className="opening-name">{opening.name}</span>
                    </div>
                    <div className="opening-moves">{opening.pgn}</div>
                  </div>
                ))}
                <div className="search-hint">
                  Type to search 3,600+ named openings from the Lichess database
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
