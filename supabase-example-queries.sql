-- =====================================================
-- EXEMPLOS DE QUERIES SQL PARA O SUPABASE
-- =====================================================

-- =====================================================
-- QUERIES DE TASKS E PROJETOS
-- =====================================================

-- 1. Buscar todas as tasks de um usuário com detalhes completos
SELECT 
    t.id,
    t.name as task_name,
    t.status,
    t.priority,
    t.energy_level,
    t.start_date,
    t.end_date,
    tb.name as block_name,
    tb.color as block_color,
    p.name as project_name,
    u.full_name as assigned_to_name,
    creator.full_name as created_by_name
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
LEFT JOIN users u ON t.assigned_to = u.id
LEFT JOIN users creator ON t.created_by = creator.id
WHERE t.assigned_to = auth.uid()
ORDER BY t.start_date, t.priority DESC;

-- 2. Buscar tasks por status e workspace
SELECT 
    t.name,
    t.status,
    t.priority,
    t.energy_level,
    tb.name as block_name,
    p.name as project_name
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND t.status = 'pending'
ORDER BY t.priority DESC, t.energy_level DESC;

-- 3. Buscar tasks com subtasks completas
SELECT 
    t.name as task_name,
    t.status as task_status,
    COUNT(st.id) as total_subtasks,
    COUNT(CASE WHEN st.is_completed THEN 1 END) as completed_subtasks,
    ROUND(
        (COUNT(CASE WHEN st.is_completed THEN 1 END)::DECIMAL / COUNT(st.id)::DECIMAL) * 100, 2
    ) as completion_percentage
FROM tasks t
LEFT JOIN subtasks st ON t.id = st.task_id
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
GROUP BY t.id, t.name, t.status
ORDER BY completion_percentage DESC;

-- 4. Buscar tasks por período (para visão semanal)
SELECT 
    t.id,
    t.name,
    t.status,
    t.energy_level,
    t.start_date,
    t.end_date,
    tb.name as block_name,
    tb.color as block_color
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND (
        (t.start_date <= '2025-01-05' AND t.end_date >= '2025-01-01') OR
        (t.start_date BETWEEN '2025-01-01' AND '2025-01-05') OR
        (t.end_date BETWEEN '2025-01-01' AND '2025-01-05')
    )
ORDER BY t.start_date, tb.order_index;

-- =====================================================
-- QUERIES DE CALENDÁRIO E EVENTOS
-- =====================================================

-- 5. Buscar eventos de um período específico
SELECT 
    ce.title,
    ce.description,
    ce.start_datetime,
    ce.end_datetime,
    ce.is_all_day,
    ce.location,
    ce.color,
    creator.full_name as created_by_name,
    COUNT(ea.user_id) as total_attendees,
    COUNT(CASE WHEN ea.status = 'accepted' THEN 1 END) as accepted_attendees
FROM calendar_events ce
LEFT JOIN users creator ON ce.created_by = creator.id
LEFT JOIN event_attendees ea ON ce.id = ea.event_id
JOIN workspace_members wm ON ce.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND ce.start_datetime >= '2025-01-01 00:00:00'
    AND ce.start_datetime < '2025-02-01 00:00:00'
GROUP BY ce.id, ce.title, ce.description, ce.start_datetime, ce.end_datetime, ce.is_all_day, ce.location, ce.color, creator.full_name
ORDER BY ce.start_datetime;

-- 6. Buscar eventos onde o usuário é attendee
SELECT 
    ce.title,
    ce.start_datetime,
    ce.end_datetime,
    ea.status as attendance_status,
    w.name as workspace_name
FROM calendar_events ce
JOIN event_attendees ea ON ce.id = ea.event_id
JOIN workspaces w ON ce.workspace_id = w.id
WHERE ea.user_id = auth.uid()
    AND ea.status IN ('accepted', 'tentative')
    AND ce.start_datetime >= NOW()
ORDER BY ce.start_datetime;

-- =====================================================
-- QUERIES DE TEMPO E PRODUTIVIDADE
-- =====================================================

-- 7. Resumo de tempo trabalhado por task
SELECT 
    t.name as task_name,
    tb.name as block_name,
    p.name as project_name,
    SUM(te.duration_minutes) as total_minutes,
    ROUND(SUM(te.duration_minutes) / 60.0, 2) as total_hours,
    COUNT(te.id) as time_entries_count,
    AVG(te.duration_minutes) as avg_duration_minutes
FROM time_entries te
JOIN tasks t ON te.task_id = t.id
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
WHERE te.user_id = auth.uid()
    AND te.start_time >= '2025-01-01 00:00:00'
    AND te.start_time < '2025-02-01 00:00:00'
