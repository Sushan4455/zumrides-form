-- Add status column to maintenance table
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS status text DEFAULT 'Fixed (Ready to Deploy)';
