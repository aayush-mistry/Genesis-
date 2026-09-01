const API_BASE = '/api/v1';

export const bankingApi = {
    async getBanks() {
        const res = await fetch(`${API_BASE}/banks`);
        if (!res.ok) throw new Error('Failed to fetch banks');
        return res.json();
    },
    async createBank(name: string, capital: number) {
        const res = await fetch(`${API_BASE}/banks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, capital })
        });
        if (!res.ok) throw new Error('Failed to create bank');
        return res.json();
    },
    async getAccount(accountId: string) {
        const res = await fetch(`${API_BASE}/accounts/${accountId}`);
        if (!res.ok) throw new Error('Failed to fetch account');
        return res.json();
    },
    async getLoans() {
        const res = await fetch(`${API_BASE}/loans`);
        if (!res.ok) throw new Error('Failed to fetch loans');
        return res.json();
    },
    async applyForLoan(data: any) {
        const res = await fetch(`${API_BASE}/loans/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to apply for loan');
        return res.json();
    }
};