GROUP BY t.id, t.name, tb.name, p.name
ORDER BY total_minutes DESC;

-- 8. Produtividade diária (últimos 30 dias)
SELECT 
    DATE(te.start_time) as work_date,
    COUNT(DISTINCT te.task_id) as tasks_worked_on,
    SUM(te.duration_minutes) as total_minutes,
    ROUND(SUM(te.duration_minutes) / 60.0, 2) as total_hours
FROM time_entries te
WHERE te.user_id = auth.uid()
    AND te.start_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(te.start_time)
ORDER BY work_date DESC;

-- 9. Análise de energia vs tempo real
SELECT 
    t.energy_level,
    COUNT(t.id) as total_tasks,
    ROUND(AVG(COALESCE(te.duration_minutes, 0)), 2) as avg_duration_minutes,
    ROUND(AVG(COALESCE(te.duration_minutes, 0)) / 60.0, 2) as avg_duration_hours,
    ROUND(
        (COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::DECIMAL / COUNT(t.id)::DECIMAL) * 100, 2
    ) as completion_rate
FROM tasks t
LEFT JOIN time_entries te ON t.id = te.task_id
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
GROUP BY t.energy_level
ORDER BY t.energy_level;

-- =====================================================
-- QUERIES DE NOTAS E DOCUMENTOS
-- =====================================================

-- 10. Buscar notas por data com contexto da task
SELECT 
    n.title,
    n.content,
    n.note_date,
    n.is_pinned,
    t.name as task_name,
    tb.name as block_name,
    p.name as project_name
FROM notes n
LEFT JOIN tasks t ON n.task_id = t.id
LEFT JOIN task_blocks tb ON t.task_block_id = tb.id
LEFT JOIN projects p ON tb.project_id = p.id
WHERE n.user_id = auth.uid()
    AND n.note_date >= '2025-01-01'
    AND n.note_date <= '2025-01-31'
ORDER BY n.is_pinned DESC, n.note_date DESC, n.created_at DESC;

-- 11. Buscar anexos por tipo de arquivo
SELECT 
    a.filename,
    a.file_size,
    a.mime_type,
    a.created_at,
    CASE 
        WHEN a.task_id IS NOT NULL THEN 'Task'
        WHEN a.note_id IS NOT NULL THEN 'Note'
    END as attachment_type,
    COALESCE(t.name, n.title) as parent_name
FROM attachments a
LEFT JOIN tasks t ON a.task_id = t.id
LEFT JOIN notes n ON a.note_id = n.id
WHERE a.uploaded_by = auth.uid()
    AND a.mime_type LIKE 'image/%'
ORDER BY a.created_at DESC;

-- =====================================================
-- QUERIES DE RELATÓRIOS E DASHBOARD
-- =====================================================

-- 12. Dashboard geral do workspace
SELECT 
    -- Estatísticas de projetos
    COUNT(DISTINCT p.id) as total_projects,
    COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
    COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) as completed_projects,
    
    -- Estatísticas de tasks
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'in-progress' THEN t.id END) as in_progress_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
    
    -- Estatísticas de tempo
    ROUND(SUM(COALESCE(te.duration_minutes, 0)) / 60.0, 2) as total_hours_logged,
    COUNT(DISTINCT te.user_id) as users_with_time_entries
    
FROM projects p
LEFT JOIN task_blocks tb ON p.id = tb.project_id
LEFT JOIN tasks t ON tb.id = t.task_block_id
LEFT JOIN time_entries te ON t.id = te.task_id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001';

-- 13. Relatório de produtividade por usuário (apenas para admins/owners)
SELECT 
    u.full_name,
    COUNT(DISTINCT t.id) as total_tasks_assigned,
    COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
    ROUND(
        (COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)::DECIMAL / 
         COUNT(DISTINCT t.id)::DECIMAL) * 100, 2
    ) as completion_rate,
    ROUND(SUM(COALESCE(te.duration_minutes, 0)) / 60.0, 2) as total_hours_logged,
    COUNT(DISTINCT te.id) as time_entries_count
FROM users u
LEFT JOIN tasks t ON u.id = t.assigned_to
LEFT JOIN time_entries te ON u.id = te.user_id
JOIN workspace_members wm ON u.id = wm.user_id
WHERE wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND wm.user_id = auth.uid()
    AND wm.role IN ('owner', 'admin')
GROUP BY u.id, u.full_name
ORDER BY completion_rate DESC, total_hours_logged DESC;

