-- 1. Tasks Table (Routine, Pre-Task, Overall, Station)
CREATE TABLE tasks (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  task_type text not null,
  cycle_id text,
  battery_id text,
  condition text,
  issue text,
  parts_checked text,
  staff_name text not null,
  station_name text,
  odometer text
);

-- 2. Maintenance Table
CREATE TABLE maintenance (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  cycle_id text not null,
  fix_description text not null,
  staff_name text not null
);

-- 3. Assignments Table
CREATE TABLE assignments (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  staff_name text not null,
  cycles text not null
);
