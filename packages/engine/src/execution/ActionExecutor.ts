import { ActionInstance, ActionState, CandidateAction, Citizen } from '@genesis/shared';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { BaseActionExecutor } from './BaseActionExecutor';
import { MovementActionExecutor } from './MovementActionExecutor';
import { NeedActionExecutor } from './NeedActionExecutor';
import { RoutineActionExecutor } from './RoutineActionExecutor';
import { ResourceInteractionExecutor } from './ResourceInteractionExecutor';
import { PurchaseActionExecutor } from './PurchaseActionExecutor';
import { ConsumeActionExecutor } from './ConsumeActionExecutor';
import { FailureRecoveryManager } from './FailureRecoveryManager';
import { MarketEngine } from '../market/MarketEngine';
import { TimeEngine } from '../time/TimeEngine';
import { MovementService } from '../citizen/services/MovementService';
import { NeedsService } from '../citizen/services/NeedsService';
import { EventScheduler } from '../events/EventScheduler';
import { randomUUID } from 'crypto';

export class ActionExecutor {
  private lifecycleManager: ActionLifecycleManager;
  private failureRecoveryManager: FailureRecoveryManager;
  private executors: BaseActionExecutor[] = [];

  constructor(
    private timeEngine: TimeEngine,
    private eventScheduler: EventScheduler,
    private movementService: MovementService,
    needsService: NeedsService
  ) {
    this.lifecycleManager = new ActionLifecycleManager(eventScheduler, timeEngine);
    this.failureRecoveryManager = new FailureRecoveryManager(eventScheduler, timeEngine);
    
    // Register executors
    this.executors.push(
      new MovementActionExecutor(this.lifecycleManager, movementService),
      new NeedActionExecutor(this.lifecycleManager, needsService),
      new RoutineActionExecutor(this.lifecycleManager),
      new ResourceInteractionExecutor(this.lifecycleManager)
    );
  }

  public setMarketEngine(
    marketEngine: MarketEngine,
    storeRanker: import('../decision/scoring/StoreRanker').StoreRanker,
    spatialQueryService: import('../spatial/SpatialQueryService').SpatialQueryService
  ): void {
    this.executors.push(
      new PurchaseActionExecutor(this.lifecycleManager, marketEngine, this.movementService, storeRanker, spatialQueryService)
    );
  }

  public setConsumptionEngine(consumptionEngine: import('../consumption/ConsumptionEngine').ConsumptionEngine): void {
    this.executors.push(
      new ConsumeActionExecutor(this.lifecycleManager, consumptionEngine)
    );
  }

  /**
   * Translates a CandidateAction into an ActionInstance and starts execution.
   */
  public executeAction(citizen: Citizen, candidateAction: CandidateAction): ActionInstance {
    // Cancel or complete any existing action
    if (citizen.currentAction) {
      if (citizen.currentAction.state === ActionState.IN_PROGRESS || citizen.currentAction.state === ActionState.STARTED || citizen.currentAction.state === ActionState.PENDING) {
         this.lifecycleManager.transition(citizen.currentAction, ActionState.CANCELLED, 'Interrupted by new action');
      }
    }

    const actionInstance: ActionInstance = {
      actionId: randomUUID(),
      citizenId: citizen.id,
      actionType: candidateAction.type,
      state: ActionState.PENDING,
      startedAt: this.timeEngine.getCurrentTime(),
      target: candidateAction.target,
      source: candidateAction.source,
      reason: candidateAction.reason,
      metadata: candidateAction.metadata
    };

    citizen.currentAction = actionInstance;
    
    // Start it
    this.lifecycleManager.transition(actionInstance, ActionState.STARTED);
    
    const executor = this.getExecutor(actionInstance.actionType);
    if (!executor) {
      this.lifecycleManager.transition(actionInstance, ActionState.FAILED, 'No executor found for action type');
      this.failureRecoveryManager.handleFailure(citizen, actionInstance);
      return actionInstance;
    }

    executor.start({
      citizen,
      action: actionInstance,
      currentTime: this.timeEngine.getCurrentTime()
    });

    return actionInstance;
  }

  /**
   * Ticks the current action to advance its state.
   */
  public tick(citizen: Citizen): void {
    if (!citizen.currentAction) return;

    const action = citizen.currentAction;
    
    if (action.state === ActionState.FAILED) {
      this.failureRecoveryManager.handleFailure(citizen, action);
      // Let the failure recovery handle it, usually by triggering a new decision
      return;
    }

    if (action.state === ActionState.COMPLETED || action.state === ActionState.CANCELLED) {
      // Finished actions remain in the citizen's currentAction until a new decision overwrites them.
      return;
    }

    if (action.state === ActionState.IN_PROGRESS) {
      const executor = this.getExecutor(action.actionType);
      if (executor) {
        executor.tick({
          citizen,
          action,
          currentTime: this.timeEngine.getCurrentTime()
        });
      }
    }
  }

  private getExecutor(actionType: string): BaseActionExecutor | undefined {
    return this.executors.find(e => e.canHandle(actionType));
  }
}
