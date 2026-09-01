import { BankingEngine } from '@genesis/engine';
import { eventService } from './event.service';
import { timeService } from './time.service';
import { bankingRepository } from '../repositories/BankingRepository';

class BankingService {
    public engine: BankingEngine;

    constructor() {
        this.engine = new BankingEngine(eventService.scheduler, timeService.engine, bankingRepository);
    }

    public initialize() {
        this.engine.initialize();
    }
}

export const bankingService = new BankingService();
