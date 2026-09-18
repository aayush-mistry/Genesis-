import React, { useEffect, useRef, useState } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { SpatialSnapshot } from '../../types/spatial.types';

interface Point {
  x: number;
  y: number;
}

export const WorldCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { snapshot, dynamicState, fetchDynamicState, camera, setCamera, setSelection } = useSpatialStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });

  // Map backend spatial coordinates to canvas rendering
  const renderWorld = (ctx: CanvasRenderingContext2D, width: number, height: number, data: SpatialSnapshot, dynamicData: any) => {
    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    
    // Background Grid
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, width, height);
    
    ctx.save();
    
    // Apply camera transform
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Subtle coordinate grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)'; // slate-800
    ctx.lineWidth = 1 / camera.zoom;
    const gridSize = 100;
    const startX = Math.floor((camera.x - width / 2 / camera.zoom) / gridSize) * gridSize;
    const endX = Math.ceil((camera.x + width / 2 / camera.zoom) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - height / 2 / camera.zoom) / gridSize) * gridSize;
    const endY = Math.ceil((camera.y + height / 2 / camera.zoom) / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Helper for Debug Labels
    const drawLabel = (text: string, x: number, y: number, color: string, fontSize: number = 10, align: CanvasTextAlign = 'left') => {
      ctx.font = `bold ${fontSize / camera.zoom}px Inter`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    };

    // 0. Draw Terrain
    if (data.terrain) {
      data.terrain.forEach(t => {
        let color = 'rgba(30, 41, 59, 0.4)';
        if (t.type === 'PLAIN') color = 'rgba(74, 222, 128, 0.15)'; // Green-400
        if (t.type === 'HILL') color = 'rgba(163, 163, 163, 0.15)'; // Neutral-400
        if (t.type === 'MOUNTAIN') color = 'rgba(212, 212, 216, 0.25)'; // Zinc-300
        
        ctx.fillStyle = color;
        const tx = t.coordinates.x - t.width / 2;
        const ty = t.coordinates.y - t.height / 2;
        ctx.fillRect(tx, ty, t.width, t.height);

        if (camera.zoom < 0.8) {
          drawLabel(t.name || t.type, t.coordinates.x, t.coordinates.y, 'rgba(255,255,255,0.4)', 18, 'center');
        }
      });
    }

    // 0.5. Draw Resources (Water, Forest, Agriculture, Minerals)
    if (data.resources) {
      data.resources.forEach(r => {
        const rx = r.coordinates.x;
        const ry = r.coordinates.y;
        const radius = r.radius || 50;

        ctx.beginPath();
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        
        if (r.type === 'WATER') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.4)'; // Sky-400
          ctx.fill();
          if (camera.zoom >= 0.5 && camera.zoom < 3.0) {
            drawLabel('💧 ' + r.name, rx, ry, '#7dd3fc', 12, 'center');
          }
        } else if (r.type === 'FORESTS') {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.4)'; // Green-500
          ctx.fill();
          if (camera.zoom >= 0.5 && camera.zoom < 3.0) {
            drawLabel('🌲 ' + r.name, rx, ry, '#86efac', 12, 'center');
          }
        } else if (r.type === 'GRASSLANDS') {
          ctx.fillStyle = 'rgba(163, 230, 53, 0.3)'; // Lime-400
          ctx.fill();
          if (camera.zoom >= 0.5 && camera.zoom < 3.0) {
            drawLabel('🌾 ' + r.name, rx, ry, '#bef264', 12, 'center');
          }
        } else {
          // Other resources (minerals, potentials)
          if (camera.zoom >= 1.5) { // Only show these at higher zoom
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)'; // Amber-400
            ctx.lineWidth = 2 / camera.zoom;
            ctx.stroke();
            if (camera.zoom >= 2.0) {
              drawLabel('⛏️ ' + r.name, rx, ry + radius + 10, '#fcd34d', 10, 'center');
            }
          }
        }
      });
    }

    // 0.7. Draw Resource Workplaces (Farms, Mines, Fishing)
    if (data.workplaces) {
      data.workplaces.forEach((wp: any) => {
        if (!wp.coordinates || (wp.coordinates.x === 0 && wp.coordinates.y === 0)) return;
        const wx = wp.coordinates.x;
        const wy = wp.coordinates.y;

        if (wp.type === 'FARM') {
          // Farm / Agricultural Land
          const size = 150; // Agricultural plot size
          ctx.fillStyle = 'rgba(234, 179, 8, 0.2)'; // Yellow-500
          ctx.fillRect(wx - size / 2, wy - size / 2, size, size);
          
          ctx.strokeStyle = 'rgba(202, 138, 4, 0.4)'; // Yellow-600
          ctx.lineWidth = 2 / camera.zoom;
          ctx.strokeRect(wx - size / 2, wy - size / 2, size, size);

          if (camera.zoom >= 0.8 && camera.zoom < 3.0) {
            drawLabel('🚜 Farm Land', wx, wy, '#fef08a', 14, 'center');
          }
        } else if (wp.type === 'MINE') {
          // Mine
          ctx.beginPath();
          ctx.moveTo(wx - 40, wy + 40);
          ctx.lineTo(wx + 40, wy + 40);
          ctx.lineTo(wx, wy - 30);
          ctx.closePath();
          ctx.fillStyle = 'rgba(82, 82, 91, 0.5)'; // Zinc-600
          ctx.fill();
          ctx.strokeStyle = 'rgba(161, 161, 170, 0.8)';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.stroke();

          if (camera.zoom >= 0.8 && camera.zoom < 3.0) {
            drawLabel('⛏️ Mine', wx, wy + 50, '#d4d4d8', 14, 'center');
          }
        } else if (wp.type === 'FISHING_SITE') {
          // Fishing
          ctx.beginPath();
          ctx.arc(wx, wy, 60, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(14, 165, 233, 0.3)'; // Sky-500
          ctx.fill();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.stroke();

          if (camera.zoom >= 0.8 && camera.zoom < 3.0) {
            drawLabel('🎣 Fishery', wx, wy, '#bae6fd', 14, 'center');
          }
        } else if (wp.type === 'HOSPITAL') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // Red-500
          ctx.fillRect(wx - 10, wy - 10, 20, 20);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(wx - 8, wy - 3, 16, 6);
          ctx.fillRect(wx - 3, wy - 8, 6, 16);
          if (camera.zoom >= 1.5) drawLabel('🏥 Hospital', wx, wy + 20, '#f87171', 12, 'center');
        } else if (wp.type === 'SCHOOL') {
          ctx.fillStyle = 'rgba(234, 179, 8, 0.9)'; // Yellow-500
          ctx.beginPath();
          ctx.moveTo(wx, wy - 12);
          ctx.lineTo(wx + 12, wy);
          ctx.lineTo(wx + 8, wy + 12);
          ctx.lineTo(wx - 8, wy + 12);
          ctx.lineTo(wx - 12, wy);
          ctx.closePath();
          ctx.fill();
          if (camera.zoom >= 1.5) drawLabel('🏫 School', wx, wy + 22, '#fde047', 12, 'center');
        } else if (wp.type === 'POLICE_STATION') {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'; // Blue-500
          ctx.fillRect(wx - 10, wy - 10, 20, 20);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.strokeRect(wx - 6, wy - 6, 12, 12);
          if (camera.zoom >= 1.5) drawLabel('🚓 Police', wx, wy + 20, '#60a5fa', 12, 'center');
        } else if (wp.type === 'FIRE_STATION') {
          ctx.fillStyle = 'rgba(220, 38, 38, 0.9)'; // Red-600
          ctx.beginPath();
          ctx.moveTo(wx, wy - 12);
          ctx.lineTo(wx + 10, wy + 10);
          ctx.lineTo(wx - 10, wy + 10);
          ctx.closePath();
          ctx.fill();
          if (camera.zoom >= 1.5) drawLabel('🚒 Fire Station', wx, wy + 20, '#f87171', 12, 'center');
        } else if (wp.type === 'WHOLESALE') {
          ctx.fillStyle = 'rgba(139, 92, 246, 0.9)'; // Violet-500
          ctx.fillRect(wx - 12, wy - 12, 24, 24);
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.strokeRect(wx - 8, wy - 8, 16, 16);
          if (camera.zoom >= 1.5) drawLabel('🏢 Wholesale', wx, wy + 20, '#a78bfa', 12, 'center');
        }
      });
    }

    // 1. Draw Regions
    data.regions.forEach(region => {
      const rx = region.coordinates.x - 500;
      const ry = region.coordinates.y - 500;
      
      // Region outer bounds (soft glow)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'; // slate-900
      ctx.fillRect(rx, ry, 1000, 1000);
      
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)'; // slate-700
      ctx.lineWidth = 4 / camera.zoom;
      ctx.strokeRect(rx, ry, 1000, 1000);

      if (camera.zoom < 0.8) {
        drawLabel(`REGION: ${region.name}`, region.coordinates.x, region.coordinates.y - 450, '#94a3b8', 24, 'center');
      }
    });

    // 2. Draw Cities (Urban Sprawl)
    data.cities?.forEach(city => {
      const cx = city.coordinates.x - Math.sqrt(city.area) / 2;
      const cy = city.coordinates.y - Math.sqrt(city.area) / 2;
      const size = Math.sqrt(city.area);
      
      // Urban footprint
      const gradient = ctx.createRadialGradient(
        city.coordinates.x, city.coordinates.y, size * 0.1,
        city.coordinates.x, city.coordinates.y, size * 0.5
      );
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.15)'); // sky-400
      gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - size, cy - size, size * 3, size * 3); // Sprawl beyond area
      
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 2 / camera.zoom;
      ctx.strokeRect(cx, cy, size, size);
      
      if (camera.zoom >= 0.5 && camera.zoom < 2.0) {
        drawLabel(`CITY: ${city.name}`, city.coordinates.x, city.coordinates.y - size/2 - 15, '#7dd3fc', 16, 'center');
      }
    });

    // 3. Draw Districts (Zoning)
    data.districts.forEach(district => {
      const isCommercial = district.type === 'COMMERCIAL';
      const isResidential = district.type === 'RESIDENTIAL';
      
      ctx.fillStyle = isResidential ? 'rgba(99, 102, 241, 0.15)' :
                      isCommercial ? 'rgba(236, 72, 153, 0.15)' :
                      'rgba(245, 158, 11, 0.15)';
      
      ctx.strokeStyle = isResidential ? 'rgba(99, 102, 241, 0.5)' :
                        isCommercial ? 'rgba(236, 72, 153, 0.5)' :
                        'rgba(245, 158, 11, 0.5)';
                        
      ctx.setLineDash([8 / camera.zoom, 8 / camera.zoom]);
      ctx.lineWidth = 2 / camera.zoom;
      
      const size = Math.sqrt(district.area);
      const dx = district.coordinates.x - size / 2;
      const dy = district.coordinates.y - size / 2;
      
      ctx.fillRect(dx, dy, size, size);
      ctx.strokeRect(dx, dy, size, size);
      ctx.setLineDash([]);
      
      if (camera.zoom >= 1.0 && camera.zoom < 4.0) {
        drawLabel(district.name.toUpperCase(), district.coordinates.x, dy + 15, ctx.strokeStyle as string, 12, 'center');
      }
    });

    // 4. Draw Buildings (Icons)
    data.buildings.forEach((building) => {
      const bx = building.coordinates.x;
      const by = building.coordinates.y;
      
      ctx.save();
      ctx.translate(bx, by);
      
      if (building.status === 'ACTIVE') {
        ctx.shadowBlur = 10 / camera.zoom;
        ctx.shadowColor = building.type === 'FACTORY' ? '#f59e0b' : '#ec4899';
      }

      if (building.type === 'FACTORY') {
        // Factory Icon (Sawtooth)
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'; // Amber
        ctx.beginPath();
        ctx.moveTo(-10, 10);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-5, 0);
        ctx.lineTo(0, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(5, -5);
        ctx.lineTo(5, 0);
        ctx.lineTo(10, -5);
        ctx.lineTo(10, 10);
        ctx.closePath();
        ctx.fill();
        
        // Smokestack
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-8, -12, 3, 10);
      } else if (building.type === 'STORE') {
        // Store Icon (Awning)
        ctx.fillStyle = 'rgba(236, 72, 153, 0.9)'; // Pink
        ctx.fillRect(-8, -5, 16, 12);
        
        // Stripes
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.moveTo(-9, -5);
        ctx.lineTo(-7, 2);
        ctx.lineTo(-5, 2);
        ctx.lineTo(-7, -5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-1, -5);
        ctx.lineTo(1, 2);
        ctx.lineTo(3, 2);
        ctx.lineTo(1, -5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(7, -5);
        ctx.lineTo(9, 2);
        ctx.lineTo(11, 2);
        ctx.lineTo(9, -5);
        ctx.closePath();
        ctx.fill();
      } else if (building.type === 'APARTMENT' || building.type === 'HOUSE') {
        // Residential icon
        ctx.fillStyle = 'rgba(99, 102, 241, 0.9)'; // Indigo
        ctx.beginPath();
        ctx.moveTo(-8, 2);
        ctx.lineTo(0, -6);
        ctx.lineTo(8, 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-6, 2, 12, 6);
      } else {
        // Generic Square
        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
        ctx.fillRect(-6, -6, 12, 12);
      }
      
      ctx.restore();
      
      if (camera.zoom >= 3.0) {
        drawLabel(building.name, bx, by + 18, '#ffffff', 8, 'center');
      }
    });

    // 5. Draw Citizens / Population Density
    const activeClusters = dynamicData?.populationClusters || data.populationClusters;
    if (camera.zoom < 2.0 && activeClusters) {
      // Heatmap / Aggregated cluster at low zoom
      activeClusters.forEach((cluster: any) => {
        const cx = cluster.x;
        const cy = cluster.y;
        const count = cluster.population;
        
        if (count > 0) {
          const radius = Math.max(10, 5 + Math.log10(count) * 8);
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          grad.addColorStop(0, 'rgba(16, 185, 129, 0.8)'); // Emerald
          grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();

          if (camera.zoom >= 0.5) {
            drawLabel(count.toString(), cx, cy, '#ffffff', 10, 'center');
          }
        }
      });
    } else if (camera.zoom >= 2.0 && (dynamicData?.citizens || data.citizens)) {
      const activeCitizens = dynamicData?.citizens || data.citizens;
      // High zoom: Draw at exact coordinates
      const dotSize = Math.max(0.5, 2 / camera.zoom);
      
      activeCitizens.forEach((citizen: any) => {
        // Use exact coordinates
        const cX = citizen.x ?? (citizen.coordinates?.x ?? 0);
        const cY = citizen.y ?? (citizen.coordinates?.y ?? 0);
        
        ctx.fillStyle = citizen.movementState === 'TRAVELLING' ? '#f59e0b' : '#34d399'; // Amber if travelling, Emerald if idle
        
        ctx.beginPath();
        ctx.arc(cX, cY, dotSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw subtle destination trail if selected or high zoom
        if (citizen.movementState === 'TRAVELLING' && citizen.destinationX !== undefined && camera.zoom >= 3.0) {
           ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
           ctx.lineWidth = 1 / camera.zoom;
           ctx.beginPath();
           ctx.moveTo(cX, cY);
           ctx.lineTo(citizen.destinationX, citizen.destinationY);
           ctx.stroke();
        }
      });
    }
    
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    
    const render = () => {
      renderWorld(ctx, canvas.width, canvas.height, snapshot, dynamicState);
      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [snapshot, dynamicState, camera]);

  // Poll dynamic state
  useEffect(() => {
    if (!snapshot) return;
    
    fetchDynamicState(); // initial fetch
    const intervalId = setInterval(fetchDynamicState, 1000); // 1 second polling
    
    return () => clearInterval(intervalId);
  }, [snapshot, fetchDynamicState]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Native Wheel Event (to safely preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
      
      setCamera({
        zoom: Math.min(Math.max(0.1, camera.zoom * direction), 10)
      });
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [camera.zoom, setCamera]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const dx = (e.clientX - dragStart.x) / camera.zoom;
    const dy = (e.clientY - dragStart.y) / camera.zoom;
    
    setCamera({
      x: camera.x - dx,
      y: camera.y - dy
    });
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Click detection for selection
  const handleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current || !snapshot) return;
    
    // We didn't drag, so it's a click
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const centerX = canvasRef.current.width / 2;
    const centerY = canvasRef.current.height / 2;
    
    const worldX = (clickX - centerX) / camera.zoom + camera.x;
    const worldY = (clickY - centerY) / camera.zoom + camera.y;
    
    // 1. Check Citizens/Clusters (if applicable)
    if (camera.zoom >= 2.0) {
      const clickDist = 5 / camera.zoom;
      const activeCitizens = dynamicState?.citizens || snapshot.citizens;
      for (const c of activeCitizens) {
        const cX = (c as any).x ?? ((c as any).coordinates?.x ?? 0);
        const cY = (c as any).y ?? ((c as any).coordinates?.y ?? 0);
        const dist = Math.sqrt(Math.pow(worldX - cX, 2) + Math.pow(worldY - cY, 2));
        if (dist <= clickDist) {
          setSelection({ type: 'citizen', id: c.id, data: c });
          return;
        }
      }
    }

    // 2. Check Buildings
    for (const b of snapshot.buildings) {
      const w = b.width || (b.capacity > 50 ? 24 : 16);
      const h = b.height || (b.capacity > 50 ? 24 : 16);
      if (worldX >= b.coordinates.x - w/2 && worldX <= b.coordinates.x + w/2 &&
          worldY >= b.coordinates.y - h/2 && worldY <= b.coordinates.y + h/2) {
        setSelection({ type: 'building', id: b.id, data: b });
        return;
      }
    }
    // 2.5. Check Workplaces (Farms, Mines, etc.)
    if (snapshot.workplaces) {
      for (const wp of snapshot.workplaces as any[]) {
        if (!wp.coordinates || (wp.coordinates.x === 0 && wp.coordinates.y === 0)) continue;
        if (['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE'].includes(wp.type)) {
           const size = wp.type === 'FARM' ? 150 : 80;
           if (worldX >= wp.coordinates.x - size/2 && worldX <= wp.coordinates.x + size/2 &&
               worldY >= wp.coordinates.y - size/2 && worldY <= wp.coordinates.y + size/2) {
             setSelection({ type: 'workplace', id: wp.id, data: wp });
             return;
           }
        }
        if (['HOSPITAL', 'SCHOOL', 'POLICE_STATION', 'FIRE_STATION', 'WHOLESALE'].includes(wp.type)) {
           const size = 30; // approx icon size
           if (worldX >= wp.coordinates.x - size/2 && worldX <= wp.coordinates.x + size/2 &&
               worldY >= wp.coordinates.y - size/2 && worldY <= wp.coordinates.y + size/2) {
             setSelection({ type: 'workplace', id: wp.id, data: wp });
             return;
           }
        }
      }
    }
    
    // 3. Check Resources
    for (const r of snapshot.resources) {
      const dist = Math.sqrt(Math.pow(worldX - r.coordinates.x, 2) + Math.pow(worldY - r.coordinates.y, 2));
      if (dist <= r.radius) {
        setSelection({ type: 'resource', id: r.id, data: r });
        return;
      }
    }
    // 4. Check Districts
    if (snapshot.districts) {
      for (const d of snapshot.districts) {
        const size = Math.sqrt(d.area);
        if (worldX >= d.coordinates.x - size/2 && worldX <= d.coordinates.x + size/2 &&
            worldY >= d.coordinates.y - size/2 && worldY <= d.coordinates.y + size/2) {
          setSelection({ type: 'district', id: d.id, data: d });
          return;
        }
      }
    }

    // 5. Check Cities
    if (snapshot.cities) {
      for (const c of snapshot.cities) {
        const size = Math.sqrt(c.area);
        if (worldX >= c.coordinates.x - size/2 && worldX <= c.coordinates.x + size/2 &&
            worldY >= c.coordinates.y - size/2 && worldY <= c.coordinates.y + size/2) {
          setSelection({ type: 'city', id: c.id, data: c });
          return;
        }
      }
    }

    // 6. Check Region
    if (snapshot.regions) {
      for (const r of snapshot.regions) {
        if (worldX >= r.coordinates.x - 500 && worldX <= r.coordinates.x + 500 &&
            worldY >= r.coordinates.y - 500 && worldY <= r.coordinates.y + 500) {
          setSelection({ type: 'region', id: r.id, data: r });
          return;
        }
      }
    }

    // 7. Check Terrain
    if (snapshot.terrain) {
      for (const t of snapshot.terrain) {
        if (worldX >= t.coordinates.x - t.width/2 && worldX <= t.coordinates.x + t.width/2 &&
            worldY >= t.coordinates.y - t.height/2 && worldY <= t.coordinates.y + t.height/2) {
          setSelection({ type: 'terrain', id: t.id, data: t } as any);
          return;
        }
      }
    }

    // Clear selection if clicked empty space
    setSelection(null);
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative overflow-hidden bg-slate-950"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
