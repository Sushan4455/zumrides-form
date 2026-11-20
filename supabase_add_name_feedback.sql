-- Add name column to cycle_feedback table
ALTER TABLE cycle_feedback ADD COLUMN IF NOT EXISTS name text;
