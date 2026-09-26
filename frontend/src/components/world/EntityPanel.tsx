import React from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';

export const EntityPanel: React.FC = () => {
  const { selection, setSelection, selectEntity, isFocused, toggleFocus, dynamicState } = useSpatialStore();

  if (!selection) return null;

  const handleLinkClick = (type: any, id: string) => {
    selectEntity(type, id);
  };

  // Merge detailedData with live dynamicState if it's a citizen
  const liveCitizenData = selection.type === 'citizen' ? dynamicState?.citizens?.find((c: any) => c.id === selection.id) : null;
  
  // Use detailedData if available, otherwise fallback to lightweight data
  const data = selection.detailedData ? { ...selection.detailedData, ...liveCitizenData } : { ...selection.data, ...liveCitizenData };

  const renderBreadcrumb = () => {
    if (!selection.hierarchyPath || selection.hierarchyPath.length === 0) return null;
    return (
      <div className="text-[10px] text-slate-400 mb-4 flex flex-wrap gap-1">
        {selection.hierarchyPath.map((node, i) => (
          <React.Fragment key={node.id}>
            <button 
              className="hover:text-white underline decoration-slate-600 underline-offset-2"
              onClick={() => selectEntity(node.type as any, node.id)}
            >
              {node.name}
            </button>
            {i < selection.hierarchyPath!.length - 1 && <span>/</span>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderField = (label: string, value: any) => {
    if (value === undefined || value === null) return null;
    return (
      <div className="bg-slate-800/50 p-2 rounded mb-2 border border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-sm text-slate-200">{value}</div>
      </div>
    );
  };

  const renderLink = (label: string, type: string, id: string | null | undefined, display?: string) => {
    if (!id) return null;
    return (
      <div className="bg-slate-800/50 p-2 rounded mb-2 border border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
        <button 
          onClick={() => handleLinkClick(type, id)}
          className="text-sm text-indigo-400 hover:text-indigo-300 font-mono text-left break-all underline decoration-indigo-900 underline-offset-2"
        >
          {display || id}
        </button>
      </div>
    );
  };

  const renderList = (label: string, type: string, ids: string[]) => {
    if (!ids || ids.length === 0) return null;
    return (
      <div className="bg-slate-800/50 p-2 rounded mb-2 border border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label} ({ids.length})</div>
        <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
          {ids.map(id => (
            <button 
              key={id}
              onClick={() => handleLinkClick(type, id)}
              className="block w-full text-left text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-700/50 p-1 rounded font-mono truncate"
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 p-4 shadow-xl overflow-y-auto z-10 flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <h2 className="text-lg font-bold text-white uppercase tracking-wider leading-tight">
          {data.name || selection.type}
        </h2>
        <button 
          onClick={() => setSelection(null)}
          className="text-slate-400 hover:text-white p-1"
        >
          &times;
        </button>
      </div>

      {renderBreadcrumb()}
      
      {selection.type !== 'world' && selection.type !== 'terrain' && (
        <button
          onClick={toggleFocus}
          className={`mb-4 w-full py-2 rounded text-xs font-semibold tracking-wide uppercase transition-colors shadow-sm ${
            isFocused ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          {isFocused ? 'Unfocus Camera' : 'Focus Entity'}
        </button>
      )}

      {!selection.detailedData && <div className="text-xs text-yellow-500 mb-4 animate-pulse">Loading details...</div>}

      <div className="flex-1">
        {renderField('ID', <span className="font-mono text-xs text-slate-400">{selection.id}</span>)}
        {renderField('Type', data.type || selection.type)}
        
        {data.x !== undefined && data.y !== undefined && renderField('Coordinates', <span className="font-mono">X: {Math.round(data.x)}, Y: {Math.round(data.y)}</span>)}
        {data.coordinates && renderField('Coordinates', <span className="font-mono">X: {Math.round(data.coordinates.x)}, Y: {Math.round(data.coordinates.y)}</span>)}

        {/* REGION */}
        {selection.type === 'region' && (
          <>
            {renderField('Climate', data.climate)}
            {renderField('Area', `${data.area} m²`)}
            {renderList('Cities', 'city', data.cities)}
            {renderList('Resources', 'resource', data.resources)}
          </>
        )}

        {/* CITY */}
        {selection.type === 'city' && (
          <>
            {renderLink('Region', 'region', data.regionId)}
            {renderField('Area', `${data.area} m²`)}
            {renderList('Districts', 'district', data.districts)}
            {renderList('Buildings', 'building', data.buildings)}
          </>
        )}

        {/* DISTRICT */}
        {selection.type === 'district' && (
          <>
            {renderLink('City', 'city', data.cityId)}
            {renderField('Area', `${data.area} m²`)}
            {renderList('Buildings', 'building', data.buildings)}
          </>
        )}

        {/* BUILDING */}
        {selection.type === 'building' && (
          <>
            {renderLink('District', 'district', data.districtId)}
            {renderField('Capacity', data.capacity)}
            {renderList('Workplaces', 'workplace', data.workplaces)}
            {renderList('Households', 'household', data.households)}
          </>
        )}

        {/* WORKPLACE */}
        {selection.type === 'workplace' && (
          <>
            {renderLink('Building', 'building', data.buildingId || data.locationId)}
            {renderField('Capacity', `${data.occupiedPositions || 0} / ${data.capacity} workers`)}
            {data.finances && renderField('Wallet Balance', <span className="font-mono text-emerald-400">${data.finances.balance.toFixed(2)}</span>)}
            {data.inventory && renderField('Inventory Items', data.inventory.items.length)}
            {renderList('Workers', 'citizen', data.workers)}
          </>
        )}

        {/* HOUSEHOLD */}
        {selection.type === 'household' && (
          <>
            {renderLink('Building (Home)', 'building', data.locationId)}
            {renderList('Members', 'citizen', data.members)}
          </>
        )}

        {/* CITIZEN */}
        {selection.type === 'citizen' && (
          <>
            {renderField('Age', data.age)}
            {renderLink('Household', 'household', data.householdId)}
            {renderLink('Workplace', 'workplace', data.workplaceId)}
            {renderField('Employment', data.employmentStatus)}
            
            {data.wallet && renderField('Wallet', <span className="font-mono text-emerald-400">${data.wallet.balance.toFixed(2)}</span>)}
            
            <div className="mt-4 mb-2 text-xs font-bold text-slate-300 border-b border-slate-700 pb-1">LIVE STATE</div>
            
            {renderField('Movement', <span className={`font-bold ${data.movementState === 'TRAVELLING' ? 'text-amber-400' : 'text-emerald-400'}`}>{data.movementState || 'IDLE'}</span>)}
            
            {data.movementState === 'TRAVELLING' && data.activeRoute && (
              <div className="bg-slate-800/50 p-2 rounded mb-2 border border-slate-700/50">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Active Route</div>
                <div className="text-xs text-slate-300">
                  <div className="flex justify-between mb-1">
                    <span>Progress:</span>
                    <span className="font-mono text-amber-400">{Math.round((data.travelProgress || 0) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mb-2">
                    <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${(data.travelProgress || 0) * 100}%` }}></div>
                  </div>
                  {renderLink('Destination', 'building', data.activeRoute.destinationId)}
                </div>
              </div>
            )}
          </>
        )}

        {/* RESOURCE */}
        {selection.type === 'resource' && (
          <>
            {renderLink('Region', 'region', data.regionId)}
            {renderField('Category', data.category)}
            
            <div className="bg-slate-800/50 p-3 rounded mb-2 border border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Quantity</div>
              <div className="text-sm text-slate-200 font-mono mb-2">
                {data.currentAmount?.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {data.maximumAmount?.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-xs text-slate-400">{data.unit}</span>
              </div>
              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full transition-all" 
                  style={{ width: `${Math.min(100, Math.max(0, (data.currentAmount / data.maximumAmount) * 100))}%` }}
                ></div>
              </div>
            </div>

            {data.condition && (
              <div className="bg-slate-800/50 p-2 rounded mb-2 border border-slate-700/50">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{data.condition.type} (Condition)</div>
                <div className="text-sm text-emerald-400 font-mono">
                  {(data.condition.value * 100).toFixed(1)}%
                </div>
              </div>
            )}

            {data.naturalRecoveryRate !== null && data.naturalRecoveryRate !== undefined && (
              renderField('Regeneration', <span className="text-emerald-400 font-mono">+{data.naturalRecoveryRate} {data.unit}/hr</span>)
            )}
          </>
        )}
      </div>
    </div>
  );
};
