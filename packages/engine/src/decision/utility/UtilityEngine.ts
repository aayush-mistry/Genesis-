import { CandidateActionSet, DecisionResult, RankedAction, UtilityBreakdown, CandidateAction, ActionType } from '@genesis/shared';
import { NeedUtilityEvaluator } from './evaluators/NeedUtilityEvaluator';
import { ScheduleUtilityEvaluator } from './evaluators/ScheduleUtilityEvaluator';
import { TravelUtilityEvaluator } from './evaluators/TravelUtilityEvaluator';
import { SafetyUtilityEvaluator } from './evaluators/SafetyUtilityEvaluator';
import { ResourceUtilityEvaluator } from './evaluators/ResourceUtilityEvaluator';
import { HardConstraintFilter } from './evaluators/HardConstraintFilter';
import { EnergyUtilityEvaluator } from './evaluators/EnergyUtilityEvaluator';
import { DurationUtilityEvaluator } from './evaluators/DurationUtilityEvaluator';
import { EnvironmentUtilityEvaluator } from './evaluators/EnvironmentUtilityEvaluator';
import { JobUtilityEvaluator } from './evaluators/JobUtilityEvaluator';
import { PersonalityUtilityEvaluator } from './evaluators/PersonalityUtilityEvaluator';
import { TransportationUtilityEvaluator } from './evaluators/TransportationUtilityEvaluator';

export class UtilityEngine {
  private needEvaluator = new NeedUtilityEvaluator();
  private scheduleEvaluator = new ScheduleUtilityEvaluator();
  private travelEvaluator = new TravelUtilityEvaluator();
  private safetyEvaluator = new SafetyUtilityEvaluator();
  private resourceEvaluator = new ResourceUtilityEvaluator();
  
  private hardConstraintFilter = new HardConstraintFilter();
  private energyEvaluator = new EnergyUtilityEvaluator();
  private durationEvaluator = new DurationUtilityEvaluator();
  private environmentEvaluator = new EnvironmentUtilityEvaluator();
  private jobEvaluator = new JobUtilityEvaluator();
  private personalityEvaluator = new PersonalityUtilityEvaluator();
  private transportationEvaluator = new TransportationUtilityEvaluator();

  /**
   * Evaluates a set of candidate actions, assigns a utility score to each, 
   * and ranks them to produce a final DecisionResult.
   */
  public evaluate(candidateSet: CandidateActionSet, context: any): DecisionResult {
    const validCandidates = candidateSet.candidates.filter(action => 
      this.hardConstraintFilter.isValid(action, context)
    );

    const rankedActions: RankedAction[] = validCandidates.map(action => {
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

    let selectedAction = rankedActions.length > 0 ? rankedActions[0].action : candidateSet.candidates[0];
    if (rankedActions.length === 0) {
      // Fallback to IDLE if no valid actions
      selectedAction = {
        type: ActionType.IDLE,
        source: 'FALLBACK',
        reason: 'No valid candidate actions available'
      } as CandidateAction;
    }

    return {
      citizenId: candidateSet.citizenId,
      timestamp: candidateSet.timestamp,
      selectedAction,
      rankedActions
    };
  }

  private calculateBreakdown(action: CandidateAction, context: any): UtilityBreakdown {
    const needUrgency = this.needEvaluator.evaluate(action, context);
    const schedule = this.scheduleEvaluator.evaluate(action, context);
    const travel = this.travelEvaluator.evaluate(action, context);
    const safety = this.safetyEvaluator.evaluate(action, context);
    const resourceAvailability = this.resourceEvaluator.evaluate(action, context);
    
    const energy = this.energyEvaluator.evaluate(action, context);
    const duration = this.durationEvaluator.evaluate(action, context);
    const environment = this.environmentEvaluator.evaluate(action, context);
    const job = this.jobEvaluator.evaluate(action, context);
    const personality = this.personalityEvaluator.evaluate(action, context);
    const transportation = this.transportationEvaluator.evaluate(action, context);

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
