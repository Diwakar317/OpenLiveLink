import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GENERIC_REMARKS = ['upi pay', 'upi', 'sent using payt', 'payment', 'sent using paytm'];

function groupTransactions(payments, aliases = {}) {
  const grouped = {};
  
  payments.forEach(txn => {
    if (txn.transaction_id === 'SYS_ALIASES') return;

    let originalKey;
    const upiId = txn.upi_id ? txn.upi_id.toLowerCase().trim() : null;
    const accNo = txn.account_number ? txn.account_number.toLowerCase().trim() : null;
    
    if (upiId) originalKey = `UPI:${upiId}`;
    else if (accNo && accNo !== '') originalKey = `ACC:${accNo}`;
    else originalKey = (txn.recipient_name || 'Unknown').toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    let key = aliases[originalKey] ? `MERGED:${aliases[originalKey].toUpperCase()}` : originalKey;
    
    if (!grouped[key]) {
      grouped[key] = {
        key: key,
        customName: aliases[originalKey] || null,
        names: new Set(),
        totalPaid: 0,
        totalReceived: 0,
        transactions: [],
        identifiers: new Set(),
        originalKeys: new Set()
      };
    }
    
    grouped[key].names.add(txn.recipient_name);
    grouped[key].originalKeys.add(originalKey);
    
    const amount = Number(txn.amount);
    if (amount < 0) grouped[key].totalPaid += Math.abs(amount);
    else grouped[key].totalReceived += amount;
    
    grouped[key].transactions.push(txn);
    if (txn.upi_id) grouped[key].identifiers.add(`UPI: ${txn.upi_id}`);
    if (txn.account_number) grouped[key].identifiers.add(`A/C: ${txn.account_number}`);
  });
  
  const result = Object.values(grouped).map(group => {
    group.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    group.lastTransactionDate = group.transactions[0]?.date;
    
    if (group.customName) {
       group.name = group.customName;
    } else {
       const nameCounts = {};
       let bestName = 'Unknown';
       let maxCount = 0;
       
       group.transactions.forEach(t => {
          const n = t.recipient_name;
          if (!GENERIC_REMARKS.includes(n.toLowerCase())) {
             nameCounts[n] = (nameCounts[n] || 0) + 1;
             if (nameCounts[n] > maxCount) {
                maxCount = nameCounts[n];
                bestName = n;
             }
          }
       });
       
       if (maxCount === 0 && group.transactions.length > 0) {
          bestName = group.transactions[0].recipient_name;
       }
       group.name = bestName;
    }

    group.identifiers = Array.from(group.identifiers);
    group.originalKeys = Array.from(group.originalKeys);
    // Remove Set objects for JSON serialization
    delete group.names;
    return group;
  });
  
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.split(' ')[1];
  const authClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  if (req.method === 'GET') {
    if (req.query.mode === 'grouped') {
      try {
        const { search = '', filter = 'all', sort = 'volume', page = 1, pageSize = 15 } = req.query;
        
        const { data: allPayments, error } = await supabase.from('payments').select('*').limit(10000);
        if (error) throw error;
        
        const aliasRow = allPayments.find(p => p.transaction_id === 'SYS_ALIASES');
        let aliases = {};
        if (aliasRow && aliasRow.remarks) {
           try { aliases = JSON.parse(aliasRow.remarks); } catch(e) {}
        }
        
        let grouped = groupTransactions(allPayments, aliases);
        
        if (search) {
           const ls = search.toLowerCase();
           grouped = grouped.filter(g => 
              g.name.toLowerCase().includes(ls) || 
              g.identifiers.some(id => id.toLowerCase().includes(ls))
           );
        }
        
        if (filter === 'paid') grouped = grouped.filter(g => g.totalPaid > 0);
        else if (filter === 'received') grouped = grouped.filter(g => g.totalReceived > 0);
        
        grouped.sort((a, b) => {
           if (sort === 'volume') return (b.totalPaid + b.totalReceived) - (a.totalPaid + a.totalReceived);
           if (sort === 'paid') return b.totalPaid - a.totalPaid;
           if (sort === 'received') return b.totalReceived - a.totalReceived;
           if (sort === 'recent') return new Date(b.lastTransactionDate || 0) - new Date(a.lastTransactionDate || 0);
           if (sort === 'alpha') return a.name.localeCompare(b.name);
           return 0;
        });
        
        const totalItems = grouped.length;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;
        const currentPage = Math.max(1, Math.min(parseInt(page), totalPages));
        const startIndex = (currentPage - 1) * pageSize;
        const paginatedData = grouped.slice(startIndex, startIndex + parseInt(pageSize));
        
        const summary = {
           totalPaid: grouped.reduce((sum, g) => sum + g.totalPaid, 0),
           totalReceived: grouped.reduce((sum, g) => sum + g.totalReceived, 0)
        };

        return res.status(200).json({ 
           data: paginatedData, 
           pagination: { currentPage, totalPages, totalItems, pageSize },
           summary 
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  if (req.method === 'PUT') {
    return handlePut(req, res, supabase);
  }
  
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('API Error (DELETE):', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  
  if (req.method === 'POST') {
    try {
      const transactions = req.body.transactions;
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      const { data, error } = await supabase.from('payments').upsert(transactions, { onConflict: 'source_hash' });
      if (error) throw error;
      return res.status(200).json({ success: true, count: transactions.length });
    } catch (err) {
      console.error('API Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const { search, month, start_date, end_date, status, transaction_id, min_amount, max_amount, limit, offset, sort_by, sort_dir } = req.query;

    let query = supabase.from('payments').select('*', { count: 'exact' });

    // Sorting
    const sortField = ['date', 'amount', 'recipient_name'].includes(sort_by) ? sort_by : 'date';
    const isAsc = sort_dir === 'asc';
    
    // Always add a secondary sort by time to keep results stable
    if (sortField === 'date') {
        query = query.order('date', { ascending: isAsc, nullsFirst: false })
                     .order('time', { ascending: isAsc, nullsFirst: false });
    } else {
        query = query.order(sortField, { ascending: isAsc, nullsFirst: false })
                     .order('date', { ascending: false })
                     .order('time', { ascending: false });
    }

    if (transaction_id) {
      query = query.eq('transaction_id', transaction_id);
    }

    if (search) {
      // Escape wildcard characters to prevent complex query DoS
      const sanitizedSearch = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `recipient_name.ilike.%${sanitizedSearch}%,upi_id.ilike.%${sanitizedSearch}%,remarks.ilike.%${sanitizedSearch}%`
      );
    }

    if (start_date && end_date) {
        query = query.gte('date', start_date).lte('date', end_date);
    } else if (month) {
      const mStartDate = `${month}-01`;
      const [year, mon] = month.split('-').map(Number);
      const mEndDate = new Date(year, mon, 0).toISOString().split('T')[0];
      query = query.gte('date', mStartDate).lte('date', mEndDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (min_amount) {
      query = query.gte('amount', parseFloat(min_amount));
    }
    if (max_amount) {
      query = query.lte('amount', parseFloat(max_amount));
    }
    
    // Pagination (apply after all filters, before execution)
    let pageLimit = parseInt(limit) || 20;
    if (pageLimit > 100) pageLimit = 100;
    if (pageLimit < 1) pageLimit = 20;
    
    let pageOffset = parseInt(offset) || 0;
    if (pageOffset < 0) pageOffset = 0;
    
    query = query.range(pageOffset, pageOffset + pageLimit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase query error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // Compute global analytics efficiently using the Supabase RPC
    const rpcParams = {};
    if (transaction_id) rpcParams.transaction_id_param = transaction_id;
    if (start_date) rpcParams.start_date_param = start_date;
    if (end_date) rpcParams.end_date_param = end_date;
    if (status) rpcParams.status_param = status;
    if (month && (!start_date || !end_date)) {
        const mStartDate = `${month}-01`;
        const [year, mon] = month.split('-').map(Number);
        const mEndDate = new Date(year, mon, 0).toISOString().split('T')[0];
        rpcParams.start_date_param = mStartDate;
        rpcParams.end_date_param = mEndDate;
    }
    if (search) {
        // The RPC uses ILIKE, we should pass the sanitized search
        rpcParams.search_param = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    const { data: analyticsData, error: analyticsError } = await supabase.rpc('get_payment_analytics', rpcParams);

    // Fallback if RPC is not deployed yet
    if (analyticsError && analyticsError.message.includes('Could not find the function')) {
        console.warn('RPC get_payment_analytics not found. Please run the SQL script in your Supabase dashboard.');
        return res.status(200).json({
            payments: data,
            totalCount: count,
            analytics: {
              totalPayments: count,
              totalAmount: 0,
              thisMonthTotal: 0,
              needsReviewCount: 0,
              topRecipients: [],
              rpcMissing: true
            },
        });
    } else if (analyticsError) {
        throw new Error(analyticsError.message);
    }

    return res.status(200).json({
      payments: data,
      totalCount: count,
      analytics: {
        totalPayments: count,
        totalAmount: analyticsData.totalAmount || 0,
        thisMonthTotal: analyticsData.thisMonthTotal || 0,
        needsReviewCount: analyticsData.needsReviewCount || 0,
        topRecipients: analyticsData.topRecipients || [],
      },
    });
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePut(req, res, supabase) {
  try {
    const { id, amount, date, time, recipient_name, upi_id, account_number, remarks } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    const updates = {};
    if (amount !== undefined) updates.amount = amount === "" ? null : parseFloat(amount);
    if (date !== undefined) updates.date = date === "" ? null : date;
    if (time !== undefined) updates.time = time === "" ? null : time;
    if (recipient_name !== undefined) updates.recipient_name = recipient_name === "" ? null : recipient_name;
    if (upi_id !== undefined) updates.upi_id = upi_id === "" ? null : upi_id;
    if (account_number !== undefined) updates.account_number = account_number === "" ? null : account_number;
    if (remarks !== undefined) updates.remarks = remarks === "" ? null : remarks;
    
    const { data: existing, error: fetchErr } = await supabase.from('payments').select('*').eq('id', id).single();
    if (fetchErr) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const merged = { ...existing, ...updates };
    const hasAmount = merged.amount !== null && merged.amount > 0;
    const hasId = merged.transaction_id || merged.upi_id || merged.account_number;
    
    updates.status = (hasAmount && hasId) ? 'valid' : 'needs_review';

    const { data, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ payment: data });
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
