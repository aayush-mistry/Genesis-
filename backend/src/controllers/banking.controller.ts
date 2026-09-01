import { FastifyRequest, FastifyReply } from 'fastify';
import { bankingRepository } from '../repositories/BankingRepository';
import { bankingService } from '../services/banking.service';

export const getBanks = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const banks = await bankingRepository.listBanks();
        return reply.send(banks);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const createBank = async (request: FastifyRequest<{ Body: { name: string, capital: number } }>, reply: FastifyReply) => {
    try {
        const { name, capital } = request.body;
        const bank = await bankingRepository.createBank({ name, capital, reserves: capital, totalDeposits: 0 });
        return reply.send(bank);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const getBank = async (request: FastifyRequest<{ Params: { bankId: string } }>, reply: FastifyReply) => {
    try {
        const bank = await bankingRepository.getBank(request.params.bankId);
        if (!bank) return reply.status(404).send({ error: 'Not found' });
        return reply.send(bank);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const getAccount = async (request: FastifyRequest<{ Params: { accountId: string } }>, reply: FastifyReply) => {
    try {
        const account = await bankingRepository.getAccountById(request.params.accountId);
        if (!account) return reply.status(404).send({ error: 'Not found' });
        return reply.send(account);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const deposit = async (request: FastifyRequest<{ Params: { accountId: string }, Body: { amount: number } }>, reply: FastifyReply) => {
    try {
        const { amount } = request.body;
        await bankingService.engine.deposit(request.params.accountId, amount);
        return reply.send({ success: true });
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const withdraw = async (request: FastifyRequest<{ Params: { accountId: string }, Body: { amount: number } }>, reply: FastifyReply) => {
    try {
        const { amount } = request.body;
        await bankingService.engine.withdraw(request.params.accountId, amount);
        return reply.send({ success: true });
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const applyForLoan = async (request: FastifyRequest<{ Body: { bankId: string, borrowerId: string, loanType: any, requestedAmount: number, requestedTermMonths: number, financials: any } }>, reply: FastifyReply) => {
    try {
        const { bankId, borrowerId, loanType, requestedAmount, requestedTermMonths, financials } = request.body;
        const application = await bankingService.engine.applyForLoan(bankId, borrowerId, loanType, requestedAmount, requestedTermMonths, financials);
        return reply.send(application);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const getLoans = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const loans = await bankingRepository.listActiveLoans();
        return reply.send(loans);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};

export const getLoan = async (request: FastifyRequest<{ Params: { loanId: string } }>, reply: FastifyReply) => {
    try {
        const loan = await bankingRepository.getLoan(request.params.loanId);
        if (!loan) return reply.status(404).send({ error: 'Not found' });
        return reply.send(loan);
    } catch (error: any) {
        return reply.status(500).send({ error: error.message });
    }
};
