-- Migration to add result_type column for distinguishing regular vs supplementary results

-- Add result_type column with check constraint
ALTER TABLE results 
ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT 'regular' CHECK (result_type IN ('regular', 'supplementary'));

-- Add comment to document the column
COMMENT ON COLUMN results.result_type IS 'Type of result: regular (normal semester) or supplementary (resit/remedial)';

-- Create index for filtering by result type
CREATE INDEX IF NOT EXISTS idx_results_type ON results(result_type);
