import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';

export function EventInjectionPanel() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    delaySeconds: '10',
    priority: 'Normal',
    targetModule: 'System',
    recurrenceInterval: '',
  });

  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['upcoming'] });
      setMessage(`Successfully injected event: ${data.event.id}`);
      setTimeout(() => setMessage(''), 3000);
    },
    onError: () => {
      setMessage('Failed to inject event.');
      setTimeout(() => setMessage(''), 3000);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h2 className="text-3xl font-light text-white tracking-tight">Event <span className="font-semibold text-indigo-400">Injection</span></h2>
        <p className="text-[#888] mt-1">Manually inject custom events into the scheduler queue.</p>
      </div>

      <div className="bg-[#121212] border border-[#222] rounded-2xl p-8 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Event Name</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors" 
                placeholder="e.g. System Backup"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Target Module</label>
              <input 
                required
                type="text" 
                value={formData.targetModule}
                onChange={(e) => setFormData({...formData, targetModule: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors" 
                placeholder="e.g. Storage"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Description</label>
            <textarea 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors min-h-[100px]" 
              placeholder="Description of the event..."
            />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Delay (Seconds)</label>
              <input 
                type="number" 
                min="0"
                value={formData.delaySeconds}
                onChange={(e) => setFormData({...formData, delaySeconds: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Priority</label>
              <select 
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white appearance-none"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-[#888] font-semibold">Recurrence</label>
              <select 
                value={formData.recurrenceInterval}
                onChange={(e) => setFormData({...formData, recurrenceInterval: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white appearance-none"
              >
                <option value="">None</option>
                <option value="Hour">Hourly</option>
                <option value="Day">Daily</option>
                <option value="Week">Weekly</option>
                <option value="Month">Monthly</option>
                <option value="Year">Yearly</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[#222] flex items-center justify-between">
            <span className={`text-sm ${message.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
            <button 
              type="submit"
              disabled={mutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg text-sm font-semibold tracking-wide transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <PlusCircle size={18} />
              {mutation.isPending ? 'Injecting...' : 'Inject Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
