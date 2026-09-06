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
      set({ snapshot, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  setCamera: (cameraUpdate) => set((state) => ({
    camera: { ...state.camera, ...cameraUpdate }
  })),

  setSelection: (selection) => set({ selection }),

  resetCamera: () => set({ camera: { ...DEFAULT_CAMERA } })
}));
