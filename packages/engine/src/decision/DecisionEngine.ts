import { Action, ActionType, Decision, DecisionContext, DecisionRecord, DecisionTriggerType } from '@genesis/shared';
import { IDecisionEvaluator, DecisionEvaluator } from './DecisionEvaluator';
import { DecisionSelector, EvaluatedAction } from './DecisionSelector';
import { IActionExecutor, ActionExecutor } from './ActionExecutor';

/**
 * The core AI Decision Engine framework.
 * Orchestrates Perception -> Evaluation -> Scoring -> Selection -> Execution -> Recording.
 */
export class DecisionEngine {
  private evaluator: IDecisionEvaluator;
  private selector: DecisionSelector;
  private executor: IActionExecutor;
  
  // History storage: Map of citizenId to a bounded list of DecisionRecords.
  private history: Map<string, DecisionRecord[]> = new Map();
  private readonly MAX_HISTORY_PER_CITIZEN = 50;

  constructor(
    evaluator: IDecisionEvaluator = new DecisionEvaluator(),
    selector: DecisionSelector = new DecisionSelector(),
    executor: IActionExecutor = new ActionExecutor()
  ) {
    this.evaluator = evaluator;
    this.selector = selector;
    this.executor = executor;
  }

  /**
   * Main entrypoint for a citizen to make a decision.
   * Does NOT load the entire world context; assumes context is already narrowed down.
   */
  public requestDecision(
    citizenId: string,
    context: DecisionContext,
    candidateActions: Action[],
    trigger: DecisionTriggerType
  ): Decision {
    
    // 1. Evaluate candidate actions
    const evaluatedActions: EvaluatedAction[] = candidateActions.map(action => ({
      action,
      score: this.evaluator.evaluate(context, action)
    }));

    // 2. Select the best action
    const bestEvaluated = this.selector.selectBestAction(evaluatedActions, context);

    // 3. Formulate the Decision
    const decision: Decision = {
      action: bestEvaluated.action,
      score: bestEvaluated.score,
      citizenId,
      reasoning: {
        trigger,
        // For basic debugging, record the top candidate scores
        evaluatedScores: evaluatedActions.reduce((acc, ea) => {
          acc[ea.action.type] = ea.score;
          return acc;
        }, {} as Record<string, number>)
      },
      timestamp: context.simulationTime
    };

    // 4. Delegate to the Executor to try and perform the action
    const result = this.executor.execute(decision.action, context);

    // 5. Record the history
    this.recordDecision(citizenId, decision, evaluatedActions, trigger, result);

    return decision;
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
    decision: Decision, 
    evaluatedActions: EvaluatedAction[],
    trigger: DecisionTriggerType,
    result: any
  ): void {
    let citizenHistory = this.history.get(citizenId);
    if (!citizenHistory) {
      citizenHistory = [];
      this.history.set(citizenId, citizenHistory);
    }

    const record: DecisionRecord = {
      citizenId,
      timestamp: decision.timestamp,
      candidateActions: evaluatedActions.map(ea => ea.action.type),
      scores: evaluatedActions.reduce((acc, ea) => {
        acc[ea.action.type] = ea.score;
        return acc;
      }, {} as Record<ActionType, number>),
      selectedAction: decision.action.type,
      trigger,
      result
    };

    citizenHistory.push(record);

    // Bound the history size to prevent memory leaks
    if (citizenHistory.length > this.MAX_HISTORY_PER_CITIZEN) {
      citizenHistory.shift(); // Remove oldest
    }
  }
}
