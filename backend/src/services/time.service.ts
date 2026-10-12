import { TimeEngine } from '@genesis/engine';

class TimeService {
  private static instance: TimeService;
  public engine: TimeEngine;

  private constructor() {
    this.engine = new TimeEngine(60);
  }

  public static getInstance(): TimeService {
    if (!TimeService.instance) {
      TimeService.instance = new TimeService();
    }
    return TimeService.instance;
  }
}

export const timeService = TimeService.getInstance();
