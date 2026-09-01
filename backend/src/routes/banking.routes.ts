import { FastifyPluginAsync } from 'fastify';
import * as bankingController from '../controllers/banking.controller';

export const bankingRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/banks', bankingController.getBanks);
    fastify.post('/banks', bankingController.createBank);
    fastify.get('/banks/:bankId', bankingController.getBank);
    fastify.get('/accounts/:accountId', bankingController.getAccount);
    fastify.post('/accounts/:accountId/deposit', bankingController.deposit);
    fastify.post('/accounts/:accountId/withdraw', bankingController.withdraw);
    fastify.post('/loans/apply', bankingController.applyForLoan);
    fastify.get('/loans', bankingController.getLoans);
    fastify.get('/loans/:loanId', bankingController.getLoan);
};
