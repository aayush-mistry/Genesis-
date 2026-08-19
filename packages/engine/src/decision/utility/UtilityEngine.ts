import { CandidateActionSet, DecisionResult, RankedAction, UtilityBreakdown, CandidateAction } from '@genesis/shared';
import { NeedUtilityEvaluator } from './evaluators/NeedUtilityEvaluator';
import { ScheduleUtilityEvaluator } from './evaluators/ScheduleUtilityEvaluator';
import { TravelUtilityEvaluator } from './evaluators/TravelUtilityEvaluator';
import { SafetyUtilityEvaluator } from './evaluators/SafetyUtilityEvaluator';
import { ResourceUtilityEvaluator } from './evaluators/ResourceUtilityEvaluator';
import { StubEvaluators } from './evaluators/StubEvaluators';

export class UtilityEngine {
  private needEvaluator = new NeedUtilityEvaluator();
  private scheduleEvaluator = new ScheduleUtilityEvaluator();
  private travelEvaluator = new TravelUtilityEvaluator();
  private safetyEvaluator = new SafetyUtilityEvaluator();
  private resourceEvaluator = new ResourceUtilityEvaluator();
  private stubs = new StubEvaluators();

  /**
   * Evaluates a set of candidate actions, assigns a utility score to each, 
   * and ranks them to produce a final DecisionResult.
   */
  public evaluate(candidateSet: CandidateActionSet, context: any): DecisionResult {
    const rankedActions: RankedAction[] = candidateSet.candidates.map(action => {
      const breakdown = this.calculateBreakdown(action, context);
      return {
        action,
        rank: 0, // Assigned later
        score: breakdown.total,
        breakdown
      };
    });

    // Sort descending by score, and apply deterministic tie-breaking
    rankedActions.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      // Tie breaker 1: Action Type alphabet
      if (a.action.type !== b.action.type) {
        return a.action.type.localeCompare(b.action.type);
      }
      // Tie breaker 2: Target ID if exists
      const targetA = a.action.target?.id || '';
      const targetB = b.action.target?.id || '';
      return targetA.localeCompare(targetB);
    });

    // Assign ranks
    rankedActions.forEach((ra, index) => {
      ra.rank = index + 1;
    });

    return {
      citizenId: candidateSet.citizenId,
      timestamp: candidateSet.timestamp,
      selectedAction: rankedActions.length > 0 ? rankedActions[0].action : candidateSet.candidates[0], // fallback
      rankedActions
    };
  }

  private calculateBreakdown(action: CandidateAction, context: any): UtilityBreakdown {
    const needUrgency = this.needEvaluator.evaluate(action, context);
    const schedule = this.scheduleEvaluator.evaluate(action, context);
    const travel = this.travelEvaluator.evaluate(action, context);
    const safety = this.safetyEvaluator.evaluate(action, context);
    const resourceAvailability = this.resourceEvaluator.evaluate(action, context);
    
    // Stubs
    const energy = this.stubs.evaluateEnergy(action, context);
    const duration = this.stubs.evaluateDuration(action, context);
    const environment = this.stubs.evaluateEnvironment(action, context);
    const job = this.stubs.evaluateJob(action, context);
    const personality = this.stubs.evaluatePersonality(action, context);
    const transportation = this.stubs.evaluateTransportation(action, context);

    let total = needUrgency + schedule + travel + safety + resourceAvailability + 
                energy + duration + environment + job + personality + transportation;

    // Normalize to 0-100
    total = Math.max(0, Math.min(100, total));

    // Handle IDLE baseline score if it's the only one or if everything else is 0
    if (action.type === 'IDLE' && total === 0) {
      total = 10;
    }

    return {
      needUrgency,
      schedule,
      safety,
      resourceAvailability,
      travel,
      transportation,
      energy,
      duration,
      environment,
      job,
      personality,
      total
    };
  }
}
