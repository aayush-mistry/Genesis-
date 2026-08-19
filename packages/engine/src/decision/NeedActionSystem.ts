import { CandidateActionSet, DecisionContext, ActionType } from '@genesis/shared';
import { NeedAnalyzer } from './NeedAnalyzer';
import { CandidateGenerator } from './CandidateGenerator';
import { EligibilityFilter } from './EligibilityFilter';

export class NeedActionSystem {
  private analyzer: NeedAnalyzer;
  private generator: CandidateGenerator;
  private filter: EligibilityFilter;

  constructor(
    analyzer: NeedAnalyzer = new NeedAnalyzer(),
    generator: CandidateGenerator = new CandidateGenerator(),
    filter: EligibilityFilter = new EligibilityFilter()
  ) {
    this.analyzer = analyzer;
    this.generator = generator;
    this.filter = filter;
  }

  /**
   * Generates a complete CandidateActionSet from the DecisionContext.
   */
  public generateCandidateActions(context: DecisionContext): CandidateActionSet {
    // 1. Analyze Needs
    const needStates = this.analyzer.analyzeNeeds(context.vitalState);

    // 2. Generate raw candidates
    const rawCandidates = this.generator.generateCandidates(context, needStates);

    // 3. Filter and deduplicate
    let validCandidates = this.filter.filter(rawCandidates, context);

    // 4. IDLE fallback if nothing else exists
    if (validCandidates.length === 0) {
      validCandidates.push({
        type: ActionType.IDLE,
        source: 'FALLBACK',
        reason: 'No valid candidate actions generated'
      });
    }

    return {
      citizenId: context.citizenId,
      timestamp: context.simulationTime,
      triggeredNeeds: needStates,
      candidates: validCandidates
    };
  }
}
