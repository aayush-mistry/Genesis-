import { create } from 'zustand';
import { SpatialSnapshot, CameraState } from '../types/spatial.types';
import { spatialApi } from '../api/spatial.api';

interface EntitySelection {
  type: 'world' | 'region' | 'city' | 'district' | 'building' | 'workplace' | 'resource' | 'citizen' | 'terrain';
  id: string;
  data: any;
}

interface SpatialState {
  snapshot: SpatialSnapshot | null;
  dynamicState: import('../types/spatial.types').DynamicSpatialState | null;
  liveTime: any | null;
  liveSimulationState: 'Running' | 'Paused' | 'Stopped' | 'Reset';
  liveSpeed: number;
  liveEvents: any[];
  currentTickId: number;
  isLoading: boolean;
  error: string | null;
  camera: CameraState;
  selection: EntitySelection | null;
  
  fetchSnapshot: () => Promise<void>;
  initLiveSimulation: () => void;
  stopLiveSimulation: () => void;
  setCamera: (camera: Partial<CameraState>) => void;
  setSelection: (selection: EntitySelection | null) => void;
  isFocused: boolean;
  toggleFocus: () => void;
  resetCamera: () => void;
}

const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  zoom: 1
};

let eventSource: EventSource | null = null;

export const useSpatialStore = create<SpatialState>((set, get) => ({
  snapshot: null,
  dynamicState: null,
  liveTime: null,
  liveSimulationState: 'Stopped',
  liveSpeed: 1,
  liveEvents: [],
  currentTickId: -1,
  isLoading: true,
  error: null,
  camera: { ...DEFAULT_CAMERA },
  selection: null,
  isFocused: false,

  toggleFocus: () => set((state) => ({ isFocused: !state.isFocused })),

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

  initLiveSimulation: () => {
    if (eventSource) return;

    eventSource = new EventSource('/api/v1/simulation/live');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          console.error('SSE Error:', data.error);
          return;
        }

        const state = get();
        if (data.tickId !== undefined && data.tickId <= state.currentTickId) {
          // Reject stale update
          return;
        }

        set({
          currentTickId: data.tickId,
          liveTime: data.time,
          liveSimulationState: data.state,
          liveSpeed: data.speed,
          dynamicState: data.dynamicData,
          liveEvents: data.dynamicData.events || []
        });

      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error', err);
      eventSource?.close();
      eventSource = null;
      // Auto reconnect after 5 seconds
      setTimeout(() => get().initLiveSimulation(), 5000);
    };
  },

  stopLiveSimulation: () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  },

  setCamera: (cameraUpdate) => set((state) => ({
    camera: { ...state.camera, ...cameraUpdate }
  })),

  setSelection: (selection) => set({ selection, isFocused: false }),

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
