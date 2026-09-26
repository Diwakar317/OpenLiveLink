-- Run this SQL in your Supabase SQL Editor to create the payments table

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    transaction_id TEXT UNIQUE,
    date DATE,
    time TIME,
    upi_id TEXT,
    account_number TEXT,
    recipient_name TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'needs_review', 'failed')),
    source_hash TEXT UNIQUE,
    source_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for common searches
CREATE INDEX IF NOT EXISTS idx_payments_recipient_name ON public.payments(recipient_name);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON public.payments(transaction_id);

-- ==========================================
-- RPC for Analytics (Run this to optimize the dashboard)
-- ==========================================
CREATE OR REPLACE FUNCTION get_payment_analytics(
  search_param TEXT DEFAULT NULL,
  start_date_param DATE DEFAULT NULL,
  end_date_param DATE DEFAULT NULL,
  status_param TEXT DEFAULT NULL,
  transaction_id_param TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  total_amount NUMERIC;
  needs_review_count INT;
  this_month_total NUMERIC;
  top_recipients JSON;
  current_month_start DATE;
  current_month_end DATE;
BEGIN
  -- Setup current month dates
  current_month_start := date_trunc('month', CURRENT_DATE)::DATE;
  current_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;

  -- 1. Get totals and counts
  SELECT 
    COALESCE(SUM(amount), 0),
    COUNT(*) FILTER (WHERE status = 'needs_review'),
    COALESCE(SUM(amount) FILTER (WHERE date >= current_month_start AND date <= current_month_end), 0)
  INTO total_amount, needs_review_count, this_month_total
  FROM payments
  WHERE 
    (transaction_id_param IS NULL OR transaction_id = transaction_id_param)
    AND (status_param IS NULL OR status = status_param)
    AND (start_date_param IS NULL OR date >= start_date_param)
    AND (end_date_param IS NULL OR date <= end_date_param)
    AND (search_param IS NULL OR (
       recipient_name ILIKE '%' || search_param || '%' OR
       upi_id ILIKE '%' || search_param || '%' OR
       remarks ILIKE '%' || search_param || '%'
    ));

  -- 2. Get top recipients
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO top_recipients
  FROM (
    SELECT UPPER(TRIM(recipient_name)) as name, SUM(amount) as total
    FROM payments
    WHERE recipient_name IS NOT NULL
      AND (transaction_id_param IS NULL OR transaction_id = transaction_id_param)
      AND (status_param IS NULL OR status = status_param)
      AND (start_date_param IS NULL OR date >= start_date_param)
      AND (end_date_param IS NULL OR date <= end_date_param)
      AND (search_param IS NULL OR (
         recipient_name ILIKE '%' || search_param || '%' OR
         upi_id ILIKE '%' || search_param || '%' OR
         remarks ILIKE '%' || search_param || '%'
      ))
    GROUP BY UPPER(TRIM(recipient_name))
    ORDER BY total DESC
    LIMIT 5
  ) t;

  RETURN json_build_object(
    'totalAmount', total_amount,
    'needsReviewCount', needs_review_count,
    'thisMonthTotal', this_month_total,
    'topRecipients', top_recipients
  );
END;
$$ LANGUAGE plpgsql;
