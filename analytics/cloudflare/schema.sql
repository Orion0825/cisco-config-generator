CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  day TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  title TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_site_day ON visits(site, day);
CREATE INDEX IF NOT EXISTS idx_visits_site_day_visitor ON visits(site, day, visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
