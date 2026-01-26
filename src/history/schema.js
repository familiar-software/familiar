const ensureHistorySchema = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_flows (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      last_event_id TEXT,
      context_folder_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_history_flows_updated_at
      ON history_flows(updated_at);

    CREATE TABLE IF NOT EXISTS history_events (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      step TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      detail TEXT,
      source_path TEXT,
      output_path TEXT,
      error_code TEXT,
      error_message TEXT,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_history_events_flow_id_created_at
      ON history_events(flow_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_history_events_created_at
      ON history_events(created_at);
  `);
};

module.exports = {
  ensureHistorySchema,
};
