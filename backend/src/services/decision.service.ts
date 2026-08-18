import { DecisionEngine } from '@genesis/engine';

class BackendDecisionService {
  public engine: DecisionEngine;

  constructor() {
    this.engine = new DecisionEngine();
  }

  public initialize() {
    console.log('[AI Decision Engine] Framework initialized');
  }
}

export const decisionService = new BackendDecisionService();
