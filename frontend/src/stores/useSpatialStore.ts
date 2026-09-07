import { create } from 'zustand';
import { SpatialSnapshot, CameraState } from '../types/spatial.types';
import { spatialApi } from '../api/spatial.api';

interface EntitySelection {
  type: 'world' | 'region' | 'city' | 'district' | 'building' | 'workplace' | 'resource' | 'citizen';
  id: string;
  data: any;
}

interface SpatialState {
  snapshot: SpatialSnapshot | null;
  isLoading: boolean;
  error: string | null;
  camera: CameraState;
  selection: EntitySelection | null;
  
  fetchSnapshot: () => Promise<void>;
  setCamera: (camera: Partial<CameraState>) => void;
  setSelection: (selection: EntitySelection | null) => void;
  resetCamera: () => void;
}

const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  zoom: 1
};

export const useSpatialStore = create<SpatialState>((set) => ({
  snapshot: null,
  isLoading: true,
  error: null,
  camera: { ...DEFAULT_CAMERA },
  selection: null,

  fetchSnapshot: async () => {
    set({ isLoading: true, error: null });
    try {
      const snapshot = await spatialApi.getSnapshot();
      let camera = { ...DEFAULT_CAMERA };
      
      if (snapshot && snapshot.regions.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        snapshot.regions.forEach((r: any) => {
          const rx = r.coordinates.x;
          const ry = r.coordinates.y;
          // Assuming region renders as 1000x1000 square centered at rx, ry
          minX = Math.min(minX, rx - 500);
          minY = Math.min(minY, ry - 500);
          maxX = Math.max(maxX, rx + 500);
          maxY = Math.max(maxY, ry + 500);
        });
        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = minX + width / 2;
        const centerY = minY + height / 2;
        
        // Rough estimate of zoom to fit a typical 1080p screen
        // In a real app we'd use the actual canvas dimensions
        const zoom = Math.min(1000 / (width || 1000), 800 / (height || 1000)) * 0.9;
        
        camera = { x: centerX, y: centerY, zoom: Math.max(0.1, zoom) };
      }
      
      set({ snapshot, isLoading: false, camera });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  setCamera: (cameraUpdate) => set((state) => ({
    camera: { ...state.camera, ...cameraUpdate }
  })),

  setSelection: (selection) => set({ selection }),

  resetCamera: () => set((state) => {
    let camera = { ...DEFAULT_CAMERA };
    if (state.snapshot && state.snapshot.regions.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.snapshot.regions.forEach((r: any) => {
        const rx = r.coordinates.x;
        const ry = r.coordinates.y;
        minX = Math.min(minX, rx - 500);
        minY = Math.min(minY, ry - 500);
        maxX = Math.max(maxX, rx + 500);
        maxY = Math.max(maxY, ry + 500);
      });
      const width = maxX - minX;
      const height = maxY - minY;
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;
      
      const zoom = Math.min(1000 / (width || 1000), 800 / (height || 1000)) * 0.9;
      camera = { x: centerX, y: centerY, zoom: Math.max(0.1, zoom) };
    }
    return { camera };
  })
}));
