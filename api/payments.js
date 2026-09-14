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
    const { search, month, status, transaction_id, min_amount, max_amount } = req.query;

    let query = supabase
      .from('payments')
      .select('*')
      .order('date', { ascending: false, nullsFirst: false })
      .order('time', { ascending: false, nullsFirst: false });

    if (transaction_id) {
      query = query.eq('transaction_id', transaction_id);
    }

    if (search) {
      query = query.or(
        `recipient_name.ilike.%${search}%,upi_id.ilike.%${search}%,remarks.ilike.%${search}%`
      );
    }

    if (month) {
      const startDate = `${month}-01`;
      const [year, mon] = month.split('-').map(Number);
      const endDate = new Date(year, mon, 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
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

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const totalAmount = data.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const needsReviewCount = data.filter(r => r.status === 'needs_review').length;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTotal = data
      .filter(r => r.date && r.date.startsWith(currentMonth))
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    return res.status(200).json({
      payments: data,
      analytics: {
        totalPayments: data.length,
        totalAmount,
        thisMonthTotal,
        needsReviewCount,
      },
    });
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
