export const UtilityWeights = {
  // Needs
  CRITICAL_NEED_MULTIPLIER: 2.5,
  HIGH_NEED_MULTIPLIER: 1.5,
  MODERATE_NEED_MULTIPLIER: 1.0,
  LOW_NEED_MULTIPLIER: 0.5,
  VERY_LOW_NEED_MULTIPLIER: 0.1,
  
  // Schedule
  SCHEDULE_ACTIVE_BONUS: 40,
  SCHEDULE_UPCOMING_BONUS: 20, // Activity starts within an hour
  
  // Travel & Distance
  DISTANCE_PENALTY_PER_UNIT: -0.5,
  MAX_DISTANCE_PENALTY: -40,
  
  // Safety
  CRITICAL_HEALTH_BONUS: 80,
  
  // Neutral fallbacks for unimplemented features
  NEUTRAL_CONTRIBUTION: 0,
};
