import { Action, ActionResult, DecisionContext } from '@genesis/shared';

/**
 * Interface representing the execution boundary for AI decisions.
 * This separates decision making from world modification.
 */
export interface IActionExecutor {
  execute(action: Action, context: DecisionContext): ActionResult;
}

/**
 * A basic ActionExecutor stub for Phase 4.1.
 * Future phases will hook this up to the Movement Engine, Economy Engine, etc.
 */
export class ActionExecutor implements IActionExecutor {
  public execute(action: Action, context: DecisionContext): ActionResult {
    // Phase 4.1: Decisions are evaluated but actual complex execution is deferred to Phase 4.5.
    // For now, we simulate basic success or deferral.
    // E.g., we cannot "EAT" because there's no Food/Economy Engine yet, so we'll just return SUCCESS
    // for testing purposes or DEFERRED to signify it's a future system.
    
    // As a placeholder, we'll return SUCCESS so tests can verify the pipeline.
    return ActionResult.SUCCESS;
  }
}
