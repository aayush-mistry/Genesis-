import { 
  Citizen, 
  RoutineType, 
  RoutineActivity, 
  RoutineActivityType, 
  CitizenRoutine,
  SimulationTime 
} from '@genesis/shared';
import { randomUUID } from 'crypto';

export class RoutineEngine {
  /**
   * Generates a routine for a citizen based on their age and employment status.
   */
  public generateRoutine(citizen: Citizen): CitizenRoutine {
    const age = this.calculateAge(citizen);
    let scheduleType = RoutineType.UNEMPLOYED_ADULT;

    if (age < 18) {
      scheduleType = RoutineType.CHILD;
    } else if (age >= 18 && age < 22 && citizen.employmentStatus === 'STUDENT') {
      scheduleType = RoutineType.STUDENT;
    } else if (age >= 75) {
      scheduleType = RoutineType.ELDERLY;
    } else if (citizen.employmentStatus === 'EMPLOYED') {
      scheduleType = RoutineType.ADULT_WORKER;
    } else {
      scheduleType = RoutineType.UNEMPLOYED_ADULT;
    }

    return {
      citizenId: citizen.id,
      scheduleType,
      activities: this.getActivitiesForType(scheduleType, citizen)
    };
  }

  /**
   * Evaluates what the citizen should be doing right now.
   */
  public getCurrentActivity(citizen: Citizen, currentTime: SimulationTime): RoutineActivity | undefined {
    if (!citizen.currentRoutine) {
      return undefined;
    }

    const currentHour = currentTime.hour + (currentTime.minute / 60);

    // Find the activity that spans this hour
    for (const activity of citizen.currentRoutine.activities) {
      if (this.isTimeWithinActivity(currentHour, activity.startTime, activity.endTime)) {
        return activity;
      }
    }

    return undefined;
  }

  private isTimeWithinActivity(currentHour: number, start: number, end: number): boolean {
    if (start <= end) {
      // Normal activity (e.g., 08:00 to 17:00)
      return currentHour >= start && currentHour < end;
    } else {
      // Overnight activity (e.g., 22:00 to 06:00)
      return currentHour >= start || currentHour < end;
    }
  }

  private calculateAge(citizen: Citizen): number {
    // We assume current year minus birth year roughly, or we could pass current time in
    // Since we don't have current time here easily, this is a simplified calculation.
    // However, in Phase 5, Age is usually generated or evaluated at runtime. 
    // Wait, let's just use citizen.birthDate and assume the generation happens with context of current time.
    // For generation, we assume it's initially correct.
    // A better approach is to pass age directly:
    return new Date().getFullYear() - citizen.birthDate.year; // Mocked fallback if needed, but better to pass age
  }

  public generateRoutineWithAge(citizen: Citizen, age: number): CitizenRoutine {
    let scheduleType = RoutineType.UNEMPLOYED_ADULT;

    if (age < 18) {
      scheduleType = RoutineType.STUDENT; // Or CHILD
    } else if (age >= 75) {
      scheduleType = RoutineType.ELDERLY;
    } else if (citizen.employmentStatus === 'EMPLOYED' || citizen.workplaceId !== null) {
      scheduleType = RoutineType.ADULT_WORKER;
    } else {
      scheduleType = RoutineType.UNEMPLOYED_ADULT;
    }

    return {
      citizenId: citizen.id,
      scheduleType,
      activities: this.getActivitiesForType(scheduleType, citizen)
    };
  }

  private getActivitiesForType(type: RoutineType, citizen: Citizen): RoutineActivity[] {
    switch (type) {
      case RoutineType.ADULT_WORKER:
        return this.generateWorkerRoutine(citizen);
      case RoutineType.STUDENT:
      case RoutineType.CHILD:
        return this.generateStudentRoutine(citizen);
      case RoutineType.ELDERLY:
        return this.generateElderlyRoutine();
      case RoutineType.UNEMPLOYED_ADULT:
      default:
        return this.generateUnemployedRoutine();
    }
  }

  private createActivity(type: RoutineActivityType, start: number, end: number, interruptible: boolean, destinationType?: 'HOME' | 'WORKPLACE' | 'SCHOOL' | 'FOOD_SOURCE' | 'RECREATION'): RoutineActivity {
    return {
      id: randomUUID(),
      type,
      startTime: start,
      endTime: end,
      interruptible,
      destinationType
    };
  }

  private generateWorkerRoutine(citizen: Citizen): RoutineActivity[] {
    const workStart = citizen.jobSchedule?.startTime ?? 8;
    const workEnd = citizen.jobSchedule?.endTime ?? 17;

    return [
      this.createActivity(RoutineActivityType.SLEEP, 22.5, 6.5, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 6.5, 7.0, true, 'HOME'), // Breakfast
      this.createActivity(RoutineActivityType.TRAVEL, 7.0, workStart, false, 'WORKPLACE'),
      this.createActivity(RoutineActivityType.WORK, workStart, workEnd, false, 'WORKPLACE'),
      this.createActivity(RoutineActivityType.TRAVEL, workEnd, workEnd + 1.0, false, 'HOME'),
      this.createActivity(RoutineActivityType.EXERCISE, workEnd + 1.0, workEnd + 2.0, true, 'RECREATION'),
      this.createActivity(RoutineActivityType.MEAL, workEnd + 2.0, workEnd + 3.0, true, 'HOME'), // Dinner
      this.createActivity(RoutineActivityType.FREE_TIME, workEnd + 3.0, 22.5, true, 'HOME')
    ];
  }

  private generateStudentRoutine(citizen: Citizen): RoutineActivity[] {
    return [
      this.createActivity(RoutineActivityType.SLEEP, 21.0, 6.5, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 6.5, 7.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.TRAVEL, 7.0, 8.0, false, 'SCHOOL'),
      this.createActivity(RoutineActivityType.STUDY, 8.0, 15.0, false, 'SCHOOL'),
      this.createActivity(RoutineActivityType.TRAVEL, 15.0, 16.0, false, 'HOME'),
      this.createActivity(RoutineActivityType.FREE_TIME, 16.0, 18.0, true, 'RECREATION'),
      this.createActivity(RoutineActivityType.MEAL, 18.0, 19.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.STUDY, 19.0, 20.0, true, 'HOME'), // Homework
      this.createActivity(RoutineActivityType.FREE_TIME, 20.0, 21.0, true, 'HOME')
    ];
  }

  private generateUnemployedRoutine(): RoutineActivity[] {
    return [
      this.createActivity(RoutineActivityType.SLEEP, 23.0, 8.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 8.0, 9.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.FREE_TIME, 9.0, 13.0, true, 'RECREATION'), // Job hunting / walking
      this.createActivity(RoutineActivityType.MEAL, 13.0, 14.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.FREE_TIME, 14.0, 19.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 19.0, 20.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.FREE_TIME, 20.0, 23.0, true, 'HOME')
    ];
  }

  private generateElderlyRoutine(): RoutineActivity[] {
    return [
      this.createActivity(RoutineActivityType.SLEEP, 21.0, 6.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 6.0, 7.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.REST, 7.0, 9.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.EXERCISE, 9.0, 10.0, true, 'RECREATION'), // Light walk
      this.createActivity(RoutineActivityType.FREE_TIME, 10.0, 12.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 12.0, 13.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.REST, 13.0, 16.0, true, 'HOME'), // Nap
      this.createActivity(RoutineActivityType.FREE_TIME, 16.0, 18.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.MEAL, 18.0, 19.0, true, 'HOME'),
      this.createActivity(RoutineActivityType.FREE_TIME, 19.0, 21.0, true, 'HOME')
    ];
  }
}
