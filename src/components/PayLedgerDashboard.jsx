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

function formatTime(timeStr) {
  if (!timeStr) return '';
  // Expected format from DB is HH:MM:SS or HH:MM
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
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

function PayeeDetailModal({ group, aliases, onClose, onSaveAlias, onRemoveAlias, onDeleteTransaction, confirmAction }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  // Reset local edit state when group changes
  useEffect(() => {
    if (group) {
      setEditName(group.name);
      setIsEditing(false);
    }
  }, [group]);

  if (!group) return null;

  const handleSave = () => {
    onSaveAlias(group.originalKeys, editName.trim());
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 sticky top-0 rounded-t-2xl z-10">
          <div className="flex-1 flex items-center gap-3 pr-4">
            {isEditing ? (
              <div className="flex w-full items-center gap-2">
                 <input 
                   autoFocus
                   type="text" 
                   value={editName}
                   onChange={e => setEditName(e.target.value)}
                   className="flex-1 font-semibold text-slate-800 text-lg px-2 py-1 rounded border border-slate-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                   placeholder="Enter custom name..."
                 />
                 <button onClick={handleSave} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-sm transition-colors shadow-sm">Save</button>
                 <button onClick={() => setIsEditing(false)} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-sm transition-colors">Cancel</button>
              </div>
            ) : (
              <>
                 <h3 className="font-semibold text-slate-800 text-lg truncate">{group.name}</h3>
                 <button 
                   onClick={() => setIsEditing(true)} 
                   className="flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                   title="Rename Payee"
                 >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                 </button>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div className="p-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
             <div className="shrink-0">
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 whitespace-nowrap">Total Debit</p>
               <p className="text-2xl font-black text-red-600 whitespace-nowrap">{formatCurrency(group.totalPaid)}</p>
             </div>
             <div className="shrink-0">
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 whitespace-nowrap">Total Credit</p>
               <p className="text-2xl font-black text-green-600 whitespace-nowrap">{formatCurrency(group.totalReceived)}</p>
             </div>
             <div className="flex-1 min-w-0 md:pl-4 md:border-l md:border-slate-200">
               <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 whitespace-nowrap">Known Identifiers</p>
               <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                 {group.originalKeys && group.originalKeys.length > 0 ? group.originalKeys.map((origKey, i) => {
                   const isAliased = aliases && aliases[origKey] !== undefined;
                   return (
                     <div key={i} className="flex items-center bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden transition-all">
                       <span className="px-2 py-1 text-slate-700 text-xs font-mono">
                         {origKey}
                       </span>
                       {isAliased && (
                         <button 
                           onClick={() => {
                             confirmAction({
                               title: 'Unlink Identifier',
                               message: 'Are you sure you want to unlink this identifier? It will be separated back into its own group.',
                               isDestructive: true,
                               confirmText: 'Unlink',
                               onConfirm: () => onRemoveAlias(origKey)
                             });
                           }}
                           className="px-1.5 py-1 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 border-l border-slate-100 transition-colors"
                           title="Unlink this identifier"
                         >
                           <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                         </button>
                       )}
                     </div>
                   );
                 }) : <span className="text-xs text-slate-400">—</span>}
               </div>
             </div>
          </div>

          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span>📜</span> Transaction History
          </h4>
          
          <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-xl">
             <table className="w-full text-sm table-fixed">
                <thead className="bg-slate-50 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="w-[25%] text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="w-[55%] text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Details</th>
                    <th className="w-[20%] text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.transactions.map((txn) => {
                    const isPaid = txn.amount < 0;
                    return (
                      <tr key={txn.transaction_id || txn.id} className="hover:bg-slate-50 group">
                        <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(txn.date)}
                          <div className="text-[10px] text-slate-400 mt-0.5">{formatTime(txn.time)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                             <span className="mt-0.5 shrink-0 px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] rounded font-bold">{txn.upi_id ? 'UPI' : 'A/C'}</span>
                             <span className="text-xs text-slate-700 whitespace-normal break-all leading-relaxed">{txn.remarks}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                             <span className={`font-bold ${isPaid ? 'text-red-600' : 'text-green-600'}`}>
                               {isPaid ? '-' : '+'}{formatCurrency(Math.abs(txn.amount))}
                             </span>
                             <button 
                               onClick={() => {
                                 confirmAction({
                                   title: 'Delete Transaction',
                                   message: 'Are you sure you want to permanently delete this transaction? This cannot be undone.',
                                   isDestructive: true,
                                   confirmText: 'Delete',
                                   onConfirm: () => onDeleteTransaction(txn.id)
                                 });
                               }}
                               className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50"
                               title="Delete Transaction"
                             >
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                             </button>
                          </div>
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [aliases, setAliases] = useState({});
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'recent', direction: 'desc' });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [dialog, setDialog] = useState(null);
  
  const fileInputRef = useRef(null);
  const tableTopRef = useRef(null);

  const confirmAction = (options) => {
    setDialog({ type: 'confirm', confirmText: 'Confirm', cancelText: 'Cancel', isDestructive: false, ...options });
  };
  
  const showAlert = (message, title = 'Notification') => {
    setDialog({ type: 'alert', title, message, confirmText: 'OK' });
  };

  // Scroll to top of list when page changes
  useEffect(() => {
    if (tableTopRef.current) {
      // Small timeout to ensure DOM has painted the new rows
      setTimeout(() => {
        tableTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 10);
    }
  }, [page]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset to page 1 on filter/sort change
  useEffect(() => {
    setPage(1);
  }, [filterType, sortConfig, pageSize, appliedStartDate, appliedEndDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('payments').select('*').order('date', { ascending: false });
      if (error) throw error;
      
      const aliasRes = await fetch('/api/aliases');
      let aliasDict = {};
      if (aliasRes.ok) {
         const ad = await aliasRes.json();
         aliasDict = ad.aliases || {};
      }
      setAliases(aliasDict);
      setPayments(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveAlias = async (groupOriginalKeys, newName) => {
    if (!newName || !groupOriginalKeys || groupOriginalKeys.length === 0) return;
    
    const newAliases = { ...aliases };
    groupOriginalKeys.forEach(k => { newAliases[k] = newName; });
    setAliases(newAliases);
    
    if (selectedGroup) {
       setSelectedGroup(prev => ({ ...prev, name: newName }));
    }

    try {
       await fetch('/api/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aliases: newAliases })
       });
    } catch (e) {
       console.error("Failed to save alias", e);
    }
  };

  const handleRemoveAlias = async (originalKeyToRemove) => {
    const newAliases = { ...aliases };
    delete newAliases[originalKeyToRemove];
    setAliases(newAliases);
    
    // Instead of closing the modal, update selectedGroup dynamically
    setSelectedGroup(prev => {
       if (!prev) return null;
       const newOriginalKeys = new Set(prev.originalKeys);
       newOriginalKeys.delete(originalKeyToRemove);
       
       if (newOriginalKeys.size === 0) return null;
       
       const updatedTxns = prev.transactions.filter(txn => {
          let origKey;
          const upiId = txn.upi_id ? txn.upi_id.toLowerCase().trim() : null;
          const accNo = txn.account_number ? txn.account_number.toLowerCase().trim() : null;
          if (upiId) origKey = `UPI:${upiId}`;
          else if (accNo && accNo !== '') origKey = `ACC:${accNo}`;
          else origKey = (txn.recipient_name || 'Unknown').toUpperCase().replace(/[^A-Z0-9]/g, '');
          
          return origKey !== originalKeyToRemove;
       });
       
       if (updatedTxns.length === 0) return null;
       
       let newPaid = 0;
       let newReceived = 0;
       updatedTxns.forEach(t => {
          if (t.amount < 0) newPaid += Math.abs(t.amount);
          else newReceived += t.amount;
       });
       
       const newIdentifiers = new Set();
       updatedTxns.forEach(txn => {
          if (txn.upi_id) newIdentifiers.add(`UPI: ${txn.upi_id}`);
          if (txn.account_number) newIdentifiers.add(`A/C: ${txn.account_number}`);
       });
       
       return { 
         ...prev, 
         originalKeys: Array.from(newOriginalKeys),
         identifiers: Array.from(newIdentifiers),
         transactions: updatedTxns, 
         totalPaid: newPaid, 
         totalReceived: newReceived 
       };
    });

    try {
       await fetch('/api/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aliases: newAliases })
       });
    } catch (e) {
       console.error("Failed to remove alias", e);
    }
  };

  const handleDeleteTransaction = async (transactionId) => {
    if (!transactionId) return;
    
    // Optimistic UI updates
    setPayments(prev => prev.filter(t => t.id !== transactionId));
    
    setSelectedGroup(prev => {
       if (!prev) return prev;
       const updatedTxns = prev.transactions.filter(t => t.id !== transactionId);
       if (updatedTxns.length === 0) return null; // Close modal if group becomes empty
       
       let newPaid = 0;
       let newReceived = 0;
       updatedTxns.forEach(t => {
          if (t.amount < 0) newPaid += Math.abs(t.amount);
          else newReceived += t.amount;
       });
       
       return { ...prev, transactions: updatedTxns, totalPaid: newPaid, totalReceived: newReceived };
    });

    try {
      await fetch(`/api/payments?id=${transactionId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete transaction', e);
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'desc') return { key, direction: 'asc' };
        return { key: 'volume', direction: 'desc' };
      }
      const defaultDir = key === 'alpha' ? 'asc' : 'desc';
      return { key, direction: defaultDir };
    });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="text-slate-300 ml-1 opacity-0 group-hover:opacity-50 transition-opacity">↕</span>;
    if (sortConfig.direction === 'desc') return <span className="text-amber-500 ml-1">↓</span>;
    return <span className="text-amber-500 ml-1">↑</span>;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsedTxns = parseStatement(reader.result);
        
        if (parsedTxns.length === 0) {
           showAlert("No valid transactions found in the file.", "Empty File");
           setUploading(false);
           return;
        }

        const res = await fetch('/api/payments', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ transactions: parsedTxns })
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Upload failed');
        }

        showAlert(`Successfully synced ${parsedTxns.length} transactions!`, "Upload Complete");
        fetchData();
      } catch (err) {
         console.error('Upload error:', err);
         showAlert('Error processing file: ' + err.message, "Upload Failed");
      } finally {
         setUploading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const dynamicallyGroupedData = useMemo(() => {
    let filteredRaw = payments;
    if (appliedStartDate) {
       filteredRaw = filteredRaw.filter(p => p.date >= appliedStartDate);
    }
    if (appliedEndDate) {
       filteredRaw = filteredRaw.filter(p => p.date <= appliedEndDate);
    }
    return groupTransactions(filteredRaw, aliases) || [];
  }, [payments, aliases, appliedStartDate, appliedEndDate]);

  const { paginatedData, paginationInfo, summary } = useMemo(() => {
    let result = dynamicallyGroupedData;
    
    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      result = result.filter(g => 
        g.name.toLowerCase().includes(lowerSearch) || 
        g.identifiers.some(id => id.toLowerCase().includes(lowerSearch))
      );
    }
    
    if (filterType === 'debit') {
      result = result.filter(g => g.totalPaid > 0);
    } else if (filterType === 'credit') {
      result = result.filter(g => g.totalReceived > 0);
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      switch (sortConfig.key) {
        case 'debit':
          return sortConfig.direction === 'desc' ? b.totalPaid - a.totalPaid : a.totalPaid - b.totalPaid;
        case 'credit':
          return sortConfig.direction === 'desc' ? b.totalReceived - a.totalReceived : a.totalReceived - b.totalReceived;
        case 'recent':
          const val = new Date(b.lastTransactionDate || 0) - new Date(a.lastTransactionDate || 0);
          return sortConfig.direction === 'desc' ? val : -val;
        case 'alpha':
          return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case 'volume':
        default:
          const volB = b.totalPaid + b.totalReceived;
          const volA = a.totalPaid + a.totalReceived;
          return sortConfig.direction === 'desc' ? volB - volA : volA - volB;
      }
    });

    const summaryData = {
      totalPaid: result.reduce((s, g) => s + g.totalPaid, 0),
      totalReceived: result.reduce((s, g) => s + g.totalReceived, 0),
      totalPayees: result.length
    };
    
    // Pagination
    const totalItems = result.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedSlice = result.slice(startIndex, startIndex + pageSize);
    
    return {
       paginatedData: paginatedSlice,
       paginationInfo: { currentPage, totalPages, totalItems, pageSize },
       summary: summaryData
    };
  }, [dynamicallyGroupedData, debouncedSearch, filterType, sortConfig, page, pageSize]);

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
             {uploading ? 'Syncing...' : 'Import Statement'}
           </button>
         </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard icon="💸" label="Total Debit (Filtered)" value={formatCurrency(summary.totalPaid)} />
        <StatCard icon="💰" label="Total Credit (Filtered)" value={formatCurrency(summary.totalReceived)} />
        <StatCard icon="👥" label="Total Payees" value={summary.totalPayees} />
      </div>

      {/* Main Content Layout */}
      <div ref={tableTopRef} className="scroll-mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
          {/* Top Row: Search */}
          <div className="flex w-full">
            <div className="relative flex-grow">
              <svg className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <input 
                type="text" 
                placeholder="Search payees..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          {/* Bottom Row: Date Picker, Filters & Top Pagination */}
          <div className="flex flex-col lg:flex-row gap-3 w-full items-start lg:items-center">
            
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm w-full lg:w-auto">
               <span className="text-[10px] sm:text-xs text-slate-500 font-bold px-1">FROM</span>
               <input 
                  type="date" 
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="text-sm text-slate-700 outline-none bg-transparent cursor-pointer flex-grow sm:flex-grow-0 w-full sm:w-auto"
               />
               <span className="hidden sm:block text-xs text-slate-300">|</span>
               <div className="w-full sm:hidden border-t border-slate-100 my-1"></div>
               <span className="text-[10px] sm:text-xs text-slate-500 font-bold px-1">TO</span>
               <input 
                  type="date" 
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="text-sm text-slate-700 outline-none bg-transparent cursor-pointer flex-grow sm:flex-grow-0 w-full sm:w-auto"
               />
               
               <button 
                  onClick={() => { setAppliedStartDate(startDate); setAppliedEndDate(endDate); }} 
                  disabled={startDate === appliedStartDate && endDate === appliedEndDate}
                  className={`ml-auto sm:ml-2 px-3 py-1 text-xs font-bold rounded shadow-sm transition-colors w-full sm:w-auto mt-2 sm:mt-0 ${
                    startDate === appliedStartDate && endDate === appliedEndDate 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
               >
                  Apply
               </button>

               {(appliedStartDate || appliedEndDate) && (
                 <button 
                    onClick={() => { 
                      setStartDate(''); setEndDate(''); 
                      setAppliedStartDate(''); setAppliedEndDate(''); 
                    }} 
                    className="ml-auto sm:ml-1 p-1.5 rounded bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors mt-2 sm:mt-0"
                    title="Clear Date Filter"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                 </button>
               )}
            </div>

            <div className="flex gap-3 w-full lg:w-auto">
              <select
                value={filterType}
                onChange={e => { setFilterType(e.target.value); setPage(1); }}
                className="flex-1 lg:flex-none px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer bg-white shadow-sm"
              >
                <option value="all">All Types</option>
                <option value="debit">Debit Only</option>
                <option value="credit">Credit Only</option>
              </select>
              
              {/* Mobile Only Sort Dropdown (Desktop uses column headers) */}
              <select
                value={`${sortConfig.key}-${sortConfig.direction}`}
                onChange={e => {
                  const [k, d] = e.target.value.split('-');
                  setSortConfig({ key: k, direction: d });
                  setPage(1);
                }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer bg-white shadow-sm md:hidden"
              >
                <option value="volume-desc">Sort by Volume</option>
                <option value="debit-desc">Highest Debit</option>
                <option value="credit-desc">Highest Credit</option>
                <option value="recent-desc">Most Recent</option>
                <option value="alpha-asc">Alphabetical (A-Z)</option>
              </select>
            </div>

            {/* Top Pagination (Desktop only) */}
            <div className="hidden xl:flex items-center bg-white border border-slate-200 rounded-lg shadow-sm ml-auto">
               <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))} 
                  disabled={page === 1} 
                  className="p-1.5 border-r border-slate-100 hover:bg-slate-50 disabled:opacity-30 text-slate-600 rounded-l-lg transition-colors"
                  title="Previous Page"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
               </button>
               <span className="px-3 py-1.5 text-xs font-bold text-slate-600 whitespace-nowrap">
                 Page {page} of {paginationInfo.totalPages}
               </span>
               <button 
                  onClick={() => setPage(p => Math.min(paginationInfo.totalPages, p + 1))} 
                  disabled={page === paginationInfo.totalPages} 
                  className="p-1.5 border-l border-slate-100 hover:bg-slate-50 disabled:opacity-30 text-slate-600 rounded-r-lg transition-colors"
                  title="Next Page"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
               </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto min-h-[60vh]">
          {/* Desktop Table View */}
          <table className="w-full text-left text-sm hidden md:table table-fixed">
            <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider sticky top-0 shadow-sm z-10">
              <tr>
                <th 
                  className="w-2/5 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors group select-none" 
                  onClick={() => handleSort('alpha')}
                >
                  <div className="flex items-center">Payee {getSortIcon('alpha')}</div>
                </th>
                <th 
                  className="w-1/5 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors group select-none" 
                  onClick={() => handleSort('recent')}
                >
                  <div className="flex items-center">Last Transacted {getSortIcon('recent')}</div>
                </th>
                <th 
                  className="w-1/5 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors group select-none text-right" 
                  onClick={() => handleSort('debit')}
                >
                  <div className="flex items-center justify-end">Total Debit {getSortIcon('debit')}</div>
                </th>
                <th 
                  className="w-1/5 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors group select-none text-right" 
                  onClick={() => handleSort('credit')}
                >
                  <div className="flex items-center justify-end">Total Credit {getSortIcon('credit')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-1/2"></div></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-1/3"></div></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-1/4 ml-auto"></div></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-1/4 ml-auto"></div></td>
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-400">
                    <span className="text-4xl block mb-2">🔍</span>
                    <p className="font-medium">No payees found</p>
                    <p className="text-xs">Try adjusting your filters or search</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((group, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedGroup(group)}
                    className="cursor-pointer hover:bg-amber-50/50 transition-colors group"
                  >
                    <td className="px-4 py-3 overflow-hidden">
                      <p className="font-bold text-slate-800 group-hover:text-amber-700 transition-colors truncate" title={group.name}>{group.name}</p>
                      {group.identifiers && group.identifiers.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={group.identifiers[0]}>
                           {group.identifiers[0]} {group.identifiers.length > 1 ? `+${group.identifiers.length - 1} more` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{formatDate(group.lastTransactionDate)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">{group.totalPaid > 0 && filterType !== 'credit' ? formatCurrency(group.totalPaid) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600 whitespace-nowrap">{group.totalReceived > 0 && filterType !== 'debit' ? formatCurrency(group.totalReceived) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100">
             {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                   <div key={i} className="p-4 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
                      <div className="h-4 bg-slate-200 rounded w-full"></div>
                   </div>
                ))
             ) : paginatedData.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <span className="text-4xl block mb-2">🔍</span>
                  <p className="font-medium">No payees found</p>
                  <p className="text-xs">Try adjusting your filters or search</p>
                </div>
             ) : (
                paginatedData.map((group, idx) => (
                   <div 
                      key={idx} 
                      onClick={() => setSelectedGroup(group)}
                      className="p-4 active:bg-amber-50 cursor-pointer"
                   >
                      <div className="flex justify-between items-start mb-3">
                         <div className="flex-1 pr-2">
                            <p className="font-bold text-slate-800 leading-tight">{group.name}</p>
                            {group.identifiers && group.identifiers.length > 0 && (
                               <p className="text-[10px] text-slate-400 font-mono mt-1">
                                  {group.identifiers[0]} {group.identifiers.length > 1 ? `+${group.identifiers.length - 1}` : ''}
                               </p>
                            )}
                         </div>
                         <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap bg-slate-100 px-2 py-1 rounded">
                            {formatDate(group.lastTransactionDate)}
                         </p>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                         <div className="flex-1 text-center border-r border-slate-200">
                            <p className="text-[9px] text-slate-400 font-bold tracking-wider mb-0.5">DEBIT</p>
                            <p className={`font-bold text-sm ${group.totalPaid > 0 && filterType !== 'credit' ? 'text-red-600' : 'text-slate-300'}`}>
                               {group.totalPaid > 0 && filterType !== 'credit' ? formatCurrency(group.totalPaid) : '—'}
                            </p>
                         </div>
                         <div className="flex-1 text-center">
                            <p className="text-[9px] text-slate-400 font-bold tracking-wider mb-0.5">CREDIT</p>
                            <p className={`font-bold text-sm ${group.totalReceived > 0 && filterType !== 'debit' ? 'text-green-600' : 'text-slate-300'}`}>
                               {group.totalReceived > 0 && filterType !== 'debit' ? formatCurrency(group.totalReceived) : '—'}
                            </p>
                         </div>
                      </div>
                   </div>
                ))
             )}
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-600">
          <div className="text-xs sm:text-sm text-center sm:text-left w-full sm:w-auto">
             Showing {paginatedData.length > 0 ? ((page - 1) * pageSize) + 1 : 0} to {((page - 1) * pageSize) + paginatedData.length} of {paginationInfo.totalItems} payees
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
             <select 
                value={pageSize} 
                onChange={e => setPageSize(Number(e.target.value))}
                className="w-full sm:w-auto px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-amber-400 bg-white shadow-sm"
             >
                <option value={15}>15 per page</option>
                <option value={30}>30 per page</option>
                <option value={50}>50 per page</option>
             </select>
             
             <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm w-full sm:w-auto">
               <button 
                 onClick={() => setPage(p => Math.max(1, p - 1))} 
                 disabled={page === 1 || loading}
                 className="flex-1 sm:flex-none p-1.5 border-r border-slate-100 hover:bg-slate-50 disabled:opacity-30 text-slate-600 flex justify-center items-center rounded-l-lg transition-colors"
                 title="Previous Page"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
               </button>
               <span className="px-4 py-1.5 text-xs font-bold text-slate-600 whitespace-nowrap text-center flex-grow sm:flex-grow-0">
                 Page {page} of {paginationInfo.totalPages}
               </span>
               <button 
                 onClick={() => setPage(p => Math.min(paginationInfo.totalPages, p + 1))} 
                 disabled={page === paginationInfo.totalPages || loading}
                 className="flex-1 sm:flex-none p-1.5 border-l border-slate-100 hover:bg-slate-50 disabled:opacity-30 text-slate-600 flex justify-center items-center rounded-r-lg transition-colors"
                 title="Next Page"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
               </button>
             </div>
          </div>
        </div>
      </div>
      
      {/* Detail Modal */}
      <PayeeDetailModal 
        group={selectedGroup} 
        aliases={aliases}
        onClose={() => setSelectedGroup(null)} 
        onSaveAlias={handleSaveAlias} 
        onRemoveAlias={handleRemoveAlias}
        onDeleteTransaction={handleDeleteTransaction}
        confirmAction={confirmAction}
      />

      {/* Custom Dialog Modal */}
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-2">{dialog.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{dialog.message}</p>
             </div>
             <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                {dialog.type === 'confirm' && (
                  <button 
                    onClick={() => setDialog(null)}
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-sm transition-colors shadow-sm"
                  >
                    {dialog.cancelText || 'Cancel'}
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (dialog.onConfirm) dialog.onConfirm();
                    setDialog(null);
                  }}
                  className={`px-4 py-2 font-bold rounded-lg text-sm shadow-sm transition-colors ${
                     dialog.isDestructive 
                     ? 'bg-red-500 hover:bg-red-600 text-white' 
                     : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                >
                  {dialog.confirmText || 'OK'}
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
