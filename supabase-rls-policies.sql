-- =====================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY) PARA O SUPABASE
-- =====================================================

-- =====================================================
-- POLÍTICAS PARA USERS
-- =====================================================

-- Usuários podem ver apenas seus próprios dados
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- Usuários podem atualizar apenas seus próprios dados
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Usuários podem inserir apenas seus próprios dados
CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- =====================================================
-- POLÍTICAS PARA WORKSPACES
-- =====================================================

-- Usuários podem ver workspaces onde são membros
CREATE POLICY "Users can view workspaces they belong to" ON workspaces
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members 
            WHERE workspace_id = workspaces.id 
            AND user_id = auth.uid()
        )
    );

-- Apenas owners podem atualizar workspaces
CREATE POLICY "Only owners can update workspaces" ON workspaces
    FOR UPDATE USING (owner_id = auth.uid());

-- Apenas usuários autenticados podem criar workspaces
CREATE POLICY "Authenticated users can create workspaces" ON workspaces
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- POLÍTICAS PARA WORKSPACE_MEMBERS
-- =====================================================

-- Usuários podem ver membros dos workspaces onde participam
CREATE POLICY "Users can view members of their workspaces" ON workspace_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = workspace_members.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- Apenas owners e admins podem gerenciar membros
CREATE POLICY "Owners and admins can manage members" ON workspace_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = workspace_members.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- POLÍTICAS PARA PROJECTS
-- =====================================================

-- Usuários podem ver projetos dos workspaces onde participam
CREATE POLICY "Users can view projects in their workspaces" ON projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members 
            WHERE workspace_id = projects.workspace_id 
            AND user_id = auth.uid()
        )
    );

-- Apenas owners, admins e criadores podem gerenciar projetos
CREATE POLICY "Authorized users can manage projects" ON projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        ) OR created_by = auth.uid()
    );

-- =====================================================
-- POLÍTICAS PARA TASK_BLOCKS
-- =====================================================

-- Usuários podem ver task blocks dos projetos onde têm acesso
CREATE POLICY "Users can view task blocks in accessible projects" ON task_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = task_blocks.project_id
            AND wm.user_id = auth.uid()
        )
    );

-- Apenas usuários autorizados podem gerenciar task blocks
CREATE POLICY "Authorized users can manage task blocks" ON task_blocks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = task_blocks.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        ) OR created_by = auth.uid()
    );

-- =====================================================
-- POLÍTICAS PARA TASKS
-- =====================================================

-- Usuários podem ver tasks dos projetos onde têm acesso
CREATE POLICY "Users can view tasks in accessible projects" ON tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM task_blocks tb
            JOIN projects p ON tb.project_id = p.id
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE tb.id = tasks.task_block_id
            AND wm.user_id = auth.uid()
        )
    );

-- Usuários podem gerenciar tasks onde são assignees ou criadores
CREATE POLICY "Users can manage assigned or created tasks" ON tasks
    FOR ALL USING (
        assigned_to = auth.uid() OR created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM task_blocks tb
            JOIN projects p ON tb.project_id = p.id
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE tb.id = tasks.task_block_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- POLÍTICAS PARA SUBTASKS
-- =====================================================

-- Usuários podem ver subtasks das tasks onde têm acesso
CREATE POLICY "Users can view subtasks of accessible tasks" ON subtasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN task_blocks tb ON t.task_block_id = tb.id
            JOIN projects p ON tb.project_id = p.id
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE t.id = subtasks.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- Usuários podem gerenciar subtasks das tasks onde têm acesso
CREATE POLICY "Users can manage subtasks of accessible tasks" ON subtasks
    FOR ALL USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN task_blocks tb ON t.task_block_id = tb.id
            JOIN projects p ON tb.project_id = p.id
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE t.id = subtasks.task_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- POLÍTICAS PARA TIME_ENTRIES
-- =====================================================

-- Usuários podem ver apenas seus próprios time entries
CREATE POLICY "Users can view own time entries" ON time_entries
    FOR SELECT USING (user_id = auth.uid());

-- Usuários podem gerenciar apenas seus próprios time entries
CREATE POLICY "Users can manage own time entries" ON time_entries
    FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA CALENDAR_EVENTS
-- =====================================================

-- Usuários podem ver eventos dos workspaces onde participam
CREATE POLICY "Users can view events in their workspaces" ON calendar_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members 
            WHERE workspace_id = calendar_events.workspace_id 
            AND user_id = auth.uid()
        )
    );

