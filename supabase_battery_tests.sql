-- SQL script to create battery_tests table in Supabase
CREATE TABLE IF NOT EXISTS battery_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_name TEXT NOT NULL,
    battery_id TEXT NOT NULL,
    actual_battery_percentage NUMERIC,
    actual_voltage NUMERIC,
    status TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    before_battery_percentage NUMERIC,
    before_voltage NUMERIC,
    odometer TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add public access policies
ALTER TABLE battery_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on battery_tests" 
ON battery_tests FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert access on battery_tests" 
ON battery_tests FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous delete access on battery_tests" 
ON battery_tests FOR DELETE USING (true);
