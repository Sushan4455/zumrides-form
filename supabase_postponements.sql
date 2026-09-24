-- SQL script to create schedule_overrides table in Supabase
CREATE TABLE IF NOT EXISTS schedule_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date_key TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date_key, type)
);

-- Enable RLS and add public access policies (assuming your app relies on anon keys for now)
ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on schedule_overrides" 
ON schedule_overrides FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert access on schedule_overrides" 
ON schedule_overrides FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous delete access on schedule_overrides" 
ON schedule_overrides FOR DELETE USING (true);
