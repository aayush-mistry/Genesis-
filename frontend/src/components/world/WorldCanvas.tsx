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
  
  const { snapshot, camera, setCamera, setSelection } = useSpatialStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });

  // Map backend spatial coordinates to canvas rendering
  const renderWorld = (ctx: CanvasRenderingContext2D, width: number, height: number, data: SpatialSnapshot) => {
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

    // 5. Draw Citizens
    const locationGroups = new Map<string, typeof data.citizens>();
    data.citizens.forEach(c => {
      const loc = c.locationId || 'unknown';
      if (!locationGroups.has(loc)) locationGroups.set(loc, []);
      locationGroups.get(loc)!.push(c);
    });

    if (camera.zoom < 2.0) {
      // Heatmap / Aggregated cluster at low zoom
      locationGroups.forEach((citizensInLoc, locId) => {
        let cx = 0, cy = 0;
        
        // Resolve spatial bounds of this location
        const b = data.buildings.find(b => b.id === locId);
        if (b) {
          cx = b.coordinates.x;
          cy = b.coordinates.y;
        } else {
          const d = data.districts.find(d => d.id === locId);
          if (d) {
            cx = d.coordinates.x;
            cy = d.coordinates.y;
          } else {
            // If no location, spawn in city/region center
            const c = data.cities?.[0];
            cx = c?.coordinates.x || 0;
            cy = c?.coordinates.y || 0;
          }
        }

        const count = citizensInLoc.length;
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
      });
    } else {
      // High zoom: Draw at exact coordinates
      ctx.fillStyle = '#34d399'; // Emerald-400
      const dotSize = Math.max(0.5, 2 / camera.zoom);
      
      data.citizens.forEach((citizen: any) => {
        // Use exact coordinates
        const cX = citizen.coordinates?.x ?? 0;
        const cY = citizen.coordinates?.y ?? 0;
        
        ctx.beginPath();
        ctx.arc(cX, cY, dotSize, 0, Math.PI * 2);
        ctx.fill();
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
      renderWorld(ctx, canvas.width, canvas.height, snapshot);
      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [snapshot, camera]);

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
    
    // Simple hit detection (reverse order of rendering so top gets clicked)
    // 1. Check Citizens/Clusters (if applicable)
    if (camera.zoom >= 2.0) {
      const clickDist = 5 / camera.zoom;
      for (const c of snapshot.citizens) {
        const cX = (c as any).coordinates?.x ?? 0;
        const cY = (c as any).coordinates?.y ?? 0;
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
