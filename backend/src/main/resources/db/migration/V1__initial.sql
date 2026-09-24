CREATE TABLE runs (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  finished_at VARCHAR(40),
  config_json TEXT NOT NULL,
  total_items INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  message VARCHAR(1000)
);
CREATE TABLE items (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL REFERENCES runs(id),
  source_index INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  language VARCHAR(16) NOT NULL,
  translation TEXT NOT NULL,
  decision VARCHAR(24) NOT NULL,
  self_decision VARCHAR(24),
  findings_json TEXT NOT NULL,
  audit_sample BOOLEAN NOT NULL DEFAULT FALSE,
  independent_check BOOLEAN NOT NULL DEFAULT FALSE,
  expected_label VARCHAR(12),
  UNIQUE (run_id, source_index, language)
);
CREATE INDEX items_run ON items(run_id, source_index, language);
CREATE INDEX items_decision ON items(run_id, decision);
CREATE TABLE calls (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL REFERENCES runs(id),
  stage VARCHAR(20) NOT NULL,
  model VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  input_tokens BIGINT,
  cached_tokens BIGINT,
  output_tokens BIGINT,
  reasoning_tokens BIGINT,
  cost_usd DECIMAL(20,10),
  reserved_usd DECIMAL(20,10) NOT NULL,
  input_rate DECIMAL(14,6) NOT NULL,
  cached_rate DECIMAL(14,6) NOT NULL,
  output_rate DECIMAL(14,6) NOT NULL,
  price_version VARCHAR(40) NOT NULL,
  response_id VARCHAR(150),
  request_id VARCHAR(150),
  error VARCHAR(500)
);
CREATE INDEX calls_run ON calls(run_id, created_at);
CREATE TABLE reviews (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL REFERENCES items(id),
  reviewer VARCHAR(100) NOT NULL,
  verdict VARCHAR(20) NOT NULL,
  note VARCHAR(2000) NOT NULL,
  created_at VARCHAR(40) NOT NULL
);
CREATE INDEX reviews_item ON reviews(item_id, created_at);
