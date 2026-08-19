import { ActionType, DecisionContext, DecisionRecord, DecisionTriggerType, CandidateActionSet, DecisionResult, ActionResult } from '@genesis/shared';
import { UtilityEngine } from './utility/UtilityEngine';

/**
 * The core AI Decision Engine framework.
 * For Phase 4.4, it orchestrates the UtilityEngine to produce a DecisionResult.
 * Action execution is deferred to Phase 4.5.
 */
export class DecisionEngine {
  private utilityEngine: UtilityEngine;
  
  // History storage: Map of citizenId to a bounded list of DecisionRecords.
  private history: Map<string, DecisionRecord[]> = new Map();
  private readonly MAX_HISTORY_PER_CITIZEN = 50;

  constructor(
    utilityEngine: UtilityEngine = new UtilityEngine()
  ) {
    this.utilityEngine = utilityEngine;
  }

  /**
   * Main entrypoint for a citizen to make a decision from a set of candidates.
   * Does NOT execute the action. Returns the structured DecisionResult.
   */
  public requestDecision(
    context: DecisionContext,
    candidateSet: CandidateActionSet,
    trigger: DecisionTriggerType
  ): DecisionResult {
    
    // Evaluate and rank candidates using Phase 4.4 UtilityEngine
    const result = this.utilityEngine.evaluate(candidateSet, context);

    // Add trigger context to reasoning
    result.reasoning = {
      trigger,
      generatedAt: new Date()
    };

    // Record the history
    this.recordDecision(context.citizenId, result, trigger);

    return result;
  }

  /**
   * Retrieves the bounded decision history for a citizen.
   */
  public getHistory(citizenId: string): DecisionRecord[] {
    return this.history.get(citizenId) || [];
  }

  /**
   * Appends to bounded history.
   */
  private recordDecision(
    citizenId: string, 
    result: DecisionResult, 
    trigger: DecisionTriggerType
  ): void {
    let citizenHistory = this.history.get(citizenId);
    if (!citizenHistory) {
      citizenHistory = [];
      this.history.set(citizenId, citizenHistory);
    }

    const record: DecisionRecord = {
      citizenId,
      timestamp: result.timestamp,
      candidateActions: result.rankedActions.map(ra => ra.action.type),
      scores: result.rankedActions.reduce((acc, ra) => {
        acc[ra.action.type] = ra.score;
        return acc;
      }, {} as Record<ActionType, number>),
      selectedAction: result.selectedAction.type,
      trigger,
      result: ActionResult.DEFERRED // Action execution happens in Phase 4.5
    };

    citizenHistory.push(record);

    if (citizenHistory.length > this.MAX_HISTORY_PER_CITIZEN) {
      citizenHistory.shift();
    }
  }
}
