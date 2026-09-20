import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  if (req.method === 'PUT') {
    return handlePut(req, res, supabase);
  }
  
  if (req.method === 'POST') {
    try {
      const transactions = req.body.transactions;
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      const { data, error } = await supabase.from('payments').upsert(transactions, { onConflict: 'source_hash', ignoreDuplicates: true });
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
