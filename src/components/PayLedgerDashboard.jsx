import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { parseStatement, groupTransactions } from '../utils/statementParser';

function formatCurrency(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function StatCard({ label, value, icon, accent = false }) {
  return (
    <div className={`bg-white rounded-xl border p-4 md:p-5 shadow-sm transition-all hover:shadow-md ${accent ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`text-xl md:text-2xl ${accent ? 'opacity-80' : ''}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`text-lg md:text-2xl font-bold tracking-tight truncate ${accent ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function PayeeDetailModal({ group, onClose }) {
  if (!group) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 sticky top-0 rounded-t-2xl z-10">
          <h3 className="font-semibold text-slate-800 text-lg truncate pr-4">{group.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
             <div>
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Paid To</p>
               <p className="text-2xl font-black text-red-600">{formatCurrency(group.totalPaid)}</p>
             </div>
             <div>
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Received From</p>
               <p className="text-2xl font-black text-green-600">{formatCurrency(group.totalReceived)}</p>
             </div>
             <div className="col-span-2 mt-2">
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Known Identifiers</p>
               <div className="flex flex-wrap gap-2">
                 {group.identifiers.length > 0 ? group.identifiers.map((id, i) => (
                   <span key={i} className="px-2 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-mono rounded-md shadow-sm">
                     {id}
                   </span>
                 )) : <span className="text-xs text-slate-400">—</span>}
               </div>
             </div>
          </div>

          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span>📜</span> Transaction History
          </h4>
          
          <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-xl">
             <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 shadow-sm">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Details</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.transactions.map((txn) => {
                    const isPaid = txn.amount < 0;
                    return (
                      <tr key={txn.transaction_id || txn.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(txn.date)}
                          <div className="text-[10px] text-slate-400 mt-0.5">{txn.time}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                             <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] rounded font-bold">{txn.upi_id ? 'UPI' : 'A/C'}</span>
                             <span className="text-xs text-slate-700 truncate max-w-[200px]" title={txn.remarks}>{txn.remarks}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${isPaid ? 'text-red-600' : 'text-green-600'}`}>
                          {isPaid ? '-' : '+'}{formatCurrency(Math.abs(txn.amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayLedgerDashboard() {
  const [payments, setPayments] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('payments').select('*').order('date', { ascending: false });
      if (error) throw error;
      setPayments(data || []);
      setGroupedData(groupTransactions(data || []));
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const parsedTxns = parseStatement(text);
        
        if (parsedTxns.length === 0) {
           alert("No valid transactions found in the file.");
           return;
        }

        // Upsert via API to bypass RLS
        const res = await fetch('/api/payments', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ transactions: parsedTxns })
        });
        
        if (!res.ok) {
           const errData = await res.json().catch(() => ({}));
           throw new Error(errData.error || `Upload failed with status ${res.status}`);
        }

        alert(`Successfully synced ${parsedTxns.length} transactions!`);
        fetchData();
      } catch (err) {
         console.error('Upload error:', err);
         alert('Error processing file: ' + err.message);
      } finally {
         setUploading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const filteredGroups = useMemo(() => {
    if (!search) return groupedData;
    const lowerSearch = search.toLowerCase();
    return groupedData.filter(g => 
      g.name.toLowerCase().includes(lowerSearch) || 
      g.identifiers.some(id => id.toLowerCase().includes(lowerSearch))
    );
  }, [groupedData, search]);

  const totalPaid = groupedData.reduce((sum, g) => sum + g.totalPaid, 0);
  const totalReceived = groupedData.reduce((sum, g) => sum + g.totalReceived, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50">
      
      {/* Header & Upload */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
         <div>
           <h2 className="text-lg font-black text-slate-800">Payee Directory</h2>
           <p className="text-xs font-medium text-slate-500">Grouped analysis of your bank statements</p>
         </div>
         <div>
           <input type="file" accept=".psv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
           <button 
             onClick={() => fileInputRef.current?.click()}
             disabled={uploading}
             className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg transition-all shadow-sm disabled:opacity-50"
           >
             {uploading ? 'Syncing...' : '📄 Import .psv Statement'}
           </button>
         </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard icon={"🔴"} label="Total Paid (All Time)" value={formatCurrency(totalPaid)} />
        <StatCard icon={"🟢"} label="Total Received (All Time)" value={formatCurrency(totalReceived)} />
        <StatCard icon={"👥"} label="Unique Payees" value={groupedData.length} />
      </div>

      {/* Main Content Layout */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 flex items-center">
          <div className="relative w-full max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search payee name, UPI ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all placeholder:text-slate-400 shadow-sm"
            />
          </div>
        </div>

        {/* Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payee Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Last Txn</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Paid (DR)</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Recv (CR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-1/2"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-1/3"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-1/4 ml-auto"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-1/4 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-400">
                    <span className="text-4xl block mb-2">🔍</span>
                    <p className="font-medium">No payees found</p>
                    <p className="text-xs">Import a statement to get started</p>
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedGroup(group)}
                    className="cursor-pointer hover:bg-amber-50/50 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 group-hover:text-amber-700 transition-colors">{group.name}</p>
                      {group.identifiers.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[250px]">
                           {group.identifiers[0]} {group.identifiers.length > 1 ? `+${group.identifiers.length - 1} more` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{formatDate(group.lastTransactionDate)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">{group.totalPaid > 0 ? formatCurrency(group.totalPaid) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600 whitespace-nowrap">{group.totalReceived > 0 ? formatCurrency(group.totalReceived) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Detail Modal */}
      <PayeeDetailModal group={selectedGroup} onClose={() => setSelectedGroup(null)} />
    </div>
  );
}
