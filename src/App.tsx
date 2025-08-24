import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  IconButton, 
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Chip,
  InputAdornment,
  Tooltip
} from '@mui/material';
import { 
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  DragIndicator as DragIndicatorIcon,
  Settings as SettingsIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import './App.css';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'backlog' | 'to-do' | 'in-progress' | 'done';
  type: string;
  createdAt: Date;
  dueDate?: Date;
}

interface TaskType {
  id: string;
  name: string;
  color: string;
  expanded: boolean;
  tasks: Task[];
}

type KanbanColumn = 'backlog' | 'to-do' | 'in-progress' | 'done';

// IndexedDB setup
const DB_NAME = 'tide';
const DB_VERSION = 1;
const STORE_NAME = 'boards';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const saveBoard = (board: { taskTypes: TaskType[] }) => {
  initDB().then(db => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const boardData = { 
      id: 'main', 
      taskTypes: board.taskTypes, 
      lastUpdated: new Date().toISOString() 
    };
    
    store.put(boardData);
    console.log('Board saved to IndexedDB');
  }).catch(error => {
    console.error('Error initializing DB:', error);
  });
};

const loadBoard = (): Promise<{ taskTypes: TaskType[] } | null> => {
  return new Promise((resolve) => {
    initDB().then(db => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get('main');
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.taskTypes && Array.isArray(result.taskTypes)) {
          resolve({ taskTypes: result.taskTypes });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('Error loading board:', request.error);
        resolve(null);
      };
    }).catch(error => {
      console.error('Error initializing DB:', error);
      resolve(null);
    });
  });
};

