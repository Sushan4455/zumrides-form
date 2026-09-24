-- SQL script to create battery_swaps table in Supabase
DROP TABLE IF EXISTS battery_swaps;

CREATE TABLE battery_swaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_name TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    battery_id TEXT NOT NULL,
    in_voltage NUMERIC,
    in_percentage NUMERIC,
    in_time TEXT,
    out_voltage NUMERIC,
    out_percentage NUMERIC,
    out_time TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add public access policies
ALTER TABLE battery_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on battery_swaps" 
ON battery_swaps FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert access on battery_swaps" 
ON battery_swaps FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous delete access on battery_swaps" 
ON battery_swaps FOR DELETE USING (true);
