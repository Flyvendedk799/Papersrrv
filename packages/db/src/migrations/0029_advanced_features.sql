-- Phase 10: File locks for exclusive file editing
CREATE TABLE IF NOT EXISTS file_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  file_path TEXT NOT NULL,
  reason TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS file_locks_company_path_idx ON file_locks(company_id, file_path);
CREATE INDEX IF NOT EXISTS file_locks_agent_idx ON file_locks(agent_id);
CREATE INDEX IF NOT EXISTS file_locks_expires_idx ON file_locks(expires_at);

-- Phase 11: Agent-to-agent messaging
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID NOT NULL REFERENCES agents(id),
  channel TEXT NOT NULL DEFAULT 'direct',
  subject TEXT,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_messages_to_agent_idx ON agent_messages(to_agent_id, created_at);
CREATE INDEX IF NOT EXISTS agent_messages_from_agent_idx ON agent_messages(from_agent_id, created_at);
CREATE INDEX IF NOT EXISTS agent_messages_company_channel_idx ON agent_messages(company_id, channel);

-- Phase 11: Agent capabilities registry
CREATE TABLE IF NOT EXISTS agent_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  capability TEXT NOT NULL,
  proficiency TEXT NOT NULL DEFAULT 'moderate',
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_capabilities_agent_cap_idx ON agent_capabilities(agent_id, capability);
CREATE INDEX IF NOT EXISTS agent_capabilities_company_cap_idx ON agent_capabilities(company_id, capability);

-- Phase 11: Agent task outcomes for learning and auto-routing
CREATE TABLE IF NOT EXISTS agent_task_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  issue_id UUID REFERENCES issues(id),
  run_id UUID REFERENCES heartbeat_runs(id),
  task_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  duration_ms INTEGER,
  cost_cents INTEGER,
  labels JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_outcomes_agent_type_idx ON agent_task_outcomes(agent_id, task_type);
CREATE INDEX IF NOT EXISTS agent_task_outcomes_company_type_idx ON agent_task_outcomes(company_id, task_type);
CREATE INDEX IF NOT EXISTS agent_task_outcomes_issue_idx ON agent_task_outcomes(issue_id);

-- Phase 11: Knowledge base entries
CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  created_by_agent_id UUID REFERENCES agents(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags JSONB DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'company',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_company_category_idx ON knowledge_base_entries(company_id, category);
CREATE INDEX IF NOT EXISTS kb_company_search_idx ON knowledge_base_entries(company_id, created_at);

-- Phase 12: Immutable audit log
CREATE TABLE IF NOT EXISTS audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_company_action_idx ON audit_log_entries(company_id, action, created_at);
CREATE INDEX IF NOT EXISTS audit_log_company_created_idx ON audit_log_entries(company_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log_entries(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log_entries(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_log_severity_idx ON audit_log_entries(company_id, severity);

-- Optional: Enable pg_trgm for fuzzy file path search (Phase 10)
-- Uncomment if pg_trgm extension is available:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_snapshots_path_trgm ON agent_file_snapshots USING gin (file_path gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_kb_title_trgm ON knowledge_base_entries USING gin (title gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_kb_content_trgm ON knowledge_base_entries USING gin (content gin_trgm_ops);
