-- Enable open access for all 3 tables (since this is an internal staff app)

-- Tasks table
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all inserts on tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all reads on tasks" ON tasks FOR SELECT USING (true);

-- Maintenance table
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all inserts on maintenance" ON maintenance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all reads on maintenance" ON maintenance FOR SELECT USING (true);

-- Assignments table
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all inserts on assignments" ON assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all reads on assignments" ON assignments FOR SELECT USING (true);
