import { DecisionEngine, NeedActionSystem } from '@genesis/engine';

class BackendDecisionService {
  public engine: DecisionEngine;
  public needSystem: NeedActionSystem;

  constructor() {
    this.engine = new DecisionEngine();
    this.needSystem = new NeedActionSystem();
  }

  public initialize() {
    console.log('[AI Decision Engine] Framework initialized');
  }
}

export const decisionService = new BackendDecisionService();
