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
    
    // Apply camera transform
    // Center of screen
    const centerX = width / 2;
    const centerY = height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

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
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1 / camera.zoom;
      
      const dx = district.coordinates.x - district.area / 2;
      const dy = district.coordinates.y - district.area / 2;
      ctx.fillRect(dx, dy, district.area, district.area);
      ctx.strokeRect(dx, dy, district.area, district.area);
    });

    // 4. Draw Buildings
    data.buildings.forEach(building => {
      ctx.fillStyle = building.type === 'HOUSE' || building.type === 'APARTMENT' ? '#6366f1' : // Indigo
                      building.type === 'FACTORY' ? '#f59e0b' : // Amber
                      building.type === 'STORE' ? '#ec4899' : // Pink
                      '#94a3b8'; // Slate
                      
      // Buildings are drawn as small squares at their coords
      const size = building.capacity > 50 ? 12 : 8;
      ctx.fillRect(building.coordinates.x - size/2, building.coordinates.y - size/2, size, size);
      
      // Subtle glow for active buildings
      if (building.status === 'ACTIVE') {
        ctx.shadowBlur = 4;
        ctx.shadowColor = ctx.fillStyle;
      }
      ctx.shadowBlur = 0;
    });

    // 5. Draw Citizens
    // Only render individual citizens if zoomed in enough to see them well
    if (camera.zoom > 1.5) {
      data.citizens.forEach(citizen => {
        // Resolve location
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

        // Add some noise so they don't all stack perfectly
        // In a real moving simulation this would be exact
        // Use citizen ID to create deterministic noise
        const hash = citizen.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const offsetX = (hash % 20) - 10;
        const offsetY = ((hash * 3) % 20) - 10;

        ctx.fillStyle = citizen.employmentStatus === 'EMPLOYED' ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(cx + offsetX, cy + offsetY, 2, 0, Math.PI * 2);
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

  // Interaction Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    
    setCamera({
      zoom: Math.min(Math.max(0.1, camera.zoom * direction), 10)
    });
  };

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
      onWheel={handleWheel}
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
