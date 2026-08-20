import { ActionState, ActionType, MovementState } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { MovementService } from '../citizen/services/MovementService';

export class MovementActionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager,
    private movementService: MovementService
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return [
      ActionType.GO_TO_WORK,
      ActionType.GO_HOME,
      ActionType.GO_TO_SCHOOL,
      ActionType.GO_TO_FOOD_SOURCE,
      ActionType.GO_TO_WATER_SOURCE
    ].includes(actionType as ActionType);
  }

  public start(context: ActionExecutorContext): void {
    const { action, citizen } = context;
    
    if (!action.target || !action.target.id) {
      this.lifecycleManager.transition(action, ActionState.FAILED, 'No target destination specified');
      return;
    }

    try {
      this.lifecycleManager.transition(action, ActionState.IN_PROGRESS);
      const route = this.movementService.requestMovement(citizen.id, action.target.id);
      
      if (route.status === 'COMPLETED') {
        // Already at destination
        this.lifecycleManager.transition(action, ActionState.COMPLETED);
      } else {
        // Wait for movement to finish
        action.routeId = route.id;
      }
    } catch (error: any) {
      this.lifecycleManager.transition(action, ActionState.FAILED, error.message || 'Failed to request movement');
    }
  }

  public tick(context: ActionExecutorContext): void {
    const { action, citizen } = context;
    
    if (action.state !== ActionState.IN_PROGRESS) return;

    // Check if movement is completed. The MovementService handles the arrival event and updates Citizen state.
    if (citizen.movementState === MovementState.IDLE) {
      if (action.routeId && (!citizen.activeRoute || citizen.activeRoute.status === 'COMPLETED' || citizen.activeRoute.status === 'CANCELLED')) {
         if (!citizen.activeRoute || citizen.activeRoute.status === 'COMPLETED' || citizen.locationId === action.target?.id) {
           this.lifecycleManager.transition(action, ActionState.COMPLETED);
         } else {
           this.lifecycleManager.transition(action, ActionState.FAILED, 'Route was cancelled or interrupted');
         }
      }
    }
  }
}
