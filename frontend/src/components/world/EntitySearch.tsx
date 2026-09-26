import React, { useState, useEffect, useRef } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Search, Loader2 } from 'lucide-react';

export const EntitySearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { selectEntity } = useSpatialStore();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length >= 2) {
        setIsSearching(true);
        try {
          const res = await fetch(`/api/v1/world/entities/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = await res.json();
            setResults(data.results || []);
          }
        } catch (e) {
          console.error('Search failed', e);
        } finally {
          setIsSearching(false);
          setIsOpen(true);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelect = (item: any) => {
    selectEntity(item.type, item.id);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrapperRef} className="relative w-64">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isSearching ? <Loader2 size={14} className="text-slate-400 animate-spin" /> : <Search size={14} className="text-slate-400" />}
        </div>
        <input
          type="text"
          className="block w-full pl-9 pr-3 py-1.5 border border-slate-700 rounded-md leading-5 bg-slate-900/80 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm backdrop-blur-sm transition-colors"
          placeholder="Search entities..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50 overflow-hidden">
          <ul className="max-h-60 overflow-auto py-1">
            {results.map((item, idx) => (
              <li 
                key={`${item.type}-${item.id}-${idx}`}
                className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm"
                onClick={() => handleSelect(item)}
              >
                <div className="flex justify-between items-center">
                  <span className="text-slate-200 font-medium truncate">{item.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase ml-2">{item.type}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate">{item.id}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {isOpen && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50 p-3 text-sm text-slate-400 text-center">
          No entities found
        </div>
      )}
    </div>
  );
};
