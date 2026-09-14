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

function getMonthOptions() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    months.push({ value, label });
  }
  return months;
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

export default function PayLedgerDashboard() {
  const [payments, setPayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (month) params.set('month', month);
      if (statusFilter) params.set('status', statusFilter);

      const queryString = params.toString();
      const url = queryString ? `${API_BASE}?${queryString}` : API_BASE;
      const res = await fetch(url);

      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();

      setPayments(data.payments || []);
      setAnalytics(data.analytics || null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchPayments(), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [search, month, statusFilter]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
      
      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={"\uD83D\uDCB0"}
          label="Total Payments"
          value={analytics ? analytics.totalPayments : '\u2014'}
        />
        <StatCard
          icon={"\uD83D\uDCCA"}
          label="Total Amount"
          value={analytics ? formatCurrency(analytics.totalAmount) : '\u2014'}
        />
        <StatCard
          icon={"\uD83D\uDCC5"}
          label="This Month"
          value={analytics ? formatCurrency(analytics.thisMonthTotal) : '\u2014'}
        />
        <StatCard
          icon={"\u26A0\uFE0F"}
          label="Needs Review"
          value={analytics ? analytics.needsReviewCount : '\u2014'}
          accent={analytics && analytics.needsReviewCount > 0}
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, UPI ID, or remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all text-slate-700 cursor-pointer"
          >
            <option value="">All Months</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all text-slate-700 cursor-pointer"
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
            <span className="text-red-500 text-lg">{"\u26A0\uFE0F"}</span>
            <span className="text-sm text-red-700 font-medium">{error}</span>
          </div>
          <button
            onClick={fetchPayments}
            className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Recipient</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Identifier</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Remarks</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="text-4xl">{"\uD83D\uDD0D"}</span>
                      <p className="font-medium">No payments found</p>
                      <p className="text-xs">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                payments.map((record, idx) => {
                  const identifier = getIdentifier(record);
                  return (
                    <tr
                      key={record.id || idx}
                      className="hover:bg-yellow-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{formatDate(record.date)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatTime(record.time)}</td>
                      <td className="px-4 py-3 text-slate-800 font-semibold">{record.recipient_name || '\u2014'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {identifier.type && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              {identifier.type}
                            </span>
                          )}
                          <span className="text-slate-600 text-xs font-mono truncate max-w-[180px]">{identifier.value}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap tabular-nums">{formatCurrency(record.amount)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[150px]">{record.remarks || '\u2014'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={record.status} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && payments.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
            <span>{payments.length} payment{payments.length !== 1 ? 's' : ''} shown</span>
            <span className="font-semibold text-slate-700">
              Total: {formatCurrency(payments.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