-- 14. Análise de tendências mensais
SELECT 
    DATE_TRUNC('month', t.start_date) as month,
    COUNT(t.id) as tasks_started,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as tasks_completed,
    ROUND(
        (COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::DECIMAL / COUNT(t.id)::DECIMAL) * 100, 2
    ) as completion_rate,
    ROUND(AVG(t.energy_level), 2) as avg_energy_level,
    ROUND(SUM(COALESCE(te.duration_minutes, 0)) / 60.0, 2) as total_hours_logged
FROM tasks t
LEFT JOIN time_entries te ON t.id = te.task_id
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND t.start_date >= '2024-01-01'
GROUP BY DATE_TRUNC('month', t.start_date)
ORDER BY month DESC;

-- =====================================================
-- QUERIES DE BUSCA FULL-TEXT
-- =====================================================

-- 15. Busca em tasks por nome e descrição
SELECT 
    t.name,
    t.description,
    t.status,
    tb.name as block_name,
    p.name as project_name,
    ts_rank(
        to_tsvector('english', t.name || ' ' || COALESCE(t.description, '')),
        plainto_tsquery('english', 'design system')
    ) as relevance_rank
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND to_tsvector('english', t.name || ' ' || COALESCE(t.description, '')) @@ 
        plainto_tsquery('english', 'design system')
ORDER BY relevance_rank DESC;

-- 16. Busca em notas por conteúdo
SELECT 
    n.title,
    n.content,
    n.note_date,
    COALESCE(t.name, 'Personal Note') as context,
    ts_rank(
        to_tsvector('english', n.content),
        plainto_tsquery('english', 'meeting notes')
    ) as relevance_rank
FROM notes n
LEFT JOIN tasks t ON n.task_id = t.id
WHERE n.user_id = auth.uid()
    AND to_tsvector('english', n.content) @@ 
        plainto_tsquery('english', 'meeting notes')
ORDER BY relevance_rank DESC, n.note_date DESC;

-- =====================================================
-- QUERIES DE MANUTENÇÃO E LIMPEZA
-- =====================================================

-- 17. Tasks sem atividade por mais de 30 dias
SELECT 
    t.id,
    t.name,
    t.status,
    t.start_date,
    tb.name as block_name,
    p.name as project_name,
    EXTRACT(DAYS FROM NOW() - t.updated_at) as days_inactive
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND t.status NOT IN ('completed', 'cancelled')
    AND t.updated_at < NOW() - INTERVAL '30 days'
ORDER BY days_inactive DESC;

-- 18. Time entries sem descrição (para limpeza)
SELECT 
    te.id,
    te.start_time,
    te.end_time,
    te.duration_minutes,
    t.name as task_name
FROM time_entries te
JOIN tasks t ON te.task_id = t.id
WHERE te.user_id = auth.uid()
    AND (te.description IS NULL OR te.description = '')
    AND te.start_time < NOW() - INTERVAL '7 days'
ORDER BY te.start_time DESC;

-- =====================================================
-- QUERIES DE EXPORTAÇÃO PARA RELATÓRIOS
-- =====================================================

-- 19. Exportar tasks para CSV (formato de exemplo)
SELECT 
    t.name as "Task Name",
    tb.name as "Block",
    p.name as "Project",
    t.status as "Status",
    t.priority as "Priority",
    t.energy_level as "Energy Level",
    t.start_date as "Start Date",
    t.end_date as "End Date",
    t.due_date as "Due Date",
    u.full_name as "Assigned To",
    creator.full_name as "Created By",
    t.created_at as "Created At",
    t.updated_at as "Updated At"
FROM tasks t
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
LEFT JOIN users u ON t.assigned_to = u.id
LEFT JOIN users creator ON t.created_by = creator.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
ORDER BY t.start_date, tb.order_index, t.priority DESC;

-- 20. Exportar time tracking para CSV
SELECT 
    u.full_name as "User",
    t.name as "Task",
    tb.name as "Block",
    p.name as "Project",
    te.start_time as "Start Time",
    te.end_time as "End Time",
    te.duration_minutes as "Duration (minutes)",
    ROUND(te.duration_minutes / 60.0, 2) as "Duration (hours)",
    te.description as "Description",
    te.created_at as "Logged At"
FROM time_entries te
JOIN users u ON te.user_id = u.id
JOIN tasks t ON te.task_id = t.id
JOIN task_blocks tb ON t.task_block_id = tb.id
JOIN projects p ON tb.project_id = p.id
JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
WHERE wm.user_id = auth.uid()
    AND wm.workspace_id = '550e8400-e29b-41d4-a716-446655440001'
    AND te.start_time >= '2025-01-01'
    AND te.start_time < '2025-02-01'
ORDER BY te.start_time;

