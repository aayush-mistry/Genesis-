import React from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';

export const EntityPanel: React.FC = () => {
  const { selection, setSelection } = useSpatialStore();

  if (!selection) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 p-4 shadow-xl overflow-y-auto z-10 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white uppercase tracking-wider">{selection.type}</h2>
        <button 
          onClick={() => setSelection(null)}
          className="text-slate-400 hover:text-white"
        >
          &times;
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800 p-3 rounded">
          <div className="text-xs text-slate-400 uppercase">ID</div>
          <div className="text-sm font-mono text-indigo-300 break-all">{selection.id}</div>
        </div>

        {selection.data.name && (
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400 uppercase">Name</div>
            <div className="text-sm text-white">{selection.data.name}</div>
          </div>
        )}
        
        {selection.data.type && (
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400 uppercase">Type</div>
            <div className="text-sm text-white">{selection.data.type}</div>
          </div>
        )}
        
        {selection.data.coordinates && (
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400 uppercase">Coordinates</div>
            <div className="text-sm text-white font-mono">X: {Math.round(selection.data.coordinates.x)}, Y: {Math.round(selection.data.coordinates.y)}</div>
          </div>
        )}
        
        {selection.data.coordX !== undefined && (
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400 uppercase">Exact Coordinates</div>
            <div className="text-sm text-white font-mono">X: {Math.round(selection.data.coordX)}, Y: {Math.round(selection.data.coordY)}</div>
          </div>
        )}
        
        {selection.type === 'building' && selection.data.capacity && (
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-xs text-slate-400 uppercase">Capacity</div>
            <div className="text-sm text-white">{selection.data.capacity}</div>
          </div>
        )}

        {selection.type === 'resource' && (
          <>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400 uppercase">Amount</div>
              <div className="text-sm text-white">{selection.data.currentAmount.toFixed(2)} {selection.data.unit}</div>
            </div>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400 uppercase">Category</div>
              <div className="text-sm text-white">{selection.data.category}</div>
            </div>
          </>
        )}
        
        {selection.type === 'citizen' && (
          <>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400 uppercase">Status</div>
              <div className="text-sm text-white">{selection.data.status}</div>
            </div>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400 uppercase">Employment</div>
              <div className="text-sm text-white">{selection.data.employmentStatus}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
