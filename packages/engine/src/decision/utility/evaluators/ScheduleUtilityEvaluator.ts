import { CandidateAction, DecisionContext } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class ScheduleUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const schedule = context.perception?.schedule;
    if (!schedule) return UtilityWeights.NEUTRAL_CONTRIBUTION;

    if (action.source === 'WORK_SCHEDULE' || action.source === 'SCHOOL_SCHEDULE') {
      // If it's the currently active schedule
      if (schedule.currentActivity === 'WORK' && action.source === 'WORK_SCHEDULE') {
        return UtilityWeights.SCHEDULE_ACTIVE_BONUS;
      }
      if (schedule.currentActivity === 'SCHOOL' && action.source === 'SCHOOL_SCHEDULE') {
        return UtilityWeights.SCHEDULE_ACTIVE_BONUS;
      }
      
      // If it's an upcoming schedule, we would check schedule.nextActivity
      if (schedule.nextActivity === 'WORK' && action.source === 'WORK_SCHEDULE') {
        return UtilityWeights.SCHEDULE_UPCOMING_BONUS;
      }
    }

    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
}
