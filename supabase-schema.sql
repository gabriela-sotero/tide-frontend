-- =====================================================
-- SCHEMA NORMALIZADO PARA O PLANNER - SUPABASE
-- =====================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELAS PRINCIPAIS
-- =====================================================

-- 1. USERS (usuários do sistema)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en-US',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. WORKSPACES (espaços de trabalho/empresas)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. WORKSPACE_MEMBERS (membros dos workspaces)
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- =====================================================
-- TABELAS DE TASKS E PROJETOS
-- =====================================================

-- 4. PROJECTS (projetos principais)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#1976d2',
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'on-hold')),
    start_date DATE,
    end_date DATE,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TASK_BLOCKS (blocos de tasks - como implementado no frontend)
CREATE TABLE task_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) NOT NULL,
    order_index INTEGER DEFAULT 0,
    is_expanded BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TASKS (tasks individuais)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_block_id UUID REFERENCES task_blocks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    energy_level INTEGER DEFAULT 1 CHECK (energy_level BETWEEN 1 AND 5),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    start_date DATE,
    end_date DATE,
    due_date DATE,
    assigned_to UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. SUBTASKS (subtasks das tasks principais)
CREATE TABLE subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELAS DE TEMPO E AGENDA
-- =====================================================

-- 8. TIME_ENTRIES (registros de tempo trabalhado)
CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. CALENDAR_EVENTS (eventos do calendário)
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    is_all_day BOOLEAN DEFAULT false,
    location TEXT,
    color VARCHAR(7) DEFAULT '#1976d2',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. EVENT_ATTENDEES (participantes dos eventos)
CREATE TABLE event_attendees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'tentative')),
    response_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(event_id, user_id)
);

-- =====================================================
-- TABELAS DE NOTAS E DOCUMENTOS
-- =====================================================

-- 11. NOTES (notas diárias e de tasks)
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT NOT NULL,
    note_date DATE DEFAULT CURRENT_DATE,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. ATTACHMENTS (anexos para tasks e notas)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (
        (task_id IS NOT NULL AND note_id IS NULL) OR 
        (task_id IS NULL AND note_id IS NOT NULL)
    )
);

-- =====================================================
-- TABELAS DE CONFIGURAÇÕES E PREFERÊNCIAS
-- =====================================================

-- 13. USER_PREFERENCES (preferências do usuário)
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    default_view VARCHAR(20) DEFAULT 'weekly' CHECK (default_view IN ('monthly', 'weekly', 'daily', 'tasks')),
    week_starts_on INTEGER DEFAULT 1 CHECK (week_starts_on IN (0, 1)), -- 0 = Sunday, 1 = Monday
    working_hours JSONB DEFAULT '{"start": "09:00", "end": "17:00"}',
    notification_settings JSONB DEFAULT '{"email": true, "push": true, "sms": false}',
    theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 14. WORKSPACE_SETTINGS (configurações do workspace)
CREATE TABLE workspace_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    default_task_status VARCHAR(50) DEFAULT 'pending',
    default_task_priority VARCHAR(20) DEFAULT 'medium',
    task_auto_assign BOOLEAN DEFAULT false,
    time_tracking_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id)
);

-- =====================================================
-- TABELAS DE AUDITORIA E LOGS
-- =====================================================

-- 15. AUDIT_LOGS (logs de auditoria)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices para consultas frequentes
CREATE INDEX idx_tasks_task_block_id ON tasks(task_block_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_dates ON tasks(start_date, end_date);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_calendar_events_dates ON calendar_events(start_datetime, end_datetime);
CREATE INDEX idx_notes_task_id ON notes(task_id);
CREATE INDEX idx_notes_date ON notes(note_date);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);

-- Índices para full-text search
CREATE INDEX idx_tasks_name_search ON tasks USING gin(to_tsvector('english', name));
CREATE INDEX idx_notes_content_search ON notes USING gin(to_tsvector('english', content));

-- =====================================================
-- FUNÇÕES E TRIGGERS
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_blocks_updated_at BEFORE UPDATE ON task_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subtasks_updated_at BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspace_settings_updated_at BEFORE UPDATE ON workspace_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =====================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- COMENTÁRIOS DAS TABELAS
-- =====================================================

COMMENT ON TABLE users IS 'Usuários do sistema';
COMMENT ON TABLE workspaces IS 'Espaços de trabalho/empresas';
COMMENT ON TABLE workspace_members IS 'Membros dos workspaces com suas permissões';
COMMENT ON TABLE projects IS 'Projetos principais';
COMMENT ON TABLE task_blocks IS 'Blocos de tasks (como implementado no frontend)';
COMMENT ON TABLE tasks IS 'Tasks individuais com status, prioridade e energia';
COMMENT ON TABLE subtasks IS 'Subtasks das tasks principais';
COMMENT ON TABLE time_entries IS 'Registros de tempo trabalhado nas tasks';
COMMENT ON TABLE calendar_events IS 'Eventos do calendário';
COMMENT ON TABLE event_attendees IS 'Participantes dos eventos';
COMMENT ON TABLE notes IS 'Notas diárias e de tasks';
COMMENT ON TABLE attachments IS 'Anexos para tasks e notas';
COMMENT ON TABLE user_preferences IS 'Preferências do usuário';
COMMENT ON TABLE workspace_settings IS 'Configurações do workspace';
COMMENT ON TABLE audit_logs IS 'Logs de auditoria para compliance';

-- =====================================================
-- DADOS INICIAIS DE EXEMPLO
-- =====================================================

-- Inserir usuário de exemplo
INSERT INTO users (id, email, full_name) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'admin@example.com', 'Admin User');

-- Inserir workspace de exemplo
INSERT INTO workspaces (id, name, slug, owner_id) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'Example Workspace', 'example', '550e8400-e29b-41d4-a716-446655440000');

-- Inserir membro do workspace
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES 
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'owner');

-- Inserir projeto de exemplo
INSERT INTO projects (id, workspace_id, name, description, color, created_by) VALUES 
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'Example Project', 'A sample project for demonstration', '#1976d2', '550e8400-e29b-41d4-a716-446655440000');

-- Inserir blocos de tasks de exemplo
INSERT INTO task_blocks (id, project_id, name, color, created_by) VALUES 
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 'BLOCK 1', '#A8D5BA', '550e8400-e29b-41d4-a716-446655440000'),
('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'BLOCK 2', '#D4A5A5', '550e8400-e29b-41d4-a716-446655440000'),
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', 'BLOCK 3', '#B8D4F0', '550e8400-e29b-41d4-a716-446655440000');

-- Inserir tasks de exemplo
INSERT INTO tasks (id, task_block_id, name, status, energy_level, start_date, end_date, created_by) VALUES 
('550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', 'TASK 1.1', 'completed', 2, '2025-01-01', '2025-01-02', '550e8400-e29b-41d4-a716-446655440000'),
('550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440003', 'TASK 1.2', 'completed', 3, '2025-01-01', '2025-01-01', '550e8400-e29b-41d4-a716-446655440000'),
('550e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 'TASK 2.1', 'pending', 1, '2025-01-03', '2025-01-04', '550e8400-e29b-41d4-a716-446655440000');

-- Inserir preferências do usuário
INSERT INTO user_preferences (user_id, default_view, week_starts_on) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'weekly', 1);

-- Inserir configurações do workspace
INSERT INTO workspace_settings (workspace_id, time_tracking_enabled) VALUES 
('550e8400-e29b-41d4-a716-446655440001', true);

