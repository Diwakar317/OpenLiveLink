CREATE TABLE IF NOT EXISTS public.active_dates (
    active_date DATE PRIMARY KEY
);

-- Enable RLS and create policy for public read access
ALTER TABLE public.active_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on active_dates" 
ON public.active_dates FOR SELECT USING (true);