function App() {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const columns = [
    { id: 'backlog', name: 'backlog', bgColor: '#e2e8f0', color: '#4a5568' },
    { id: 'to-do', name: 'to do', bgColor: '#e2e8f0', color: '#4a5568' },
    { id: 'in-progress', name: 'in progress', bgColor: '#e2e8f0', color: '#4a5568' },
    { id: 'done', name: 'done', bgColor: '#e2e8f0', color: '#4a5568' }
  ];

  // State for column reordering
  const [columnOrder, setColumnOrder] = useState<KanbanColumn[]>(['backlog', 'to-do', 'in-progress', 'done']);

  // Column reordering functions
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.dataTransfer.setData('text/plain', columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const draggedColumnId = e.dataTransfer.getData('text/plain') as KanbanColumn;
    
    if (draggedColumnId === targetColumnId) return;
    
    const draggedIndex = columnOrder.indexOf(draggedColumnId);
    const targetIndex = columnOrder.indexOf(targetColumnId as KanbanColumn);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newColumnOrder = [...columnOrder];
    const [draggedColumn] = newColumnOrder.splice(draggedIndex, 1);
    newColumnOrder.splice(targetIndex, 0, draggedColumn);
    
    setColumnOrder(newColumnOrder);
  };

  // Helper function to get column by id
  const getColumnById = (id: string) => columns.find(col => col.id === id);

  const [openTaskDialog, setOpenTaskDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [openBlocksDialog, setOpenBlocksDialog] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TaskType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Helper function to get today's date in local timezone
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return new Date(`${year}-${month}-${day}`);
  };

  const [newTask, setNewTask] = useState<Task>({
    id: '',
    title: '',
    description: '',
    priority: 'medium',
    status: 'backlog',
    type: '',
    createdAt: new Date(),
    dueDate: getTodayDate()
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedBlockForNewTask, setSelectedBlockForNewTask] = useState<string>('feature');
  const [backlogExpanded, setBacklogExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState<'yearly' | 'kanban'>('yearly');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load board from IndexedDB on component mount
  useEffect(() => {
    loadBoard().then(savedBoard => {
      if (savedBoard) {
        setTaskTypes(savedBoard.taskTypes);
      }
    }).catch(error => {
      console.error('Failed to load board:', error);
    });
  }, []);

  // Save board to IndexedDB whenever taskTypes changes
  useEffect(() => {
    if (taskTypes.length > 0) {
      saveBoard({ taskTypes });
    }
  }, [taskTypes]);

  const toggleTypeExpansion = (typeId: string) => {
    setTaskTypes(prev => prev.map(type => 
      type.id === typeId ? { ...type, expanded: !type.expanded } : type
    ));
  };

  const toggleBacklogExpansion = () => {
    const newExpandedState = !backlogExpanded;
    setBacklogExpanded(newExpandedState);
    setTaskTypes(prev => prev.map(type => ({ ...type, expanded: newExpandedState })));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#e53e3e';
      case 'medium': return '#ffb366';
      case 'low': return '#52c396';
      default: return '#a8b5d1';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return '#a8b5d1';
      case 'to-do': return '#ffb366';
      case 'in-progress': return '#4a9eff';
      case 'done': return '#52c396';
      default: return '#a8b5d1';
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setNewTask({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      type: task.type,
      createdAt: task.createdAt,
      dueDate: task.dueDate || new Date('2025-01-01')
    });
    setIsEditing(true);
    setOpenTaskDialog(true);
  };

  const handleAddTask = (blockType?: string) => {
    setNewTask({
      id: '',
      title: '',
      description: '',
      priority: 'medium',
      status: 'backlog',
      type: blockType || (taskTypes.length > 0 ? taskTypes[0].id : ''),
      createdAt: new Date(),
      dueDate: getTodayDate()
    });
    setSelectedTask(null);
    setIsEditing(true);
    setOpenTaskDialog(true);
  };

  const handleCloseTaskDialog = () => {
    setOpenTaskDialog(false);
    setSelectedTask(null);
    setIsEditing(false);
    setNewTask({
      id: '',
      title: '',
      description: '',
      priority: 'medium',
      status: 'backlog',
      type: '',
      createdAt: new Date(),
      dueDate: getTodayDate()
    });
  };

  const handleSaveTask = () => {
    if (!newTask.title.trim() || !newTask.type) return;
    
    if (selectedTask) {
      // Update existing task
      const updatedTask: Task = {
        ...newTask,
        id: selectedTask.id,
        createdAt: selectedTask.createdAt,
        dueDate: newTask.dueDate || getTodayDate()
      };
      
      setTaskTypes(prev => prev.map(type => ({
        ...type,
        tasks: type.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
      })));
    } else {
      // Add new task
      const newTaskToAdd: Task = {
        ...newTask,
        id: Date.now().toString(),
        createdAt: new Date(),
        dueDate: newTask.dueDate || getTodayDate()
      };
      
      setTaskTypes(prev => prev.map(type => 
        type.id === newTaskToAdd.type 
          ? { ...type, tasks: [...type.tasks, newTaskToAdd] }
          : type
      ));
    }
    
    handleCloseTaskDialog();
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(true);
    setOpenTaskDialog(true);
  };

  const handleUpdateTask = () => {
    if (!selectedTask || !selectedTask.title.trim()) return;

    setTaskTypes(prev => prev.map(type => ({
      ...type,
      tasks: type.tasks.map(t => 
        t.id === selectedTask.id ? selectedTask : t
      )
    })));

    handleCloseTaskDialog();
  };

  const handleDeleteTask = (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      setTaskTypes(prev => prev.map(type => ({
        ...type,
        tasks: type.tasks.filter(t => t.id !== taskId)
      })));
    }
  };

  const handleOpenBlocksDialog = () => {
    setOpenBlocksDialog(true);
    setEditingBlock(null);
  };

  const handleCloseBlocksDialog = () => {
    setOpenBlocksDialog(false);
    setEditingBlock(null);
  };

  const handleAddBlock = () => {
    if (!newTask.type.trim()) return;
    
    const newBlock: TaskType = {
      id: Date.now().toString(),
      name: newTask.type,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      tasks: [],
      expanded: true
    };
    
    setTaskTypes(prev => [...prev, newBlock]);
    setNewTask({ ...newTask, type: '' });
  };

  const handleEditBlock = (block: TaskType) => {
    setEditingBlock({ ...block });
  };

  const handleDeleteBlock = (blockId: string) => {
    const block = taskTypes.find(b => b.id === blockId);
    if (block && block.tasks.length > 0) {
      alert('cannot delete block with existing tasks');
      return;
    }
    
    setTaskTypes(prev => prev.filter(b => b.id !== blockId));
  };

  const handleSaveBlock = () => {
    if (!editingBlock || !editingBlock.name.trim()) return;

    if (editingBlock.id) {
      setTaskTypes(prev => prev.map(block => 
        block.id === editingBlock.id ? editingBlock : block
      ));
    } else {
      const newBlock = {
        ...editingBlock,
        id: `block_${Date.now()}`,
      tasks: []
      };
      setTaskTypes(prev => [...prev, newBlock]);
    }
    
    setEditingBlock(null);
  };

  const filterTasks = (tasks: Task[]) => {
    if (!searchTerm) return tasks;
    return tasks.filter(task =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Drag & Drop handlers
  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Check if dropping on a column
    if (overId === 'backlog' || overId === 'to-do' || overId === 'in-progress' || overId === 'done') {
      // Find the task to move
      let taskToMove: Task | null = null;
      let sourceType: string | null = null;

      // Find task in any block type
      for (const type of taskTypes) {
        const foundTask = type.tasks.find(t => t.id === activeId);
        if (foundTask) {
          taskToMove = foundTask;
          sourceType = type.id;
          break;
        }
      }

      if (taskToMove && sourceType) {
        // Only move if status is different
        if (taskToMove.status !== overId) {
          // Remove from source
          setTaskTypes(prev => prev.map(type => 
            type.id === sourceType 
              ? { ...type, tasks: type.tasks.filter(t => t.id !== activeId) }
              : type
          ));

          // Add to target with new status
          const updatedTask = { ...taskToMove, status: overId };
          setTaskTypes(prev => prev.map(type => 
            type.id === sourceType 
              ? { ...type, tasks: [...type.tasks, updatedTask] }
              : type
          ));
        }
      }
    }
  };

  const renderMainHeader = () => (
    <Box sx={{ 
      backgroundColor: '#ffffff', 
      borderBottom: '1px solid #8fa3b3',
      px: 3,
      py: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#5a6c7d' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6b7d8f' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#8fa3b3' }} />
        </Box>
        <Typography variant="h4" sx={{ 
          color: '#4a5568', 
          fontFamily: 'Quicksand, sans-serif',
          fontWeight: 300,
          fontSize: '2rem'
        }}>
          tide
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant={currentPage === 'yearly' ? 'contained' : 'outlined'}
          onClick={() => setCurrentPage('yearly')}
          sx={{ 
            backgroundColor: currentPage === 'yearly' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'yearly' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'yearly' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          yearly
        </Button>
        <Button
          variant={currentPage === 'kanban' ? 'contained' : 'outlined'}
          onClick={() => setCurrentPage('kanban')}
          sx={{ 
            backgroundColor: currentPage === 'kanban' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'kanban' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'kanban' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          kanban
        </Button>
      </Box>
    </Box>
  );

  const renderKanbanHeader = () => (
    <Box sx={{ 
      backgroundColor: '#f1f5f8', 
      borderBottom: '1px solid #8fa3b3',
      px: 6,
      py: 1.5
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ position: 'relative' }}>
            <TextField
              size="small"
              placeholder="search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{
                width: 350,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  borderColor: '#8fa3b3',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                },
                '& .MuiInputBase-input': {
                  color: '#4a5568',
                  fontSize: '0.875rem'
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#6b7d8f', fontSize: 20 }} />
                  </InputAdornment>
                )
              }}
            />
            {renderSearchResults()}
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={handleOpenBlocksDialog}
              sx={{
              backgroundColor: 'transparent',
              color: '#4a5568',
              borderColor: '#8fa3b3',
              '&:hover': { 
                backgroundColor: 'rgba(90,108,125,0.1)',
                borderColor: '#5a6c7d'
              },
              px: 2,
              py: 0.75,
              fontSize: '0.875rem'
            }}
          >
            manage blocks
          </Button>
        </Box>
      </Box>
    </Box>
  );

  const renderTaskCard = (task: Task) => (
    <Box
      key={task.id}
      data-task-id={task.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
      }}
                sx={{
        backgroundColor: '#ffffff',
        p: 2,
                  borderRadius: 1,
        border: '1px solid #8fa3b3',
        cursor: 'grab',
        transition: 'all 0.2s',
        mb: 1,
                  '&:hover': {
          backgroundColor: '#f8fafb',
          borderColor: '#5a6c7d',
          boxShadow: '0 2px 8px rgba(90,108,125,0.15)'
        },
        '&:active': {
          cursor: 'grabbing'
        }
      }}
      onClick={() => handleTaskClick(task)}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <DragIndicatorIcon sx={{ color: '#6b7d8f', fontSize: 16 }} />
          <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500 }}>
            {task.title}
              </Typography>
          </Box>
        <Box sx={{ display: 'flex', gap: 0.5, opacity: 0, '&:hover': { opacity: 1 } }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleEditTask(task);
            }}
            sx={{ color: '#6b7d8f', '&:hover': { color: '#5a6c7d' } }}
          >
            <EditIcon sx={{ fontSize: 16 }} />
        </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteTask(task.id);
            }}
            sx={{ color: '#6b7d8f', '&:hover': { color: '#e53e3e' } }}
          >
            <DeleteIcon sx={{ fontSize: 16 }} />
        </IconButton>
              </Box>
      </Box>
      
      <Typography variant="caption" sx={{ color: '#6b7d8f', mb: 1.5, display: 'block' }}>
        {task.description}
      </Typography>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Chip
          label={task.priority}
          size="small"
                    sx={{ 
            backgroundColor: `${getPriorityColor(task.priority)}20`,
            color: getPriorityColor(task.priority),
            border: `1px solid ${getPriorityColor(task.priority)}50`,
            fontSize: '0.75rem',
            height: 20
          }}
        />
        {task.dueDate && (
          <Typography variant="caption" sx={{ color: '#6b7d8f' }}>
            {task.dueDate.toLocaleDateString()}
                    </Typography>
        )}
                  </Box>
    </Box>
  );

  const renderEmptyState = () => (
    <Box sx={{ 
      textAlign: 'center', 
      py: 8, 
      px: 4,
      backgroundColor: '#ffffff',
      borderRadius: 2,
      border: '2px dashed #8fa3b3'
    }}>
      <Typography variant="h6" sx={{ color: '#4a5568', mb: 2 }}>
        Welcome to your Kanban Board!
      </Typography>
      <Typography variant="body2" sx={{ color: '#6b7d8f', mb: 3 }}>
        Start by creating your first task block and adding tasks to organize your workflow.
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleOpenBlocksDialog}
                            sx={{ 
          backgroundColor: '#5a6c7d',
          '&:hover': { backgroundColor: '#4a5568' }
        }}
      >
        Create Your First Block
      </Button>
                          </Box>
  );

  const renderKanbanBoard = () => (
    <Box sx={{ p: 6, height: 'calc(100vh - 64px)', overflow: 'auto', backgroundColor: '#f8fafb' }}>
      {taskTypes.length === 0 ? (
        renderEmptyState()
      ) : (
        <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 140px)' }}>
          {columnOrder.map(columnId => {
            const column = getColumnById(columnId);
            if (!column) return null;

            return (
              <Box 
                key={columnId} 
                draggable
                onDragStart={(e) => handleColumnDragStart(e, columnId)}
                sx={{ 
                  flex: 1, 
                  minWidth: 300,
                  cursor: 'grab',
                  '&:active': {
                    cursor: 'grabbing'
                  }
                }}
                onDragOver={(e) => handleColumnDragOver(e)}
                onDrop={(e) => handleColumnDrop(e, columnId)}
              >
                <Box sx={{ 
                  backgroundColor: '#ffffff',
                  border: '1px solid #8fa3b3',
                  borderRadius: 1,
                  borderLeft: `4px solid ${column.color}`,
                  mb: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #8fa3b3' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" sx={{ color: '#4a5568', fontWeight: 500 }}>
                        {column.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => handleAddTask()}
                        sx={{
                          color: '#6b7d8f',
                          '&:hover': { 
                            color: column.color,
                            backgroundColor: `${column.color}10`
                          }
                        }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <Box sx={{ 
                        backgroundColor: '#f1f5f8',
                        px: 1,
                        py: 0.25,
                        borderRadius: 0.5
                      }}>
                        <Typography variant="caption" sx={{ color: '#6b7d8f' }}>
                          {taskTypes.flatMap(type => 
                            type.tasks.filter(task => task.status === columnId)
                          ).length}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  <Box 
                    data-column-id={columnId}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.backgroundColor = '#e2e8f0';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.backgroundColor = columnId === 'backlog' ? 'transparent' : '#f8fafb';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.backgroundColor = columnId === 'backlog' ? 'transparent' : '#f8fafb';
                      
                      const taskId = e.dataTransfer.getData('text/plain');
                      if (taskId) {
                        let taskToMove: Task | null = null;
                        let sourceType: string | null = null;

                        for (const type of taskTypes) {
                          const foundTask = type.tasks.find(t => t.id === taskId);
                          if (foundTask) {
                            taskToMove = foundTask;
                            sourceType = type.id;
                            break;
                          }
                        }

                        if (taskToMove && sourceType && taskToMove.status !== columnId) {
                          setTaskTypes(prev => prev.map(type => 
                            type.id === sourceType 
                              ? { ...type, tasks: type.tasks.filter(t => t.id !== taskId) }
                              : type
                          ));

                          const updatedTask = { ...taskToMove, status: columnId as 'backlog' | 'to-do' | 'in-progress' | 'done' };
                          setTaskTypes(prev => prev.map(type => 
                            type.id === sourceType 
                              ? { ...type, tasks: [...type.tasks, updatedTask] }
                              : type
                          ));
                        }
                      }
                    }}
                    sx={{
                      p: 2,
                      height: 'calc(100vh - 200px)',
                      overflow: 'auto',
                      minHeight: 200,
                      backgroundColor: columnId === 'backlog' ? 'transparent' : '#f8fafb',
                      borderRadius: columnId === 'backlog' ? 0 : 1,
                      transition: 'background-color 0.2s'
                    }}
                  >
                    {columnId === 'backlog' ? (
                      <>
                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
                          <Button
                            variant="outlined"
                            onClick={toggleBacklogExpansion}
                            startIcon={backlogExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            sx={{ 
                              color: '#4a5568',
                              borderColor: '#8fa3b3',
                              '&:hover': { 
                                backgroundColor: 'rgba(90,108,125,0.1)',
                                borderColor: '#5a6c7d'
                              }
                            }}
                          >
                            {backlogExpanded ? 'collapse all' : 'expand all'}
                          </Button>
                        </Box>
                        
                        {taskTypes.map(type => (
                          <Box key={type.id} sx={{ mb: 2 }}>
                            <Box 
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                mb: 1,
                                p: 1,
                                borderRadius: 1,
                                backgroundColor: type.expanded ? 'rgba(168,181,209,0.1)' : 'transparent',
                                '&:hover': { backgroundColor: 'rgba(168,181,209,0.05)' }
                              }}
                              onClick={() => toggleTypeExpansion(type.id)}
                            >
                              <Box 
                                sx={{ 
                                  width: 12, 
                                  height: 12, 
                                  borderRadius: '50%', 
                                  backgroundColor: type.color, 
                                  mr: 2 
                                }} 
                              />
                              <Typography variant="subtitle2" sx={{ flex: 1, color: '#1f2937', fontWeight: 500 }}>
                                {type.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#6b7280', mr: 1 }}>
                                {type.tasks.filter(t => t.status === 'backlog').length}
                              </Typography>
                              {type.expanded ? <ExpandLessIcon sx={{ color: '#6b7280' }} /> : <ExpandMoreIcon sx={{ color: '#6b7280' }} />}
                            </Box>
                            
                            <Collapse in={type.expanded}>
                              <Box sx={{ pl: 2, space: 1 }}>
                                {filterTasks(type.tasks.filter(task => task.status === 'backlog'))
                                  .map(task => renderTaskCard(task))
                                }
                                {type.tasks.filter(t => t.status === 'backlog').length === 0 && (
                                  <Typography variant="caption" sx={{ color: '#6b7280', fontStyle: 'italic', pl: 2 }}>
                                    No tasks
                                  </Typography>
                                )}
                                
                                <Button
                                  fullWidth
                                  variant="outlined"
                                  startIcon={<AddIcon />}
                                  onClick={() => handleAddTask(type.id)}
                                  sx={{ 
                                    mt: 1,
                                    p: 1.5,
                                    border: '2px dashed #a8b5d1',
                                    color: '#718096',
                                    fontSize: '0.75rem',
                                    '&:hover': {
                                      borderColor: type.color,
                                      color: type.color,
                                      backgroundColor: `${type.color}10`
                                    }
                                  }}
                                >
                                  Add Task to {type.name}
                                </Button>
                              </Box>
                            </Collapse>
                          </Box>
                        ))}
                      </>
                    ) : (
                      filterTasks(taskTypes.flatMap(type => 
                        type.tasks.filter(task => task.status === columnId)
                      )).map(task => renderTaskCard(task))
                    )}
                    
                    {columnId !== 'backlog' && filterTasks(taskTypes.flatMap(type => 
                      type.tasks.filter(task => task.status === columnId)
                    )).length === 0 && (
                      <Typography variant="body2" sx={{ 
                        color: '#6b7280', 
                        textAlign: 'center',
                        fontStyle: 'italic',
                        mt: 2
                      }}>
                        No tasks
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );

  const renderSearchResults = () => {
    if (!searchTerm.trim()) return null;
    
    const searchResults = taskTypes.flatMap(type => 
      type.tasks.filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(searchTerm.toLowerCase())
      ).map(task => ({ ...task, blockType: type.name }))
    );
    
    if (searchResults.length === 0) return null;
    
    return (
      <Box sx={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        border: '1px solid #8fa3b3',
        borderRadius: 1,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        maxHeight: 400,
        overflow: 'auto'
      }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0' }}>
          <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500 }}>
            search results ({searchResults.length})
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
          {searchResults.map((task) => (
            <Box 
              key={`${task.id}-${task.blockType}`}
              sx={{ 
                p: 2,
                backgroundColor: '#f8fafb',
                borderRadius: 1,
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  backgroundColor: '#f1f5f8',
                  borderColor: '#8fa3b3'
                }
              }}
              onClick={() => {
                setSelectedTask(task);
                setOpenTaskDialog(true);
                setIsEditing(false);
                setSearchTerm('');
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500, flex: 1 }}>
                  {task.title}
                </Typography>
                <Chip
                  label={task.blockType}
                  size="small"
                  sx={{
                    backgroundColor: '#e2e8f0',
                    color: '#4a5568',
                    fontSize: '0.75rem',
                    height: 20
                  }}
                />
              </Box>
              
              <Typography variant="caption" sx={{ color: '#6b7d8f', mb: 1.5, display: 'block' }}>
                {task.description}
              </Typography>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={task.status}
                    size="small"
                    sx={{ 
                      backgroundColor: '#f1f5f8',
                      color: '#4a5568',
                      fontSize: '0.75rem',
                      height: 20
                    }}
                  />
                  <Chip
                    label={task.priority}
                    size="small"
                    sx={{
                      backgroundColor: `${getPriorityColor(task.priority)}20`,
                      color: getPriorityColor(task.priority),
                      border: `1px solid ${getPriorityColor(task.priority)}50`,
                      fontSize: '0.75rem',
                      height: 20
                    }}
                  />
                </Box>
                
                {task.dueDate && (
                  <Typography variant="caption" sx={{ color: '#6b7d8f' }}>
                    {task.dueDate.toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  const renderTaskDialog = () => (
    <Dialog open={openTaskDialog} onClose={handleCloseTaskDialog} maxWidth="sm" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#4a5568', mb: 3, fontWeight: 600 }}>
          {selectedTask ? 'edit task' : 'add new task'}
              </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="title"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            fullWidth
                    sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                color: '#4a5568',
                borderColor: '#8fa3b3',
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                }
              },
              '& .MuiInputLabel-root': {
                color: '#6b7d8f'
              },
              '& .MuiInputBase-input': {
                color: '#4a5568'
              }
            }}
          />
          
          <TextField
            label="description"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                color: '#4a5568',
                borderColor: '#8fa3b3',
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                }
              },
              '& .MuiInputLabel-root': {
                color: '#6b7d8f'
              },
              '& .MuiInputBase-input': {
                color: '#4a5568'
              }
            }}
          />
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#6b7d8f' }}>priority</InputLabel>
              <Select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                sx={{
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  borderColor: '#8fa3b3',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                }}
              >
                <MenuItem value="low">low</MenuItem>
                <MenuItem value="medium">medium</MenuItem>
                <MenuItem value="high">high</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#6b7d8f' }}>status</InputLabel>
              <Select
                value={newTask.status}
                onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                sx={{
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  borderColor: '#8fa3b3',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#8fa3b3'
                  }
                }}
              >
                <MenuItem value="backlog">backlog</MenuItem>
                <MenuItem value="to-do">to do</MenuItem>
                <MenuItem value="in-progress">in progress</MenuItem>
                <MenuItem value="done">done</MenuItem>
              </Select>
            </FormControl>
                </Box>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#6b7d8f' }}>type</InputLabel>
              <Select
                value={newTask.type}
                onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                sx={{
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  borderColor: '#8fa3b3',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                }}
              >
                {taskTypes.map(type => (
                  <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              label="due date"
              type="date"
              value={newTask.dueDate ? newTask.dueDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setNewTask({ ...newTask, dueDate: new Date(e.target.value) })}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  borderColor: '#8fa3b3',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                },
                '& .MuiInputLabel-root': {
                  color: '#6b7d8f'
                },
                '& .MuiInputBase-input': {
                  color: '#4a5568'
                }
              }}
            />
      </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 4, justifyContent: 'flex-end' }}>
          <Button onClick={handleCloseTaskDialog} sx={{ color: '#6b7d8f' }}>
            cancel
          </Button>
          <Button
            onClick={handleSaveTask}
            variant="contained"
            sx={{ 
              backgroundColor: '#5a6c7d',
              '&:hover': { backgroundColor: '#4a5568' }
            }}
          >
            {selectedTask ? 'update' : 'create'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );

  const renderBlocksDialog = () => (
    <Dialog open={openBlocksDialog} onClose={() => setOpenBlocksDialog(false)} maxWidth="md" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#4a5568', mb: 3, fontWeight: 600 }}>
          manage blocks
        </Typography>
        
        {/* Existing Blocks */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ color: '#4a5568', mb: 2, fontWeight: 500 }}>
            existing blocks
          </Typography>
          
          {taskTypes.length === 0 ? (
            <Typography variant="body2" sx={{ color: '#6b7d8f', fontStyle: 'italic' }}>
              no blocks created yet
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {taskTypes.map((block) => (
                <Box
                  key={block.id}
                    sx={{ 
                      display: 'flex', 
                    justifyContent: 'space-between',
                      alignItems: 'center', 
                    p: 2,
                    backgroundColor: '#f8fafb',
                    borderRadius: 1,
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: block.color,
                        borderRadius: '50%'
                      }}
                    />
                    {editingBlock && editingBlock.id === block.id ? (
                      <TextField
                        value={editingBlock.name}
                        onChange={(e) => setEditingBlock({ ...editingBlock, name: e.target.value })}
                        size="small"
                        sx={{ 
                          width: 150,
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: '#ffffff',
                            color: '#4a5568',
                            borderColor: '#8fa3b3',
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            }
                          },
                          '& .MuiInputBase-input': {
                            color: '#4a5568'
                          }
                        }}
                      />
                    ) : (
                      <Typography variant="body1" sx={{ color: '#4a5568', fontWeight: 500 }}>
                      {block.name}
                    </Typography>
                    )}
                    <Chip
                      label={`${block.tasks.length} tasks`}
                      size="small"
                      sx={{
                        backgroundColor: '#e2e8f0',
                        color: '#4a5568',
                        fontSize: '0.75rem'
                      }}
                    />
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {editingBlock && editingBlock.id === block.id ? (
                      <>
                        <IconButton
                          size="small"
                          onClick={handleSaveBlock}
                          disabled={!editingBlock.name.trim()}
                            sx={{ 
                            color: '#48bb78',
                            '&:hover': { backgroundColor: 'rgba(72,187,120,0.1)' },
                            '&:disabled': { color: '#cbd5e0' }
                          }}
                        >
                          <CheckIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setEditingBlock(null)}
                          sx={{ 
                            color: '#6b7d8f',
                            '&:hover': { backgroundColor: 'rgba(107,125,143,0.1)' }
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => setEditingBlock(block)}
                          sx={{ 
                            color: '#5a6c7d',
                            '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
                          }}
                        >
                          <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteBlock(block.id)}
                          sx={{ 
                            color: '#e53e3e',
                            '&:hover': { backgroundColor: 'rgba(229,62,62,0.1)' }
                          }}
                        >
                          <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </>
                    )}
                          </Box>
                </Box>
              ))}
            </Box>
                  )}
                </Box>
        
        {/* Add New Block */}
        <Box sx={{ 
          pt: 2, 
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          gap: 2,
          alignItems: 'flex-end'
        }}>
          <TextField
            label="block name"
            value={newTask.type}
            onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
            placeholder="enter block name..."
                    sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                color: '#4a5568',
                borderColor: '#8fa3b3',
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#5a6c7d'
                }
              },
              '& .MuiInputLabel-root': {
                color: '#6b7d8f'
              },
              '& .MuiInputBase-input': {
                color: '#4a5568'
              }
            }}
          />
          
          <Button
            variant="contained"
            onClick={handleAddBlock}
            disabled={!newTask.type.trim()}
            sx={{ 
              backgroundColor: '#5a6c7d',
              color: '#ffffff',
              '&:hover': { backgroundColor: '#4a5568' },
              '&:disabled': { backgroundColor: '#cbd5e0', color: '#718096' }
            }}
          >
            add block
          </Button>
              </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button onClick={() => setOpenBlocksDialog(false)} sx={{ color: '#6b7d8f' }}>
            close
          </Button>
                </Box>
                </Box>
    </Dialog>
  );

  const renderYearlyView = () => {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const getTasksForDate = (date: Date) => {
      return taskTypes.flatMap(type => 
        type.tasks.filter(task => {
          if (!task.dueDate) return false;
          return task.dueDate.getDate() === date.getDate() &&
                 task.dueDate.getMonth() === date.getMonth() &&
                 task.dueDate.getFullYear() === date.getFullYear();
        })
      );
    };

    const getTasksForMonth = (month: number, year: number) => {
      return taskTypes.flatMap(type => 
        type.tasks.filter(task => {
          if (!task.dueDate) return false;
          return task.dueDate.getMonth() === month &&
                 task.dueDate.getFullYear() === year;
        })
      );
    };

    return (
      <Box sx={{ p: 4, height: 'calc(100vh - 64px)', overflow: 'auto', backgroundColor: '#f8fafb' }}>
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(6, 1fr)', 
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 2,
          maxWidth: '100%',
          height: 'calc(100vh - 200px)'
        }}>
          {months.map((monthName, monthIndex) => {
            // monthIndex is 0-based, so January = 0, February = 1, etc.
            const daysInMonth = new Date(2025, monthIndex + 1, 0).getDate();
            const firstDayOfMonth = new Date(2025, monthIndex, 1).getDay();
            
            return (
              <Box key={monthIndex} sx={{ 
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
                p: 1,
                border: '1px solid #8fa3b3',
                boxShadow: '0 1px 4px rgba(143,163,179,0.1)',
                minHeight: '180px',
                      display: 'flex', 
                flexDirection: 'column'
              }}>
                <Typography variant="body1" sx={{ 
                  color: '#4a5568', 
                  mb: 1, 
                  textAlign: 'center',
                  fontWeight: 600,
                  borderBottom: '1px solid #f1f5f8',
                  pb: 0.25,
                  fontSize: '0.875rem'
                }}>
                  {monthName}
        </Typography>
                
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)', 
                  gap: 0.125,
                  flex: 1
                }}>
                  {/* Day headers */}
                  {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => (
                    <Box key={day} sx={{ 
                      p: 0.25, 
                      textAlign: 'center',
                      fontSize: '0.55rem',
                      fontWeight: 600,
                      color: '#6b7d8f'
                    }}>
                      {day}
      </Box>
                  ))}
                  
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: firstDayOfMonth }, (_, i) => (
                    <Box key={`empty-${i}`} sx={{ p: 0.25 }} />
                  ))}
                  
                  {/* Days of the month */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(2025, monthIndex, day);
                    const tasksForDate = getTasksForDate(date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    
                    return (
                      <Box
                        key={day}
                            sx={{ 
                          p: 0.25,
                          textAlign: 'center',
                          fontSize: '0.6rem',
                          color: isToday ? '#ffffff' : '#4a5568',
                          cursor: 'pointer',
                          borderRadius: 0.25,
                          backgroundColor: isToday ? '#5a6c7d' : (tasksForDate.length > 0 ? '#f1f5f8' : 'transparent'),
                          border: isToday ? 'none' : (tasksForDate.length > 0 ? '1px solid #8fa3b3' : 'none'),
                          '&:hover': {
                            backgroundColor: isToday ? '#4a5568' : (tasksForDate.length > 0 ? '#e2e8f0' : '#f8fafb')
                          }
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.6rem' }}>
                          {day}
                        </Typography>
                        {tasksForDate.length > 0 && !isToday && (
                          <Box sx={{ 
                            width: 3, 
                            height: 3, 
                            borderRadius: '50%', 
                            backgroundColor: '#5a6c7d',
                            mx: 'auto',
                            mt: 0.125
                          }} />
                  )}
                </Box>
                    );
                  })}
              </Box>

                {/* Month summary */}
                <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px solid #f1f5f8' }}>
                  <Typography variant="caption" sx={{ color: '#6b7d8f', fontSize: '0.6rem' }}>
                    {getTasksForMonth(monthIndex, 2025).length} tasks
                  </Typography>
                </Box>
                </Box>
            );
          })}
                </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafb' }}>
      {renderMainHeader()}
      {currentPage === 'yearly' ? (
        renderYearlyView()
      ) : (
        <>
          {renderKanbanHeader()}
          {renderKanbanBoard()}
        </>
      )}
      {renderTaskDialog()}
      {renderBlocksDialog()}
      {renderSearchResults()}
    </Box>
  );
}

export default App;
