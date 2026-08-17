-- 1. First, delete all the existing duplicate rows
DELETE FROM public.machine_locations
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
    ROW_NUMBER() OVER( PARTITION BY machine_id, timestamp, status ORDER BY created_at ) as row_num
    FROM public.machine_locations
  ) t
  WHERE t.row_num > 1
);

-- 2. Add a UNIQUE constraint so duplicates are impossible in the future
ALTER TABLE public.machine_locations
ADD CONSTRAINT unique_machine_event UNIQUE (machine_id, timestamp, status);
