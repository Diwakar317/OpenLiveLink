import React, { useState, useEffect, useMemo } from 'react';

const API_BASE = '/api/payments';

function formatCurrency(amount) {
  if (amount == null) return '\u2014';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function formatTime(timeStr) {
  if (!timeStr) return '\u2014';
  try {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  } catch { return timeStr; }
}

function getIdentifier(record) {
  if (record.upi_id) return { value: record.upi_id, type: 'UPI' };
  if (record.account_number) return { value: record.account_number, type: 'A/C' };
  return { value: '\u2014', type: '' };
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

function StatusBadge({ status }) {
  if (status === 'valid') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Valid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
      Review
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-3/4"></div></td>
      ))}
    </tr>
  );
}

function PaymentDetailModal({ payment, onClose, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (payment) {
      setEditForm({ ...payment });
      setIsEditing(false);
    }
  }, [payment]);

  if (!payment) return null;

  const identifier = getIdentifier(payment);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(editForm);
    setIsSaving(false);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 sticky top-0 rounded-t-2xl z-10">
          <h3 className="font-semibold text-slate-800">{isEditing ? 'Edit Payment' : 'Payment Details'}</h3>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors">
                Edit
              </button>
            ) : (
              <button onClick={handleSave} disabled={isSaving} className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {isEditing ? (
             <div className="space-y-4">
               <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase">Amount</label>
                 <input type="number" value={editForm.amount || ''} onChange={e => setEditForm({...editForm, amount: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-semibold text-slate-500 uppercase">Date (YYYY-MM-DD)</label>
                   <input type="text" value={editForm.date || ''} onChange={e => setEditForm({...editForm, date: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-slate-500 uppercase">Time (HH:MM:SS)</label>
                   <input type="text" value={editForm.time || ''} onChange={e => setEditForm({...editForm, time: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
                 </div>
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase">Recipient</label>
                 <input type="text" value={editForm.recipient_name || ''} onChange={e => setEditForm({...editForm, recipient_name: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase">UPI ID</label>
                 <input type="text" value={editForm.upi_id || ''} onChange={e => setEditForm({...editForm, upi_id: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase">Account Number</label>
                 <input type="text" value={editForm.account_number || ''} onChange={e => setEditForm({...editForm, account_number: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase">Remarks</label>
                 <textarea value={editForm.remarks || ''} onChange={e => setEditForm({...editForm, remarks: e.target.value})} className="mt-1 w-full p-2 border border-slate-300 rounded-md focus:ring focus:ring-blue-200 outline-none" />
               </div>
             </div>
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500">Amount</p>
                  <p className="text-3xl font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
                </div>
                <StatusBadge status={payment.status} />
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Date & Time</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(payment.date)} • {formatTime(payment.time)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Transaction ID</p>
                  <p className="text-sm font-medium text-slate-800 font-mono">{payment.transaction_id || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Recipient</p>
                  <p className="text-sm font-medium text-slate-800">{payment.recipient_name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase font-semibold">{identifier.type || 'Identifier'}</p>
                  <p className="text-sm font-medium text-slate-800 font-mono">{identifier.value || '—'}</p>
                </div>
                {payment.remarks && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Remarks</p>
                    <p className="text-sm font-medium text-slate-800 p-2 bg-slate-50 rounded-lg mt-1 border border-slate-100">{payment.remarks}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PayLedgerDashboard() {
  const [payments, setPayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  // Compute actual start/end dates from dateRange preset
  const computedDates = useMemo(() => {
    const now = new Date();
    if (dateRange === 'this_month') {
      return {
        start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      };
    } else if (dateRange === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
      };
    } else if (dateRange === 'last_7_days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
    }
    return { start: '', end: '' };
  }, [dateRange]);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (computedDates.start && computedDates.end) {
        params.set('start_date', computedDates.start);
        params.set('end_date', computedDates.end);
      }
      
      params.set('limit', limit);
      params.set('offset', (page - 1) * limit);
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);

      const queryString = params.toString();
      const url = queryString ? `${API_BASE}?${queryString}` : API_BASE;
      const res = await fetch(url);

      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();

      setPayments(data.payments || []);
      setTotalCount(data.totalCount || 0);
      setAnalytics(data.analytics || null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, dateRange, statusFilter, sortBy, sortDir]);

  useEffect(() => {
    const timer = setTimeout(() => fetchPayments(), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [search, dateRange, statusFilter, page, sortBy, sortDir]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <span className="text-slate-300 ml-1 opacity-50">↕</span>;
    return <span className="text-slate-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50">
      
      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={"💰"} label="Total Amount" value={analytics ? formatCurrency(analytics.totalAmount) : '—'} />
        <StatCard icon={"📊"} label="Total Transactions" value={analytics ? analytics.totalPayments : '—'} />
        <StatCard icon={"📅"} label="This Month" value={analytics ? formatCurrency(analytics.thisMonthTotal) : '—'} />
        <StatCard icon={"⚠️"} label="Needs Review" value={analytics ? analytics.needsReviewCount : '—'} accent={analytics && analytics.needsReviewCount > 0} />
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Left Col: Filters & Table */}
        <div className="flex-1 space-y-4 min-w-0">
          
          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search name, UPI, remarks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all text-slate-700 cursor-pointer"
              >
                <option value="">All Time</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="last_7_days">Last 7 Days</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all text-slate-700 cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="valid">Valid</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-red-500 text-lg">⚠️</span>
                <span className="text-sm text-red-700 font-medium">{error}</span>
              </div>
              <button onClick={fetchPayments} className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">Retry</button>
            </div>
          )}

          {/* Data Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th onClick={() => handleSort('date')} className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors group">
                      Date <SortIcon field="date" />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Time</th>
                    <th onClick={() => handleSort('recipient_name')} className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors">
                      Recipient <SortIcon field="recipient_name" />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Identifier</th>
                    <th onClick={() => handleSort('amount')} className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors">
                      Amount <SortIcon field="amount" />
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <span className="text-4xl">🔍</span>
                          <p className="font-medium">No payments found</p>
                          <p className="text-xs">Try adjusting your filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    payments.map((record, idx) => {
                      const identifier = getIdentifier(record);
                      const isReview = record.status === 'needs_review';
                      return (
                        <tr
                          key={record.id || idx}
                          onClick={() => setSelectedPayment(record)}
                          className={`cursor-pointer transition-colors ${isReview ? 'bg-amber-50 hover:bg-amber-100/70' : 'hover:bg-slate-50'}`}
                        >
                          <td className={`px-4 py-3 font-medium whitespace-nowrap ${isReview ? 'text-amber-900' : 'text-slate-700'}`}>{formatDate(record.date)}</td>
                          <td className={`px-4 py-3 whitespace-nowrap ${isReview ? 'text-amber-700' : 'text-slate-500'}`}>{formatTime(record.time)}</td>
                          <td className={`px-4 py-3 font-semibold ${isReview ? 'text-amber-950' : 'text-slate-800'}`}>{record.recipient_name || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {identifier.type && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isReview ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                  {identifier.type}
                                </span>
                              )}
                              <span className={`text-xs font-mono truncate max-w-[150px] ${isReview ? 'text-amber-800' : 'text-slate-600'}`}>{identifier.value}</span>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-right font-bold whitespace-nowrap tabular-nums ${isReview ? 'text-amber-950' : 'text-slate-900'}`}>{formatCurrency(record.amount)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={record.status} /></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && totalCount > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-sm mt-auto">
                <span className="text-slate-500">
                  Showing <span className="font-medium text-slate-700">{(page - 1) * limit + 1}</span> to <span className="font-medium text-slate-700">{Math.min(page * limit, totalCount)}</span> of <span className="font-medium text-slate-700">{totalCount}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-xs"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * limit >= totalCount}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Col: Top Recipients Analytics */}
        <div className="w-full xl:w-72 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full max-h-[600px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span>🏆</span> Top Recipients
              </h3>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {loading ? (
                 <div className="space-y-4">
                   {Array.from({length: 4}).map((_, i) => (
                     <div key={i} className="animate-pulse flex justify-between">
                        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                     </div>
                   ))}
                 </div>
              ) : analytics?.topRecipients?.length > 0 ? (
                <div className="space-y-4">
                  {analytics.topRecipients.map((rec, idx) => (
                    <div key={idx} className="flex justify-between items-center group">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-yellow-600 transition-colors" title={rec.name}>{rec.name}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(rec.total)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                  <span className="text-2xl mb-2">📉</span>
                  <p className="text-sm text-center">No data for selected filters</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
      </div>
      
      {/* Payment Detail Modal */}
      <PaymentDetailModal 
        payment={selectedPayment} 
        onClose={() => setSelectedPayment(null)} 
        onSave={async (updatedPayment) => {
          try {
            const res = await fetch('/api/payments', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedPayment)
            });
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || 'Failed to update payment');
            }
            await fetchPayments();
          } catch (err) {
            console.error(err);
            alert('Error saving payment: ' + err.message);
          }
        }}
      />
    </div>
  );
}
