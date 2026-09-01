import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankingApi } from '../../api/banking';
import { useState } from 'react';

export function BankingDashboard() {
  const queryClient = useQueryClient();
  const { data: banks, isLoading } = useQuery({ queryKey: ['banks'], queryFn: bankingApi.getBanks });
  const { data: loans } = useQuery({ queryKey: ['loans'], queryFn: bankingApi.getLoans });

  const [newBankName, setNewBankName] = useState('');
  const [newBankCapital, setNewBankCapital] = useState(1000000);

  const createBankMutation = useMutation({
    mutationFn: () => bankingApi.createBank(newBankName, newBankCapital),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      setNewBankName('');
    }
  });

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-[#121212] border border-[#222] rounded-lg p-4 flex items-center justify-between shadow-lg">
        <h2 className="text-white font-bold tracking-widest uppercase">Banking Engine</h2>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#121212] border border-[#222] rounded-lg p-4">
            <h3 className="text-sm text-[#888] font-bold uppercase tracking-widest mb-4">Available Banks</h3>
            {isLoading ? <p>Loading...</p> : banks?.map((bank: any) => (
                <div key={bank.id} className="mb-4 p-3 border border-[#333] rounded bg-[#1a1a1a]">
                    <div className="text-white font-bold">{bank.name}</div>
                    <div className="text-xs text-[#888]">Capital: {bank.capital}</div>
                    <div className="text-xs text-[#888]">Reserves: {bank.reserves}</div>
                    <div className="text-xs text-[#888]">Lending Capacity: {bank.lendingCapacity}</div>
                    <div className="text-xs text-[#888]">Active Loans: {bank.totalLoans}</div>
                    <div className="text-xs text-[#888]">Total Deposits: {bank.totalDeposits}</div>
                </div>
            ))}

            <div className="mt-4 pt-4 border-t border-[#333]">
                <h4 className="text-xs font-bold uppercase mb-2 text-[#888]">Create Bank</h4>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Bank Name" 
                        value={newBankName} 
                        onChange={(e) => setNewBankName(e.target.value)}
                        className="bg-[#1a1a1a] border border-[#333] text-white rounded px-2 py-1 flex-1 text-sm"
                    />
                    <input 
                        type="number" 
                        value={newBankCapital} 
                        onChange={(e) => setNewBankCapital(Number(e.target.value))}
                        className="bg-[#1a1a1a] border border-[#333] text-white rounded px-2 py-1 w-24 text-sm"
                    />
                    <button 
                        onClick={() => createBankMutation.mutate()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>

        <div className="bg-[#121212] border border-[#222] rounded-lg p-4">
            <h3 className="text-sm text-[#888] font-bold uppercase tracking-widest mb-4">Active Loans Overview</h3>
            <div className="max-h-96 overflow-y-auto">
                {loans?.length === 0 && <p className="text-sm text-[#555]">No active loans found in the system.</p>}
                {loans?.map((loan: any) => (
                    <div key={loan.id} className="mb-2 p-2 border border-[#333] rounded bg-[#1a1a1a] flex justify-between text-sm">
                        <div>
                            <span className="text-white font-bold">{loan.loanType}</span> 
                            <span className={`ml-2 text-xs px-1 rounded ${loan.status === 'ACTIVE' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                                {loan.status}
                            </span>
                            <div className="text-[#888] text-xs">Bank ID: {loan.bankId.substring(0,8)}...</div>
                        </div>
                        <div className="text-right">
                            <div className="text-white">Principal: {loan.principal}</div>
                            <div className="text-[#888] text-xs">EMI: {loan.monthlyEmi}</div>
                            <div className="text-[#888] text-xs">Remaining: {loan.remainingPrincipal}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}
