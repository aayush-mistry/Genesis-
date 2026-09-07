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
    
    // Background
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    // Apply camera transform
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Helper for Debug Labels
    const drawDebugLabel = (text: string, x: number, y: number, color: string, yOffset: number) => {
      ctx.font = `bold ${10 / camera.zoom}px Inter`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + (15 / camera.zoom), y + (yOffset / camera.zoom));
    };

    // 1. Draw Regions (Background)
    data.regions.forEach(region => {
      ctx.fillStyle = 'rgba(40, 44, 52, 0.8)'; // Darker slate
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.lineWidth = 2 / camera.zoom;
      
      // We assume region coordinate is center, drawing a large rect
      const rx = region.coordinates.x - 500;
      const ry = region.coordinates.y - 500;
      ctx.fillRect(rx, ry, 1000, 1000);
      ctx.strokeRect(rx, ry, 1000, 1000);
      
      // Region Label
      if (camera.zoom < 2) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${16 / camera.zoom}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(region.name, region.coordinates.x, region.coordinates.y - 450);
      }
    });

    // 2. Draw Resources
    data.resources.forEach(resource => {
      ctx.fillStyle = (resource.category as string) === 'WATER' ? 'rgba(56, 189, 248, 0.4)' : 
                      (resource.category as string) === 'VEGETATION' ? 'rgba(74, 222, 128, 0.4)' : 
                      'rgba(250, 204, 21, 0.4)';
      ctx.beginPath();
      ctx.arc(resource.coordinates.x, resource.coordinates.y, resource.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Draw Cities & Districts
    data.districts.forEach(district => {
      ctx.fillStyle = district.type === 'RESIDENTIAL' ? 'rgba(99, 102, 241, 0.1)' :
                      district.type === 'COMMERCIAL' ? 'rgba(236, 72, 153, 0.1)' :
                      'rgba(245, 158, 11, 0.1)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([5, 5]); // Dashed line to distinguish overlapping areas
      ctx.lineWidth = 2 / camera.zoom;
      
      const dx = district.coordinates.x - district.area / 2;
      const dy = district.coordinates.y - district.area / 2;
      ctx.fillRect(dx, dy, district.area, district.area);
      ctx.strokeRect(dx, dy, district.area, district.area);
      ctx.setLineDash([]); // Reset dash
      
      // Diagnostic Overlay
      drawDebugLabel(`[DISTRICT] ${district.name}`, district.coordinates.x, district.coordinates.y, '#ec4899', -30);
    });

    // 4. Draw Buildings
    data.buildings.forEach((building, index) => {
      ctx.fillStyle = building.type === 'HOUSE' || building.type === 'APARTMENT' ? 'rgba(99, 102, 241, 0.8)' : // Indigo
                      building.type === 'FACTORY' ? 'rgba(245, 158, 11, 0.8)' : // Amber
                      building.type === 'STORE' ? 'rgba(236, 72, 153, 0.8)' : // Pink
                      'rgba(148, 163, 184, 0.8)'; // Slate
                      
      // Buildings are drawn as small squares at their coords
      // Apply a tiny visual offset based on index ONLY to allow distinct clicking if they share EXACT same coordinate,
      // but keep them mostly clustered.
      // Alternatively, draw them as concentric shapes. We will draw them at their exact coords, but with different sizes so they don't hide each other perfectly.
      const baseSize = building.capacity > 50 ? 12 : 8;
      const size = baseSize + (index % 3) * 4; // Vary size slightly if stacked
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.fillRect(building.coordinates.x - size/2, building.coordinates.y - size/2, size, size);
      ctx.strokeRect(building.coordinates.x - size/2, building.coordinates.y - size/2, size, size);
      
      // Subtle glow for active buildings
      if (building.status === 'ACTIVE') {
        ctx.shadowBlur = 4;
        ctx.shadowColor = ctx.fillStyle;
      }
      ctx.shadowBlur = 0;
      
      // Diagnostic Overlay
      drawDebugLabel(`[BUILDING] ${building.name}`, building.coordinates.x, building.coordinates.y, '#f59e0b', -15 + (index * 12));
    });

    // 5. Draw Citizens using Exact Coordinate Clustering
    // Group citizens by their exact resolved coordinate
    const citizenClusters = new Map<string, { x: number, y: number, count: number, employed: number, unemployed: number }>();
    
    data.citizens.forEach(citizen => {
      let cx = 0;
      let cy = 0;
      
      if (citizen.locationId) {
         const b = data.buildings.find(b => b.id === citizen.locationId);
         if (b) {
           cx = b.coordinates.x;
           cy = b.coordinates.y;
         } else {
           const d = data.districts.find(d => d.id === citizen.locationId);
           if (d) {
             cx = d.coordinates.x;
             cy = d.coordinates.y;
           }
         }
      }
      
      const key = `${cx},${cy}`;
      if (!citizenClusters.has(key)) {
        citizenClusters.set(key, { x: cx, y: cy, count: 0, employed: 0, unemployed: 0 });
      }
      
      const cluster = citizenClusters.get(key)!;
      cluster.count++;
      if (citizen.employmentStatus === 'EMPLOYED') {
        cluster.employed++;
      } else {
        cluster.unemployed++;
      }
    });

    // Draw the clusters
    citizenClusters.forEach(cluster => {
      // Circle radius scales logarithmically with population
      const radius = Math.max(4, 4 + Math.log10(cluster.count) * 6) / camera.zoom;
      
      // Draw cluster background
      ctx.fillStyle = 'rgba(16, 185, 129, 0.6)'; // Emerald green for population
      ctx.beginPath();
      ctx.arc(cluster.x, cluster.y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.stroke();

      // Text label for cluster size
      if (camera.zoom < 5) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${10 / camera.zoom}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cluster.count.toString(), cluster.x, cluster.y - radius - (4 / camera.zoom));
      }
      
      // Diagnostic Overlay
      drawDebugLabel(`[POPULATION] ${cluster.count} Citizens`, cluster.x, cluster.y, '#10b981', 15);
    });

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    
    const render = () => {
      // In a real app we'd handle resize observer. Using fixed for now or updating on effect.
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
    // 1. Check Buildings
    for (const b of snapshot.buildings) {
      const size = b.capacity > 50 ? 12 : 8;
      if (worldX >= b.coordinates.x - size/2 && worldX <= b.coordinates.x + size/2 &&
          worldY >= b.coordinates.y - size/2 && worldY <= b.coordinates.y + size/2) {
        setSelection({ type: 'building', id: b.id, data: b });
        return;
      }
    }
    
    // 2. Check Resources
    for (const r of snapshot.resources) {
      const dist = Math.sqrt(Math.pow(worldX - r.coordinates.x, 2) + Math.pow(worldY - r.coordinates.y, 2));
      if (dist <= r.radius) {
        setSelection({ type: 'resource', id: r.id, data: r });
        return;
      }
    }

    // 3. Check Districts
    for (const d of snapshot.districts) {
      const dx = d.coordinates.x - d.area / 2;
      const dy = d.coordinates.y - d.area / 2;
      if (worldX >= dx && worldX <= dx + d.area &&
          worldY >= dy && worldY <= dy + d.area) {
        setSelection({ type: 'district', id: d.id, data: d });
        return;
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
