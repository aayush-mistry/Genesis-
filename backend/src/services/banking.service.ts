import { BankingEngine } from '@genesis/engine';
import { eventService } from './event.service';
import { timeService } from './time.service';
import { marketService } from './market.service';
import { bankingRepository } from '../repositories/BankingRepository';

class BankingService {
    public engine: BankingEngine;

    constructor() {
        this.engine = new BankingEngine(
            eventService.scheduler,
            timeService.engine,
            bankingRepository,
            marketService.engine
        );
    }

    public async initialize() {
        await this.engine.initialize();
    }
}

export const bankingService = new BankingService();