-- Apenas criadores e usuários autorizados podem gerenciar eventos
CREATE POLICY "Authorized users can manage events" ON calendar_events
    FOR ALL USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = calendar_events.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- POLÍTICAS PARA EVENT_ATTENDEES
-- =====================================================

-- Usuários podem ver attendees dos eventos onde têm acesso
CREATE POLICY "Users can view attendees of accessible events" ON event_attendees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM calendar_events ce
            JOIN workspace_members wm ON ce.workspace_id = wm.workspace_id
            WHERE ce.id = event_attendees.event_id
            AND wm.user_id = auth.uid()
        )
    );

-- Usuários podem gerenciar seus próprios atendances
CREATE POLICY "Users can manage own event attendance" ON event_attendees
    FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA NOTES
-- =====================================================

-- Usuários podem ver suas próprias notas
CREATE POLICY "Users can view own notes" ON notes
    FOR SELECT USING (user_id = auth.uid());

-- Usuários podem ver notas de tasks onde têm acesso
CREATE POLICY "Users can view notes of accessible tasks" ON notes
    FOR SELECT USING (
        task_id IS NULL OR
        EXISTS (
            SELECT 1 FROM tasks t
            JOIN task_blocks tb ON t.task_block_id = tb.id
            JOIN projects p ON tb.project_id = p.id
            JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE t.id = notes.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- Usuários podem gerenciar suas próprias notas
CREATE POLICY "Users can manage own notes" ON notes
    FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA ATTACHMENTS
-- =====================================================

-- Usuários podem ver anexos de tasks e notas onde têm acesso
CREATE POLICY "Users can view accessible attachments" ON attachments
    FOR SELECT USING (
        (task_id IS NULL OR
         EXISTS (
             SELECT 1 FROM tasks t
             JOIN task_blocks tb ON t.task_block_id = tb.id
             JOIN projects p ON tb.project_id = p.id
             JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
             WHERE t.id = attachments.task_id
             AND wm.user_id = auth.uid()
         )) AND
        (note_id IS NULL OR
         EXISTS (
             SELECT 1 FROM notes n
             WHERE n.id = attachments.note_id
             AND n.user_id = auth.uid()
         ))
    );

-- Usuários podem gerenciar anexos que fizeram upload
CREATE POLICY "Users can manage own uploads" ON attachments
    FOR ALL USING (uploaded_by = auth.uid());

-- =====================================================
-- POLÍTICAS PARA USER_PREFERENCES
-- =====================================================

-- Usuários podem ver apenas suas próprias preferências
CREATE POLICY "Users can view own preferences" ON user_preferences
    FOR SELECT USING (user_id = auth.uid());

-- Usuários podem gerenciar apenas suas próprias preferências
CREATE POLICY "Users can manage own preferences" ON user_preferences
    FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA WORKSPACE_SETTINGS
-- =====================================================

-- Usuários podem ver configurações dos workspaces onde participam
CREATE POLICY "Users can view workspace settings" ON workspace_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members 
            WHERE workspace_id = workspace_settings.workspace_id 
            AND user_id = auth.uid()
        )
    );

-- Apenas owners e admins podem gerenciar configurações do workspace
CREATE POLICY "Only owners and admins can manage workspace settings" ON workspace_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = workspace_settings.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- POLÍTICAS PARA AUDIT_LOGS
-- =====================================================

-- Apenas owners e admins podem ver logs de auditoria
CREATE POLICY "Only owners and admins can view audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = audit_logs.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Apenas o sistema pode inserir logs de auditoria
CREATE POLICY "Only system can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (false);

-- =====================================================
-- FUNÇÕES AUXILIARES PARA RLS
-- =====================================================

-- Função para verificar se usuário é membro de um workspace
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_id = workspace_uuid 
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se usuário tem role específico em um workspace
CREATE OR REPLACE FUNCTION has_workspace_role(workspace_uuid UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_id = workspace_uuid 
        AND user_id = auth.uid()
        AND role = required_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se usuário pode acessar uma task
CREATE OR REPLACE FUNCTION can_access_task(task_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM tasks t
        JOIN task_blocks tb ON t.task_block_id = tb.id
        JOIN projects p ON tb.project_id = p.id
        JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE t.id = task_uuid
        AND wm.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

