CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_types (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts (id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  min_notice_minutes INTEGER NOT NULL DEFAULT 0,
  host_time_zone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  event_type_id TEXT NOT NULL REFERENCES event_types (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_local TEXT NOT NULL,
  end_local TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_overrides (
  id TEXT PRIMARY KEY,
  event_type_id TEXT NOT NULL REFERENCES event_types (id) ON DELETE CASCADE,
  on_date DATE NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (event_type_id, on_date)
);
