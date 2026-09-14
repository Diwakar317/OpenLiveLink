import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const { search, month, start_date, end_date, status, transaction_id, min_amount, max_amount, limit, offset, sort_by, sort_dir } = req.query;

    let query = supabase.from('payments').select('*', { count: 'exact' });

    // Sorting
    const sortField = sort_by || 'date';
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
      query = query.or(
        `recipient_name.ilike.%${search}%,upi_id.ilike.%${search}%,remarks.ilike.%${search}%`
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
    const pageLimit = parseInt(limit) || 20;
    const pageOffset = parseInt(offset) || 0;
    query = query.range(pageOffset, pageOffset + pageLimit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase query error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // To compute global analytics efficiently, we need a separate query without pagination 
    // but with the same filters. 
    // However, if the dataset is small, it's easier to just pull all for analytics.
    // For Vercel Serverless, doing a count/sum query is better.
    let analyticsQuery = supabase.from('payments').select('amount, status, recipient_name, date');
    
    if (transaction_id) analyticsQuery = analyticsQuery.eq('transaction_id', transaction_id);
    if (search) analyticsQuery = analyticsQuery.or(`recipient_name.ilike.%${search}%,upi_id.ilike.%${search}%,remarks.ilike.%${search}%`);
    if (start_date && end_date) analyticsQuery = analyticsQuery.gte('date', start_date).lte('date', end_date);
    else if (month) {
      const mStartDate = `${month}-01`;
      const [year, mon] = month.split('-').map(Number);
      const mEndDate = new Date(year, mon, 0).toISOString().split('T')[0];
      analyticsQuery = analyticsQuery.gte('date', mStartDate).lte('date', mEndDate);
    }
    if (status) analyticsQuery = analyticsQuery.eq('status', status);
    
    const { data: allFilteredData, error: analyticsError } = await analyticsQuery;
    if (analyticsError) throw new Error(analyticsError.message);

    const totalAmount = allFilteredData.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const needsReviewCount = allFilteredData.filter(r => r.status === 'needs_review').length;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTotal = allFilteredData
      .filter(r => r.date && r.date.startsWith(currentMonth))
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    // Compute top recipients
    const recipientTotals = {};
    allFilteredData.forEach(r => {
        if (!r.recipient_name) return;
        // Normalize name
        const name = r.recipient_name.toUpperCase().trim();
        recipientTotals[name] = (recipientTotals[name] || 0) + (parseFloat(r.amount) || 0);
    });
    
    const topRecipients = Object.entries(recipientTotals)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5); // top 5

    return res.status(200).json({
      payments: data,
      totalCount: count,
      analytics: {
        totalPayments: count,
        totalAmount,
        thisMonthTotal,
        needsReviewCount,
        topRecipients,
      },
    });
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
