const BASE_URL = '/api/v1/system';

export interface EngineStatus {
  status: 'Running' | 'Paused' | 'Stopped' | 'Ready' | 'Error';
  details: string;
}

export interface SystemStatus {
  engines: {
    time: EngineStatus;
    event: EngineStatus;
    world: EngineStatus;
    environment: EngineStatus;
    resource: EngineStatus;
    spatial: EngineStatus;
    citizen: EngineStatus;
  };
}

export interface SystemVerification {
  seed: number;
  hash: string;
  status: string;
  counts: {
    regions: number;
    resources: number;
    environmentProfiles: number;
  };
}

export const systemApi = {
  getStatus: async (): Promise<SystemStatus> => {
    const res = await fetch(`${BASE_URL}/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  },

  getVerification: async (): Promise<SystemVerification | null> => {
    const res = await fetch(`${BASE_URL}/verification`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch system verification');
    return res.json();
  }
};
