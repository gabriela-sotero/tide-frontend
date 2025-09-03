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
  Tooltip,
  CircularProgress
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
  Close as CloseIcon,
  ViewColumn as ViewColumnIcon,
  ViewList as ViewListIcon,
  AutoAwesome as AutoAwesomeIcon
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
import { createTasksFromAI, AITaskResponse } from './services/aiService';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: string; // Allow dynamic column names
  type?: string; // Opcional para compatibilidade
  createdAt: Date;
  startDate: Date;
  dueDate?: Date; // Opcional para tarefas recorrentes sem fim
  taskType: 'geral' | 'recorrente' | 'compromisso';
  blockType: string;
  recurringDays?: string[];
  recurringTime?: string;
  appointmentTime?: string; // Para compromissos
}

interface RecurringTask {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  blockType: string; // Qual bloco ela pertence
  createdAt: Date;
  startDate: Date; // Data de início da recorrência
  dueDate?: Date; // Data de fim da recorrência (opcional para recorrência indefinida)
  taskType: 'recorrente' | 'compromisso';
  recurringDays: string[];
  recurringTime?: string;
  appointmentTime?: string; // Para compromissos
}

interface TaskType {
  id: string;
  name: string;
  color: string;
  expanded: boolean; // Keep for backward compatibility
  expandedByColumn: Record<string, boolean>;
  tasks: Task[];
  schedule?: {
    monday?: string[];
    tuesday?: string[];
    wednesday?: string[];
    thursday?: string[];
    friday?: string[];
    saturday?: string[];
    sunday?: string[];
  };
}

type KanbanColumn = string;

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

const saveBoard = (board: { taskTypes: TaskType[]; recurringTasks: RecurringTask[] }) => {
  initDB().then(db => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const boardData = { 
      id: 'main', 
      taskTypes: board.taskTypes, 
      recurringTasks: board.recurringTasks,
      lastUpdated: new Date().toISOString() 
    };
    
    store.put(boardData);
    console.log('Board saved to IndexedDB');
  }).catch(error => {
    console.error('Error initializing DB:', error);
  });
};

const loadBoard = (): Promise<{ taskTypes: TaskType[]; recurringTasks: RecurringTask[] } | null> => {
  return new Promise((resolve) => {
    initDB().then(db => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get('main');
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.taskTypes && Array.isArray(result.taskTypes)) {
          // Convert date strings back to Date objects for taskTypes
          const taskTypesWithDates = result.taskTypes.map((type: TaskType) => ({
            ...type,
            tasks: type.tasks.map((task: Task) => ({
              ...task,
              createdAt: new Date(task.createdAt),
              startDate: new Date(task.startDate),
              dueDate: task.dueDate ? new Date(task.dueDate) : undefined
            }))
          }));

          // Convert date strings back to Date objects for recurringTasks
          const recurringTasksWithDates = (result.recurringTasks || []).map((task: RecurringTask) => ({
            ...task,
            createdAt: new Date(task.createdAt),
            startDate: new Date(task.startDate),
                          dueDate: task.dueDate ? new Date(task.dueDate) : undefined
          }));

          resolve({ 
            taskTypes: taskTypesWithDates,
            recurringTasks: recurringTasksWithDates
          });
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
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [columns, setColumns] = useState([
    { id: 'backlog', name: 'backlog', bgColor: '#f1f5f8', color: '#4a5568', fixed: true },
    { id: 'to-do', name: 'to do', bgColor: '#f1f5f8', color: '#4a5568', fixed: false },
    { id: 'in-progress', name: 'in progress', bgColor: '#f1f5f8', color: '#4a5568', fixed: false },
    { id: 'done', name: 'done', bgColor: '#f1f5f8', color: '#4a5568', fixed: true }
  ]);

  // Helper function to get column by id
  const getColumnById = (id: string) => columns.find(col => col.id === id);
  
  // Helper function to get column name by id
  const getColumnNameById = (id: string) => {
    const column = columns.find(col => col.id === id);
    return column ? column.name : id;
  };

  // State for column reordering
  const [columnOrder, setColumnOrder] = useState<KanbanColumn[]>(['backlog', 'to-do', 'in-progress', 'done']);

  // Column reordering functions
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.dataTransfer.setData('text/plain', columnId);
    e.dataTransfer.setData('type', 'column'); // Identify as column drag
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTaskDrop = (e: React.DragEvent, targetColumnId: string, targetTypeId: string, targetPosition: 'top' | 'bottom' | 'middle') => {
    e.preventDefault();
    e.stopPropagation();
    
    const taskId = e.dataTransfer.getData('text/plain');
    const dragType = e.dataTransfer.getData('type');
    
    if (dragType !== 'task') return;
    
    let taskToMove: Task | null = null;
    let sourceType: string | null = null;

    // Find the task to move
    for (const type of taskTypes) {
      const foundTask = type.tasks.find(t => t.id === taskId);
      if (foundTask) {
        taskToMove = foundTask;
        sourceType = type.id;
        break;
      }
    }

    if (!taskToMove || !sourceType) return;

    // Determine new priority based on position
    let newPriority: 'high' | 'medium' | 'low' = taskToMove.priority;
    
    if (targetPosition === 'top') {
      newPriority = 'high';
    } else if (targetPosition === 'middle') {
      newPriority = 'medium';
    } else if (targetPosition === 'bottom') {
      newPriority = 'low';
    }

    // Update task with new status and priority
    const updatedTask = { 
      ...taskToMove, 
      status: targetColumnId as 'backlog' | 'to-do' | 'in-progress' | 'done',
      priority: newPriority
    };
    
    // Remove task from source and add to target in a single operation
    setTaskTypes(prev => prev.map(type => {
      if (type.id === sourceType) {
        // Remove task from source type
        return { 
          ...type, 
          tasks: type.tasks.filter(t => t.id !== taskId)
        };
      } else if (type.id === targetTypeId) {
        // Add task to target type
        return { 
          ...type, 
          tasks: targetColumnId === 'done' 
            ? reorganizeTasksWithDoneAtTop([...type.tasks, updatedTask])
            : [...type.tasks, updatedTask]
        };
      }
      return type;
    }));
  };

  const handleColumnDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const dragType = e.dataTransfer.getData('type');
    const draggedId = e.dataTransfer.getData('text/plain');
    
    if (dragType === 'column') {
      // Handle column reordering
      const draggedColumnId = draggedId as KanbanColumn;
      
      if (draggedColumnId === targetColumnId) return;
      
      const draggedIndex = columnOrder.indexOf(draggedColumnId);
      const targetIndex = columnOrder.indexOf(targetColumnId as KanbanColumn);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      const newColumnOrder = [...columnOrder];
      const [draggedColumn] = newColumnOrder.splice(draggedIndex, 1);
      newColumnOrder.splice(targetIndex, 0, draggedColumn);
      
      setColumnOrder(newColumnOrder);
    } else if (dragType === 'task') {
      // Handle task movement with priority adjustment
      const taskId = draggedId;
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

      if (taskToMove && sourceType) {
        // Get target priority information
        const targetPriority = e.dataTransfer.getData('priority') || taskToMove.priority;
        
        // Update task with new status and priority
        const updatedTask = { 
          ...taskToMove, 
          status: targetColumnId as 'backlog' | 'to-do' | 'in-progress' | 'done',
          priority: targetPriority as 'high' | 'medium' | 'low'
        };
        
        // Remove task from source and add back with updated status in a single operation
        setTaskTypes(prev => prev.map(type => {
          if (type.id === sourceType) {
            return { 
              ...type, 
              tasks: targetColumnId === 'done' 
                ? reorganizeTasksWithDoneAtTop([...type.tasks.filter(t => t.id !== taskId), updatedTask])
                : [...type.tasks.filter(t => t.id !== taskId), updatedTask]
            };
          }
          return type;
        }));
      }
    }
  };

  const [openTaskDialog, setOpenTaskDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [openBlocksDialog, setOpenBlocksDialog] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TaskType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Helper function to get today's date in local timezone
  const getTodayDate = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  };

  const [newTask, setNewTask] = useState<Task>({
    id: '',
    title: '',
    description: '',
    priority: 'medium',
    status: 'backlog',
    createdAt: new Date(),
    startDate: getTodayDate(),
    dueDate: getTodayDate(),
    taskType: 'geral',
    blockType: 'general',
    recurringDays: [],
    recurringTime: '',
    appointmentTime: ''
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedBlockForNewTask, setSelectedBlockForNewTask] = useState<string>('feature');
  const [backlogExpanded, setBacklogExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState<'yearly' | 'kanban' | 'monthly' | 'weekly' | 'daily' | 'schedule'>('kanban');

  // Clear expanded block when changing pages
  const handlePageChange = (page: 'yearly' | 'kanban' | 'monthly' | 'weekly' | 'daily' | 'schedule') => {
    setCurrentPage(page);
    if (page !== 'kanban') {
      clearExpandedBlock();
    }
  };
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{open: boolean, blockId: string, blockName: string, columnId?: string}>({
    open: false,
    blockId: '',
    blockName: '',
    columnId: ''
  });
  const [openColumnsDialog, setOpenColumnsDialog] = useState(false);
  const [openTasksDialog, setOpenTasksDialog] = useState(false);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [editingColumn, setEditingColumn] = useState<{id: string, name: string} | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newBlockName, setNewBlockName] = useState('');
  const [selectedBlockColor, setSelectedBlockColor] = useState('#5a6c7d');
  const [blockSchedule, setBlockSchedule] = useState<{
    monday: string[];
    tuesday: string[];
    wednesday: string[];
    thursday: string[];
    friday: string[];
    saturday: string[];
    sunday: string[];
  }>({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: []
  });
  const [newScheduleTime, setNewScheduleTime] = useState('');
  const [selectedScheduleDay, setSelectedScheduleDay] = useState('monday');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [expandedBlockFromSchedule, setExpandedBlockFromSchedule] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    // Adjust for Monday start
    const dayOfWeek = startOfYear.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return Math.ceil((days + mondayOffset + 1) / 7);
  });
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [moveTaskDialog, setMoveTaskDialog] = useState<{open: boolean, taskId: string, currentBlockName: string}>({
    open: false,
    taskId: '',
    currentBlockName: ''
  });



  // Chat states
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    type: 'user' | 'ai';
    content: string;
    timestamp: Date;
    aiResponse?: AITaskResponse;
  }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

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
        setRecurringTasks(savedBoard.recurringTasks || []);
      } else {
        // Criar um bloco padrão se não houver dados salvos
        const defaultBlock: TaskType = {
          id: 'general',
          name: 'general',
          color: '#5a6c7d',
          tasks: [],
          expanded: true,
          expandedByColumn: columns.reduce((acc, col) => ({
            ...acc,
            [col.id]: col.id === 'backlog' ? true : false
          }), {}),
          schedule: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
          }
        };
        setTaskTypes([defaultBlock]);
      }
    }).catch(error => {
      console.error('Failed to load board:', error);
    });
  }, []);

  // Save board to IndexedDB whenever taskTypes or recurringTasks changes
  useEffect(() => {
    if (taskTypes.length > 0) {
      saveBoard({ taskTypes, recurringTasks });
    }
  }, [taskTypes, recurringTasks]);

  const toggleTypeExpansion = (typeId: string, columnId: KanbanColumn) => {
    setTaskTypes(prev => prev.map(type => 
      type.id === typeId ? { 
        ...type, 
        expandedByColumn: {
          ...type.expandedByColumn,
          [columnId]: !type.expandedByColumn?.[columnId]
        }
      } : type
    ));
  };

  const toggleAllBlocksExpansion = () => {
    const newExpandedState = !backlogExpanded;
    setBacklogExpanded(newExpandedState);
    
    // Toggle all blocks in all columns dynamically
    setTaskTypes(prev => prev.map(type => ({
      ...type,
      expandedByColumn: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: newExpandedState
      }), {})
    })));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444';      // Vermelho mais suave
      case 'medium': return '#f59e0b';    // Laranja mais suave
      case 'low': return '#10b981';       // Verde mais suave
      default: return '#8fa3b3';          // Cinza da paleta principal
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return '#8fa3b3';    // Cinza da paleta principal
      case 'to-do': return '#f59e0b';      // Laranja da paleta principal
      case 'in-progress': return '#3b82f6'; // Azul da paleta principal
      case 'done': return '#10b981';       // Verde da paleta principal
      default: return '#8fa3b3';           // Cinza da paleta principal
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
      createdAt: task.createdAt,
      startDate: task.startDate,
      dueDate: task.dueDate,
      taskType: task.taskType,
      blockType: task.blockType,
      recurringDays: task.recurringDays || [],
      recurringTime: task.recurringTime || '',
      appointmentTime: task.appointmentTime || ''
    });
    setIsEditing(true);
    setOpenTaskDialog(true);
  };

  const handleAddTask = (blockType?: string, columnId?: string) => {
    const newStatus = (columnId as string) || 'backlog';
    
    setNewTask({
      id: '',
      title: '',
      description: '',
      priority: 'medium',
      status: newStatus,
      createdAt: new Date(),
      startDate: getTodayDate(),
      dueDate: getTodayDate(),
      taskType: 'geral',
      blockType: 'general',
      recurringDays: [],
      recurringTime: '',
      appointmentTime: ''
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
      createdAt: new Date(),
      startDate: getTodayDate(),
      dueDate: getTodayDate(),
      taskType: 'geral',
      blockType: 'general',
      recurringDays: [],
      recurringTime: '',
      appointmentTime: ''
    });
  };

  const handleSaveTask = () => {
    if (!newTask.title.trim()) return;
    
    if (selectedTask) {
      // Update existing task
      const updatedTask: Task = {
        ...selectedTask,
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: newTask.status,
        dueDate: newTask.dueDate,
        taskType: newTask.taskType,
        recurringDays: newTask.recurringDays || [],
        recurringTime: newTask.recurringTime || '',
        appointmentTime: newTask.appointmentTime || ''
      };
      
      if (selectedTask.taskType === 'geral') {
        // Update in kanban board
        setTaskTypes(prev => prev.map(type => ({
          ...type,
          tasks: type.tasks.map(task => 
            task.id === selectedTask.id ? updatedTask : task
          )
        })));
      } else {
        // Update in recurring/compromisso list
        const updatedRecurringTask: RecurringTask = {
          id: selectedTask.id,
          title: updatedTask.title,
          description: updatedTask.description,
          priority: updatedTask.priority,
          blockType: updatedTask.type || 'general',
          createdAt: selectedTask.createdAt,
          startDate: updatedTask.startDate,
          dueDate: updatedTask.dueDate,
          taskType: updatedTask.taskType as 'recorrente' | 'compromisso',
          recurringDays: updatedTask.recurringDays || [],
          recurringTime: updatedTask.recurringTime || '',
          appointmentTime: updatedTask.appointmentTime || ''
        };
        setRecurringTasks(prev => prev.map(task => 
          task.id === selectedTask.id ? updatedRecurringTask : task
        ));
      }
    } else {
      // Add new task
      const newTaskToAdd: Task = {
        id: Date.now().toString(),
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: newTask.status,
        dueDate: newTask.dueDate || getTodayDate(),
        blockType: newTask.type || 'general',
        createdAt: new Date(),
        startDate: newTask.startDate || getTodayDate(),
        taskType: newTask.taskType,
        recurringDays: newTask.recurringDays || [],
        recurringTime: newTask.recurringTime || '',
        appointmentTime: newTask.appointmentTime || ''
      };
      
      if (newTask.taskType === 'geral') {
        // Add to kanban board
        setTaskTypes(prev => prev.map(type => 
          type.id === 'general' 
            ? { ...type, tasks: [...type.tasks, newTaskToAdd] }
            : type
        ));
      } else {
        // Add to recurring/compromisso list
        const newRecurringTask: RecurringTask = {
          id: Date.now().toString(),
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          blockType: newTask.type || 'general',
          createdAt: new Date(),
          startDate: newTask.startDate || getTodayDate(),
          dueDate: newTask.dueDate || getTodayDate(),
          taskType: newTask.taskType as 'recorrente' | 'compromisso',
          recurringDays: newTask.recurringDays || [],
          recurringTime: newTask.recurringTime || '',
          appointmentTime: newTask.appointmentTime || ''
        };
        setRecurringTasks(prev => [...prev, newRecurringTask]);
      }
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

  // Helper function to reorganize tasks so that 'done' tasks are always at the top
  const reorganizeTasksWithDoneAtTop = (tasks: Task[]): Task[] => {
    const doneTasks = tasks.filter(task => task.status === 'done');
    const nonDoneTasks = tasks.filter(task => task.status !== 'done');
    
    // Sort done tasks by creation date (newest first)
    const sortedDoneTasks = doneTasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Return done tasks first, then non-done tasks
    return [...sortedDoneTasks, ...nonDoneTasks];
  };

  const handleMarkTaskDone = (taskId: string) => {
    // Find the task and its current block
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

    if (taskToMove && sourceType) {
      // Update the task status to 'done' and reorganize all tasks in the block
      const updatedTask: Task = {
        ...taskToMove,
        status: 'done' as 'backlog' | 'to-do' | 'in-progress' | 'done'
      };
      
      setTaskTypes(prev => prev.map(type => 
        type.id === sourceType 
          ? { 
              ...type, 
              tasks: reorganizeTasksWithDoneAtTop([
                updatedTask,
                ...type.tasks.filter(t => t.id !== taskId)
              ])
            }
          : type
      ));
    }
  };

  const handleOpenBlocksDialog = () => {
    setOpenBlocksDialog(true);
    setEditingBlock(null);
  };

  const handleCloseBlocksDialog = () => {
    setOpenBlocksDialog(false);
    setEditingBlock(null);
    setScheduleMessage('');
    setBlockSchedule({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    });
    setSelectedBlockColor('#5a6c7d');
    setNewBlockName('');
  };

  const handleAddBlock = () => {
    if (!newBlockName.trim()) return;
    
    const newBlock: TaskType = {
      id: Date.now().toString(),
      name: newBlockName,
      color: selectedBlockColor,
      tasks: [],
      expanded: true,
      expandedByColumn: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: true
      }), {}),
      schedule: blockSchedule
    };
    
    setTaskTypes(prev => [...prev, newBlock]);
    setNewBlockName('');
    setSelectedBlockColor('#5a6c7d'); // Reset to default color
    setBlockSchedule({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    });
    setScheduleMessage('');
  };

  const handleEditBlock = (block: TaskType) => {
    setEditingBlock({ ...block });
    setBlockSchedule({
      monday: block.schedule?.monday || [],
      tuesday: block.schedule?.tuesday || [],
      wednesday: block.schedule?.wednesday || [],
      thursday: block.schedule?.thursday || [],
      friday: block.schedule?.friday || [],
      saturday: block.schedule?.saturday || [],
      sunday: block.schedule?.sunday || []
    });
  };

  const handleDeleteBlock = (blockId: string) => {
    // Delete the entire block and all its tasks from all columns
    setTaskTypes(prev => prev.filter(b => b.id !== blockId));
  };

  const handleOpenDeleteConfirm = (blockId: string, blockName: string, columnId?: string) => {
    setDeleteConfirmDialog({
      open: true,
      blockId,
      blockName,
      columnId
    });
  };

  const handleConfirmDelete = () => {
    const { blockId, columnId } = deleteConfirmDialog;
    
    if (columnId) {
      // Delete only the tasks of this block in this specific column
      setTaskTypes(prev => prev.map(type => 
        type.id === blockId 
          ? { 
              ...type, 
              tasks: type.tasks.filter(task => task.status !== columnId)
            }
          : type
      ));
    } else {
      // Delete the entire block (fallback for old behavior)
      setTaskTypes(prev => prev.filter(type => type.id !== blockId));
    }
    
    setDeleteConfirmDialog({ open: false, blockId: '', blockName: '', columnId: '' });
  };

  const handleCancelDelete = () => {
    setDeleteConfirmDialog({ open: false, blockId: '', blockName: '', columnId: '' });
  };

  const handleEditColumn = (columnId: string, currentName: string) => {
    setEditingColumn({ id: columnId, name: currentName });
  };

  const handleSaveColumnName = () => {
    if (!editingColumn || !editingColumn.name.trim()) return;
    
    const oldName = columns.find(col => col.id === editingColumn.id)?.name || '';
    const newName = editingColumn.name.toLowerCase();
    
    console.log('Saving column name:', { oldName, newName, columnId: editingColumn.id });
    
    // Update column name in the columns state
    setColumns(prev => {
      const updated = prev.map(col => 
        col.id === editingColumn.id 
          ? { ...col, name: newName }
          : col
      );
      console.log('Updated columns:', updated);
      return updated;
    });
    
    // Update all task statuses that reference the old column name
    setTaskTypes(prev => {
      const updated = prev.map(type => ({
        ...type,
        tasks: type.tasks.map(task => ({
          ...task,
          status: task.status === oldName ? newName as any : task.status
        }))
      }));
      console.log('Updated task types:', updated);
      return updated;
    });
    
    setEditingColumn(null);
  };

  const handleCancelColumnEdit = () => {
    setEditingColumn(null);
  };

  const toggleColumnExpansion = (columnId: string) => {
    setExpandedColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  const handleTaskReorder = (draggedTaskId: string, targetColumnId: string, targetIndex: number) => {
    // Find the source column and task
    const sourceColumnId = Object.keys(expandedColumns).find(colId => {
      const tasks = taskTypes.flatMap(type => 
        type.tasks.filter(task => task.status === colId)
      );
      return tasks.some(task => task.id === draggedTaskId);
    });

    if (!sourceColumnId || sourceColumnId === targetColumnId) return;

    // Find the task to move
    let taskToMove: Task | null = null;
    let sourceType: string | null = null;

    for (const type of taskTypes) {
      const foundTask = type.tasks.find(t => t.id === draggedTaskId);
      if (foundTask) {
        taskToMove = foundTask;
        sourceType = type.id;
        break;
      }
    }

    if (taskToMove && sourceType) {
      // Remove task from source block
      setTaskTypes(prev => prev.map(type => 
        type.id === sourceType 
          ? { ...type, tasks: type.tasks.filter(t => t.id !== draggedTaskId) }
          : type
      ));

      // Add task to the same block but with updated status and reorganize if moving to 'done'
      const updatedTask = { ...taskToMove, status: targetColumnId as any };
      setTaskTypes(prev => prev.map(type => 
        type.id === sourceType 
          ? { 
              ...type, 
              tasks: targetColumnId === 'done' 
                ? reorganizeTasksWithDoneAtTop([...type.tasks, updatedTask])
                : [...type.tasks, updatedTask]
            }
          : type
      ));
    }
  };

  const handleAddNewColumn = () => {
    if (!newColumnName.trim()) return;
    
    const newColumnId = newColumnName.toLowerCase().replace(/\s+/g, '-');
    const newColumn = {
      id: newColumnId,
      name: newColumnName.toLowerCase(),
              bgColor: '#f1f5f8',
        color: '#4a5568',
      fixed: false
    };
    
    // Add new column to columns array
    setColumns(prev => [...prev, newColumn]);
    
    // Add new column to column order
    setColumnOrder(prev => [...prev, newColumnId as KanbanColumn]);
    
    // Clear input
    setNewColumnName('');
  };

  const handleMoveTask = (taskId: string) => {
    // Find the task and its current block
    let currentBlockName = '';
    for (const type of taskTypes) {
      const foundTask = type.tasks.find(t => t.id === taskId);
      if (foundTask) {
        currentBlockName = type.name;
        break;
      }
    }
    
    setMoveTaskDialog({
      open: true,
      taskId,
      currentBlockName
    });
  };

  const handleConfirmMoveTask = (targetBlockId: string) => {
    const { taskId } = moveTaskDialog;
    
    // Find the task to move
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

    if (taskToMove && sourceType && sourceType !== targetBlockId) {
      // Remove task from source block
      setTaskTypes(prev => prev.map(type => 
        type.id === sourceType 
          ? { ...type, tasks: type.tasks.filter(t => t.id !== taskId) }
          : type
      ));

              // Add task to target block - if moving to 'done' column, add at the top
        const updatedTask = { ...taskToMove, blockType: targetBlockId };
        setTaskTypes(prev => prev.map(type => 
          type.id === targetBlockId 
            ? { 
                ...type, 
                tasks: updatedTask.status === 'done' 
                  ? [updatedTask, ...type.tasks] // Add at top for 'done' column
                  : [...type.tasks, updatedTask] // Add at bottom for other columns
              }
            : type
        ));
    }

    // Close dialog
    setMoveTaskDialog({ open: false, taskId: '', currentBlockName: '' });
  };

  const handleCancelMoveTask = () => {
    setMoveTaskDialog({ open: false, taskId: '', currentBlockName: '' });
  };

  const handleGanttDateClick = (task: Task, isStartDate: boolean, clickedDate: Date) => {
    const newStartDate = isStartDate ? clickedDate : task.startDate;
    const newDueDate = isStartDate ? clickedDate : task.dueDate;
    
    // Ensure start date is not after due date
    if (newDueDate && newStartDate > newDueDate) {
      if (isStartDate) {
        // If clicking start date and it's after due date, adjust due date
        const updatedTask = { ...task, startDate: clickedDate, dueDate: clickedDate };
        updateTaskInState(updatedTask);
      } else {
        // If clicking due date and it's before start date, adjust start date
        const updatedTask = { ...task, startDate: clickedDate, dueDate: clickedDate };
        updateTaskInState(updatedTask);
      }
    } else {
      const updatedTask = { ...task, startDate: newStartDate, dueDate: newDueDate };
      updateTaskInState(updatedTask);
    }
  };



  // Chat functions
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      content: chatInput,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      console.log('Iniciando criação de tarefas com IA...');
      console.log('API Key:', process.env.REACT_APP_GEMINI_API_KEY ? 'Presente' : 'Ausente');
      
      const response = await createTasksFromAI({
        userInput: chatInput,
        currentDate: new Date()
      });

      console.log('Resposta da IA:', response);

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai' as const,
        content: `Criei ${response.tasks.length} tarefa(s) para você!`,
        timestamp: new Date(),
        aiResponse: response
      };

      setChatMessages(prev => [...prev, aiMessage]);

      // Criar bloco sugerido APENAS se o usuário especificar um bloco novo
      let targetBlock = taskTypes.find(t => t.name === response.suggestedBlock);
      
      // Se não especificou bloco ou o bloco não existe, usar "Random"
      if (!response.suggestedBlock || !targetBlock) {
        targetBlock = taskTypes.find(t => t.name === 'Random');
        
        // Se não existir bloco "Random", criar um
        if (!targetBlock) {
          const randomBlock: TaskType = {
            id: Date.now().toString(),
            name: 'Random',
            color: '#5a6c7d',
            tasks: [],
            expanded: true,
            expandedByColumn: columns.reduce((acc, col) => ({
              ...acc,
              [col.id]: col.id === 'backlog' ? true : false
            }), {}),
            schedule: {
              monday: [],
              tuesday: [],
              wednesday: [],
              thursday: [],
              friday: [],
              saturday: [],
              sunday: []
            }
          };
          setTaskTypes(prev => [...prev, randomBlock]);
          targetBlock = randomBlock;
        }
      } else if (response.suggestedBlock && !targetBlock) {
        // Só criar bloco novo se o usuário explicitamente pedir
        const newBlock: TaskType = {
          id: Date.now().toString(),
          name: response.suggestedBlock,
          color: '#5a6c7d',
          tasks: [],
          expanded: true,
          expandedByColumn: columns.reduce((acc, col) => ({
            ...acc,
            [col.id]: col.id === 'backlog' ? true : false
          }), {}),
          schedule: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
          }
        };
        setTaskTypes(prev => [...prev, newBlock]);
        targetBlock = newBlock;
      }

      // Criar as tarefas sugeridas pela IA
      if (response.tasks && response.tasks.length > 0) {
        console.log('=== RESPOSTA DA IA ===');
        console.log('Response completa:', response);
        console.log('Tasks da IA:', response.tasks);
        
        const newTasks: Task[] = response.tasks.map((aiTask: any) => {
          console.log('Processando aiTask:', aiTask);
          // Processar datas
          let startDate = getTodayDate();
          let dueDate = getTodayDate();
          
          if (aiTask.startDate) {
            // Criar data em UTC para evitar problemas de fuso horário
            const [year, month, day] = aiTask.startDate.split('-').map(Number);
            startDate = new Date(Date.UTC(year, month - 1, day)); // month - 1 porque Date.UTC usa 0-11
          }
          
          if (aiTask.dueDate) {
            // Criar data em UTC para evitar problemas de fuso horário
            const [year, month, day] = aiTask.dueDate.split('-').map(Number);
            dueDate = new Date(Date.UTC(year, month - 1, day)); // month - 1 porque Date.UTC usa 0-11
          }
          
          // Processar compromissos com hora específica
          if (aiTask.taskType === 'compromisso' && aiTask.appointmentTime) {
            const appointmentDate = new Date(startDate);
            const [hours, minutes] = aiTask.appointmentTime.split(':');
            // Usar UTC para evitar problemas de fuso horário
            appointmentDate.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
            startDate = appointmentDate;
            dueDate = appointmentDate;
          }
          
          // Processar tarefas recorrentes
          if (aiTask.taskType === 'recorrente' && aiTask.recurringTime) {
            const [hours, minutes] = aiTask.recurringTime.split(':');
            
            // Para tarefas recorrentes, usar o próximo dia da semana correto
            if (aiTask.recurringDays && aiTask.recurringDays.length > 0) {
              const today = new Date();
              const currentDay = today.getDay(); // 0 = domingo, 1 = segunda, etc.
              
              // Mapear dias da semana para números (0 = domingo, 1 = segunda, etc.)
              const dayMap: { [key: string]: number } = {
                'sunday': 0, 'domingo': 0,
                'monday': 1, 'segunda': 1,
                'tuesday': 2, 'terça': 2,
                'wednesday': 3, 'quarta': 3,
                'thursday': 4, 'quinta': 4,
                'friday': 5, 'sexta': 5,
                'saturday': 6, 'sábado': 6
              };
              
              // Encontrar o próximo dia da semana correto
              let nextOccurrence = new Date(today);
              const targetDays = aiTask.recurringDays.map((day: string) => dayMap[day.toLowerCase()]).filter((day: number | undefined) => day !== undefined);
              
              if (targetDays.length > 0) {
                // Encontrar o próximo dia da semana que está na lista
                let daysToAdd = 0;
                for (let i = 1; i <= 7; i++) {
                  const checkDay = (currentDay + i) % 7;
                  if (targetDays.includes(checkDay)) {
                    daysToAdd = i;
                    break;
                  }
                }
                
                nextOccurrence.setDate(today.getDate() + daysToAdd);
                nextOccurrence.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                startDate = nextOccurrence;
                dueDate = nextOccurrence;
              }
            } else {
              // Fallback: usar o dia atual com a hora especificada
              const recurringDate = new Date(startDate);
              recurringDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
              startDate = recurringDate;
              dueDate = recurringDate;
            }
          }

          const newTask = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            title: aiTask.title,
            description: aiTask.description,
            priority: aiTask.priority,
            status: aiTask.status,
            createdAt: new Date(),
            startDate: startDate,
            dueDate: dueDate,
            taskType: aiTask.taskType,
            blockType: aiTask.blockType || response.suggestedBlock,
            recurringDays: aiTask.recurringDays || [],
            recurringTime: aiTask.recurringTime || '',
            appointmentTime: aiTask.appointmentTime || ''
          };
          
          console.log('Tarefa criada:', newTask);
          return newTask;
        });

        // Debug: verificar tipos de tarefas criadas
        console.log('=== DEBUG: TIPOS DE TAREFAS ===');
        newTasks.forEach(task => {
          console.log(`Tarefa: "${task.title}" - Tipo: ${task.taskType} - Recorrente: ${task.taskType === 'recorrente'}`);
        });
        
        // Adicionar as tarefas ao bloco correto (APENAS tarefas não recorrentes vão para o kanban)
        console.log('=== FILTRAGEM DE TAREFAS ===');
        console.log('Total de tarefas:', newTasks.length);
        newTasks.forEach((task, index) => {
          console.log(`Tarefa ${index + 1}:`, {
            title: task.title,
            taskType: task.taskType,
            isRecurring: task.taskType === 'recorrente',
            recurringDays: task.recurringDays
          });
        });
        
        const nonRecurringTasks = newTasks.filter(task => task.taskType !== 'recorrente');
        console.log('Tarefas não recorrentes (vão para kanban):', nonRecurringTasks.length);
        console.log('Tarefas recorrentes (vão para schedule):', newTasks.filter(task => task.taskType === 'recorrente').length);
        
        if (nonRecurringTasks.length > 0) {
          console.log('Adicionando tarefas não recorrentes ao kanban:', nonRecurringTasks.map(t => t.title));
          setTaskTypes(prev => prev.map(type => 
            type.name === targetBlock?.name
              ? { ...type, tasks: [...type.tasks, ...nonRecurringTasks] }
              : type
          ));
        }
        
        // Tarefas recorrentes NÃO vão para o kanban, mas vão para o gantt se tiverem data de fim

        // Adicionar tarefas recorrentes ao schedule E ao estado recurringTasks
        console.log('=== PROCESSANDO TAREFAS RECORRENTES ===');
        newTasks.forEach(task => {
          console.log(`Processando tarefa: "${task.title}" - Tipo: ${task.taskType} - Recorrente: ${task.taskType === 'recorrente'}`);
          console.log(`RecurringDays:`, task.recurringDays);
          console.log(`É recorrente e tem recurringDays?`, task.taskType === 'recorrente' && task.recurringDays && Array.isArray(task.recurringDays) && task.recurringDays.length > 0);
          
          // VERIFICAÇÃO CRÍTICA: Só processar como recorrente se for realmente recorrente
          if (task.taskType === 'recorrente' && task.recurringDays && Array.isArray(task.recurringDays) && task.recurringDays.length > 0) {
            // Adicionar ao schedule dos blocos
            setTaskTypes(prev => prev.map(type => {
              if (type.name === targetBlock?.name) {
                const updatedSchedule = { ...type.schedule };
                const recurringDays = task.recurringDays as string[];
                recurringDays.forEach(day => {
                  const dayKey = day as keyof typeof updatedSchedule;
                  const currentTasks = updatedSchedule[dayKey];
                  if (currentTasks && Array.isArray(currentTasks)) {
                    // Adicionar o título da tarefa ao schedule
                    updatedSchedule[dayKey] = [...currentTasks, task.title];
                  }
                });
                return { ...type, schedule: updatedSchedule };
              }
              return type;
            }));

            // Adicionar ao estado recurringTasks para aparecer em daily, weekly e monthly
            const newRecurringTask: RecurringTask = {
              id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              blockType: task.blockType,
              createdAt: task.createdAt,
              startDate: task.startDate,
              dueDate: task.dueDate,
              taskType: task.taskType as 'recorrente' | 'compromisso',
              recurringDays: task.recurringDays as string[],
              recurringTime: task.recurringTime || '',
              appointmentTime: task.appointmentTime || ''
            };
            setRecurringTasks(prev => {
              const newState = [...prev, newRecurringTask];
              console.log('Estado recurringTasks atualizado:', newState);
              return newState;
            });
          }
        });

        console.log('Tarefas criadas:', newTasks);
        console.log('Estado atualizado dos tipos de tarefa');
        console.log('Schedule atualizado para tarefas recorrentes');
        console.log('Estado final recurringTasks:', recurringTasks);
      }

    } catch (error) {
      console.error('Erro detalhado no chat:', error);
      
      let errorMessage = 'Desculpe, tive um problema ao processar sua solicitação. Tente novamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          errorMessage = 'Erro de configuração da API. Verifique as configurações.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Problema de conexão. Verifique sua internet.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Muitas solicitações. Aguarde um momento.';
        }
      }
      
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        type: 'ai' as const,
        content: errorMessage,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const toggleChat = () => {
    setChatOpen(!chatOpen);
    if (!chatOpen) {
      // Adicionar mensagem de boas-vindas quando abrir o chat
      const welcomeMessage = {
        id: Date.now().toString(),
        type: 'ai' as const,
        content: 'Olá! Sou seu assistente de produtividade. Como posso ajudar você hoje?',
        timestamp: new Date()
      };
      setChatMessages([welcomeMessage]);
    }
  };



  const updateTaskInState = (updatedTask: Task) => {
    setTaskTypes(prev => prev.map(type => ({
      ...type,
      tasks: type.tasks.map(task => 
        task.id === updatedTask.id ? updatedTask : task
      )
    })));
  };

  const handleSaveBlock = () => {
    if (!editingBlock || !editingBlock.name.trim()) return;

    if (editingBlock.id) {
      setTaskTypes(prev => prev.map(block => 
        block.id === editingBlock.id ? { 
          ...editingBlock, 
          name: editingBlock.name,
          color: selectedBlockColor,
          schedule: blockSchedule 
        } : block
      ));
    } else {
      const newBlock = {
        ...editingBlock,
        id: `block_${Date.now()}`,
        name: editingBlock.name,
        color: selectedBlockColor,
        tasks: [],
        schedule: blockSchedule
      };
      setTaskTypes(prev => [...prev, newBlock]);
    }
    
    setEditingBlock(null);
    setBlockSchedule({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    });
    setSelectedBlockColor('#5a6c7d');
    setNewTask({ ...newTask, title: '' });
    setScheduleMessage('');
  };

  const addScheduleTime = (day: string, time: string) => {
    if (!time.trim()) return;
    setBlockSchedule(prev => {
      const currentTimes = prev[day as keyof typeof prev] || [];
      
      // Verificar se o horário já existe
      if (currentTimes.includes(time.trim())) {
        setScheduleMessage('Horário já existe neste dia');
        setTimeout(() => setScheduleMessage(''), 3000);
        return prev; // Não adicionar se já existir
      }
      
      const newTimes = [...currentTimes, time.trim()];
      
      // Ordenar horários por hora de início (mais cedo primeiro)
      const sortedTimes = newTimes.sort((a, b) => {
        const timeA = a.split('–')[0].trim();
        const timeB = b.split('–')[0].trim();
        return timeA.localeCompare(timeB);
      });
      
      setScheduleMessage('Horário adicionado com sucesso!');
      setTimeout(() => setScheduleMessage(''), 3000);
      
      return {
        ...prev,
        [day]: sortedTimes
      };
    });
  };

  const removeScheduleTime = (day: string, timeIndex: number) => {
    setBlockSchedule(prev => ({
      ...prev,
      [day]: prev[day as keyof typeof prev].filter((_, index) => index !== timeIndex)
    }));
  };

  // Helper function to check if a block has schedule times
  const hasScheduleTimes = (block: TaskType): boolean => {
    if (!block.schedule) return false;
    const scheduleValues = Object.values(block.schedule);
    return scheduleValues.some(day => day && day.length > 0);
  };

  // Função para gerar instâncias de tarefas recorrentes para um dia específico
  const getRecurringTasksForDay = (date: Date): Task[] => {
    const instances: Task[] = [];
    
    // Debug: verificar se há tarefas recorrentes
    console.log('getRecurringTasksForDay - date:', date, 'recurringTasks count:', recurringTasks.length);
    console.log('recurringTasks:', recurringTasks);
    
    // Se não há tarefas recorrentes, retornar array vazio
    if (recurringTasks.length === 0) {
      console.log('Nenhuma tarefa recorrente encontrada');
      return instances;
    }
    
    recurringTasks.forEach(recurringTask => {
      console.log('Processing recurringTask:', recurringTask.title, 'recurringDays:', recurringTask.recurringDays, 'startDate:', recurringTask.startDate, 'dueDate:', recurringTask.dueDate);
      
      if (!recurringTask.recurringDays || recurringTask.recurringDays.length === 0) {
        console.log('Skipping task without recurringDays:', recurringTask.title);
        return;
      }
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      console.log('Checking task:', recurringTask.title, 'dayName:', dayName, 'recurringDays:', recurringTask.recurringDays);
      
      // Verificar se é um dia de recorrência
      if (recurringTask.recurringDays.includes(dayName)) {
        console.log('Day matches for task:', recurringTask.title);
        
        // Verificar se a data está dentro do intervalo de recorrência
        if (recurringTask.startDate) {
          const startDate = new Date(recurringTask.startDate);
          startDate.setHours(0, 0, 0, 0);
          const currentDate = new Date(date);
          currentDate.setHours(0, 0, 0, 0);
          
          if (currentDate < startDate) {
            console.log('Date before startDate for task:', recurringTask.title, 'date:', currentDate, 'startDate:', startDate);
            return; // Pular se ainda não chegou a data de início
          }
        }
        
        // Se tem data de fim, verificar se já passou
        if (recurringTask.dueDate) {
          const dueDate = new Date(recurringTask.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          const currentDate = new Date(date);
          currentDate.setHours(0, 0, 0, 0);
          
          if (currentDate > dueDate) {
            console.log('Date after dueDate for task:', recurringTask.title, 'date:', currentDate, 'dueDate:', dueDate);
            return; // Pular se já passou a data de fim
          }
        }
        
        console.log('Creating instance for task:', recurringTask.title, 'on date:', date);
        
        const instance: Task = {
          id: `${recurringTask.id}-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          title: recurringTask.title,
          description: recurringTask.description,
          priority: recurringTask.priority,
          status: 'to-do', // Tarefas recorrentes sempre começam como "to-do"
          createdAt: new Date(),
          startDate: date,
          dueDate: date,
          taskType: recurringTask.taskType,
          blockType: recurringTask.blockType,
          recurringDays: recurringTask.recurringDays,
          recurringTime: recurringTask.recurringTime,
          appointmentTime: recurringTask.appointmentTime
        };
        instances.push(instance);
      }
    });
    
    console.log('getRecurringTasksForDay - returning instances:', instances.length);
    return instances;
  };

  // Função para gerar instâncias de tarefas recorrentes para um mês específico
  const getRecurringTasksForMonth = (year: number, month: number): Task[] => {
    const instances: Task[] = [];
    
    // Debug: verificar se há tarefas recorrentes
    console.log('getRecurringTasksForMonth - year:', year, 'month:', month, 'recurringTasks count:', recurringTasks.length);
    console.log('recurringTasks:', recurringTasks);
    
    recurringTasks.forEach(recurringTask => {
      console.log('Processing recurringTask:', recurringTask.title, 'recurringDays:', recurringTask.recurringDays, 'startDate:', recurringTask.startDate, 'dueDate:', recurringTask.dueDate);
      
      if (!recurringTask.recurringDays || recurringTask.recurringDays.length === 0) {
        console.log('Skipping task without recurringDays:', recurringTask.title);
        return;
      }
      
      // Verificar se o mês está dentro do intervalo de recorrência
      if (recurringTask.startDate && recurringTask.dueDate) {
        const startDate = new Date(recurringTask.startDate);
        startDate.setHours(0, 0, 0, 0);
        const dueDate = new Date(recurringTask.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        
        // Se o mês está fora do intervalo, não criar instâncias
        const monthStart = new Date(year, month, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        if (monthEnd < startDate || monthStart > dueDate) {
          console.log('Month outside range for task:', recurringTask.title, 'monthStart:', monthStart, 'monthEnd:', monthEnd, 'startDate:', startDate, 'dueDate:', dueDate);
          return;
        }
      }
      
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      console.log('Processing task:', recurringTask.title, 'daysInMonth:', daysInMonth);
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        
        // Verificar se é um dia de recorrência E se está dentro do período
        if (recurringTask.recurringDays.includes(dayName)) {
          console.log('Day matches for task:', recurringTask.title, 'day:', day, 'dayName:', dayName);
          
          // Se tem data de início, verificar se já passou
          if (recurringTask.startDate) {
            const startDate = new Date(recurringTask.startDate);
            startDate.setHours(0, 0, 0, 0);
            const currentDate = new Date(date);
            currentDate.setHours(0, 0, 0, 0);
            
            if (currentDate < startDate) {
              console.log('Date before startDate for task:', recurringTask.title, 'date:', currentDate, 'startDate:', startDate);
              continue; // Pular se ainda não chegou a data de início
            }
          }
          
          // Se tem data de fim, verificar se já passou
          if (recurringTask.dueDate) {
            const dueDate = new Date(recurringTask.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const currentDate = new Date(date);
            currentDate.setHours(0, 0, 0, 0);
            
            if (currentDate > dueDate) {
              console.log('Date after dueDate for task:', recurringTask.title, 'date:', currentDate, 'dueDate:', dueDate);
              continue; // Pular se já passou a data de fim
            }
          }
          
          console.log('Creating instance for task:', recurringTask.title, 'on date:', date);
          
          const instance: Task = {
            id: `${recurringTask.id}-${year}-${month}-${day}`,
            title: recurringTask.title,
            description: recurringTask.description,
            priority: recurringTask.priority,
            status: 'to-do', // Tarefas recorrentes sempre começam como "to-do"
            createdAt: new Date(),
            startDate: date,
            dueDate: date,
            taskType: recurringTask.taskType,
            blockType: recurringTask.blockType,
            recurringDays: recurringTask.recurringDays,
            recurringTime: recurringTask.recurringTime,
            appointmentTime: recurringTask.appointmentTime
          };
          instances.push(instance);
        }
      }
    });
    
    console.log('getRecurringTasksForMonth - returning instances:', instances.length);
    return instances;
  };

  // Function to expand a specific block from schedule
  const expandBlockFromSchedule = (blockId: string) => {
    setExpandedBlockFromSchedule(blockId);
    setCurrentPage('kanban');
    
    // Collapse all blocks and expand only the selected one in all columns
    setTaskTypes(prev => prev.map(type => ({
      ...type,
      expandedByColumn: type.id === blockId 
        ? columns.reduce((acc, col) => ({
            ...acc,
            [col.id]: true
          }), {})
        : columns.reduce((acc, col) => ({
            ...acc,
            [col.id]: false
          }), {})
    })));
  };

  // Remove an item from a block's schedule for a given day
  const handleDeleteScheduleItem = (
    blockId: string,
    day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    value: string
  ) => {
    // Remover do schedule
    setTaskTypes(prev => prev.map(block => {
      if (block.id !== blockId || !block.schedule) return block;
      const currentDayValues = block.schedule[day] || [];
      const updatedDayValues = currentDayValues.filter(entry => entry !== value);
      const updatedSchedule = { ...block.schedule, [day]: updatedDayValues };
      return { ...block, schedule: updatedSchedule };
    }));
    
    // Remover do estado recurringTasks se for uma tarefa recorrente
    setRecurringTasks(prev => {
      const updatedRecurringTasks = prev.filter(task => task.title !== value);
      console.log('Tarefa recorrente removida do estado:', value);
      console.log('Estado recurringTasks atualizado:', updatedRecurringTasks);
      return updatedRecurringTasks;
    });
    
    setScheduleMessage('Item removido do schedule e das visualizações com sucesso.');
    setTimeout(() => setScheduleMessage(''), 1500);
  };

  // Function to clear the expanded block and restore previous state
  const clearExpandedBlock = () => {
    setExpandedBlockFromSchedule(null);
    
    // Restore default expansion state (all blocks expanded in backlog)
    setTaskTypes(prev => prev.map(type => ({
      ...type,
      expandedByColumn: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: col.id === 'backlog' ? true : false
      }), {})
    })));
  };

  const sortTasksByPriority = (tasks: Task[]) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return tasks.sort((a, b) => {
      // First sort by priority (high > medium > low)
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same priority, sort by creation date (oldest first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  };

  const filterTasks = (tasks: Task[]) => {
    let filteredTasks = tasks;
    
    // Apply search filter if search term exists
    if (searchTerm) {
      filteredTasks = tasks.filter(task =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Sort by priority and creation date
    return sortTasksByPriority(filteredTasks);
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
          // Update task with new status in a single operation
          const updatedTask = { ...taskToMove, status: overId };
          setTaskTypes(prev => prev.map(type => {
            if (type.id === sourceType) {
              return { 
                ...type, 
                tasks: overId === 'done' 
                  ? reorganizeTasksWithDoneAtTop([...type.tasks.filter(t => t.id !== activeId), updatedTask])
                  : [...type.tasks.filter(t => t.id !== activeId), updatedTask]
              };
            }
            return type;
          }));
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
          variant={currentPage === 'kanban' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('kanban')}
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
        <Button
          variant={currentPage === 'daily' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('daily')}
          sx={{ 
            backgroundColor: currentPage === 'daily' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'daily' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'daily' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          daily
        </Button>
        <Button
          variant={currentPage === 'weekly' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('weekly')}
          sx={{ 
            backgroundColor: currentPage === 'weekly' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'weekly' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'weekly' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          weekly
        </Button>
        <Button
          variant={currentPage === 'monthly' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('monthly')}
          sx={{ 
            backgroundColor: currentPage === 'monthly' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'monthly' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'monthly' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          monthly
        </Button>
        <Button
          variant={currentPage === 'yearly' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('yearly')}
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
          variant={currentPage === 'schedule' ? 'contained' : 'outlined'}
          onClick={() => handlePageChange('schedule')}
          sx={{ 
            backgroundColor: currentPage === 'schedule' ? '#5a6c7d' : 'transparent',
            color: currentPage === 'schedule' ? '#ffffff' : '#4a5568',
            borderColor: '#8fa3b3',
            '&:hover': { 
              backgroundColor: currentPage === 'schedule' ? '#4a5568' : '#f1f5f8'
            }
          }}
        >
          schedule
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
      {/* Highlight message */}
      {expandedBlockFromSchedule && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: 2,
          py: 1,
          mb: 1,
          backgroundColor: 'rgba(90,108,125,0.1)',
          borderRadius: 1,
          border: '1px solid rgba(90,108,125,0.2)'
        }}>
          <Typography variant="body2" sx={{ 
            color: '#5a6c7d',
            fontWeight: 500
          }}>
            📋 Mostrando apenas atividades de: {taskTypes.find(t => t.id === expandedBlockFromSchedule)?.name}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={clearExpandedBlock}
            sx={{
              borderColor: '#5a6c7d',
              color: '#5a6c7d',
              fontSize: '0.75rem',
              py: 0.25,
              px: 1,
              '&:hover': {
                borderColor: '#4a5568',
                backgroundColor: 'rgba(90,108,125,0.1)'
              }
            }}
          >
            mostrar todas
          </Button>
        </Box>
      )}
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
        

        
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
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
          <Button
            variant="outlined"
            startIcon={<ViewColumnIcon />}
            onClick={() => setOpenColumnsDialog(true)}
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
            manage columns
          </Button>
          <Button
            variant="outlined"
            startIcon={<ViewListIcon />}
            onClick={() => setOpenTasksDialog(true)}
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
            manage tasks
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleAddTask(undefined, 'backlog')}
            sx={{
              backgroundColor: '#5a6c7d',
              color: '#ffffff',
              '&:hover': { 
                backgroundColor: '#4a5568'
              },
              px: 2,
              py: 0.75,
              fontSize: '0.875rem'
            }}
          >
            add new task
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
        e.stopPropagation(); // Prevent column drag when dragging task
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.setData('type', 'task'); // Identify as task drag
        e.dataTransfer.setData('priority', task.priority); // Include current priority
        e.dataTransfer.setData('status', task.status); // Include current status
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
      onClick={(e) => {
        e.stopPropagation(); // Prevent column click when clicking task
        handleTaskClick(task);
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <DragIndicatorIcon sx={{ color: '#6b7d8f', fontSize: 16 }} />
          <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>
            {task.title}
              </Typography>
          </Box>
        <Box sx={{ display: 'flex', gap: 0.5, opacity: 0, '&:hover': { opacity: 1 } }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleMarkTaskDone(task.id);
            }}
            sx={{ color: '#52c396', '&:hover': { color: '#38a169' } }}
          >
            <CheckIcon sx={{ fontSize: 16 }} />
        </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleMoveTask(task.id);
            }}
            sx={{ color: '#4a9eff', '&:hover': { color: '#3182ce' } }}
          >
            <DragIndicatorIcon sx={{ fontSize: 16 }} />
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
      
      <Typography variant="caption" sx={{ color: '#6b7d8f', mb: 1.5, display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {task.description}
      </Typography>
      
      {/* Recurring Task Indicator */}
      {task.taskType === 'recorrente' && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label="🔄 recorrente"
              size="small"
              sx={{
                backgroundColor: '#e6fffa',
                color: '#319795',
                border: '1px solid #81e6d9',
                fontSize: '0.7rem',
                height: 18
              }}
            />
            {task.recurringDays && task.recurringDays.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {task.recurringDays.map((day) => {
                  const dayLabels: Record<string, string> = {
                    monday: 'Seg',
                    tuesday: 'Ter',
                    wednesday: 'Qua',
                    thursday: 'Qui',
                    friday: 'Sex',
                    saturday: 'Sáb',
                    sunday: 'Dom'
                  };
                  return (
                    <Chip
                      key={day}
                      label={dayLabels[day] || day}
                      size="small"
                      sx={{
                        backgroundColor: '#f7fafc',
                        color: '#4a5568',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.65rem',
                        height: 16,
                        minWidth: 28
                      }}
                    />
                  );
                })}
              </Box>
            )}
            {task.recurringTime && (
              <Chip
                label={`⏰ ${task.recurringTime}`}
                size="small"
                sx={{
                  backgroundColor: '#fff5f5',
                  color: '#c53030',
                  border: '1px solid #fed7d7',
                  fontSize: '0.7rem',
                  height: 18
                }}
              />
            )}
          </Box>
        </Box>
      )}
      
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
                sx={{
                  flex: 1, 
                  minWidth: 300
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
                  <Box 
                    draggable
                    onDragStart={(e) => handleColumnDragStart(e, columnId)}
                    sx={{ 
                      px: 2, 
                      py: 1.5, 
                      borderBottom: '1px solid #8fa3b3',
                      cursor: 'grab',
                      '&:active': {
                        cursor: 'grabbing'
                      },
                  '&:hover': {
                        backgroundColor: '#f8fafb'
                  }
                }}
              >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DragIndicatorIcon sx={{ color: '#6b7d8f', fontSize: 16 }} />
                      <Typography variant="subtitle1" sx={{ color: '#4a5568', fontWeight: 500, flex: 1 }}>
                        {column.name}
              </Typography>
                      
                      {/* Expand/Collapse all blocks button for backlog column */}
                      {columnId === 'backlog' && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAllBlocksExpansion();
                          }}
                            sx={{ 
                            color: '#6b7d8f',
                            '&:hover': { 
                              color: '#4a5568',
                              backgroundColor: 'rgba(90,108,125,0.1)'
                            }
                          }}
                        >
                          {backlogExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      )}
                      
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent column drag when clicking add button
                          handleAddTask(undefined, columnId);
                        }}
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
                      const dragType = e.dataTransfer.types.includes('type') ? 'task' : 'unknown';
                      if (dragType === 'task') {
                        e.currentTarget.style.backgroundColor = '#e2e8f0';
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.backgroundColor = columnId === 'backlog' ? 'transparent' : '#f8fafb';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.backgroundColor = columnId === 'backlog' ? 'transparent' : '#f8fafb';
                      
                      // Use the centralized drop handler
                      handleColumnDrop(e, columnId);
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
                    {taskTypes.map(type => {
                      const tasksInColumn = type.tasks.filter(task => task.status === columnId);
                      if (tasksInColumn.length === 0) return null;
                          
                          return (
                        <Box key={type.id} sx={{ mb: 2 }}>
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                              mb: 1,
                              p: 1,
                              borderRadius: 1,
                              backgroundColor: type.expandedByColumn?.[columnId] ? 'rgba(168,181,209,0.1)' : 'transparent',
                              '&:hover': { backgroundColor: 'rgba(168,181,209,0.05)' }
                            }}
                            onClick={() => toggleTypeExpansion(type.id, columnId)}
                          >
                            <Box 
                                  sx={{ 
                                width: 12, 
                                height: 12, 
                                borderRadius: '50%', 
                                backgroundColor: type.color, 
                                mr: 2,
                                border: expandedBlockFromSchedule === type.id ? '2px solid #4a5568' : 'none',
                                boxShadow: expandedBlockFromSchedule === type.id ? '0 0 0 2px rgba(74,85,104,0.3)' : 'none'
                              }} 
                            />
                                                        <Typography variant="subtitle2" sx={{ 
                              flex: 1, 
                              color: expandedBlockFromSchedule === type.id ? '#5a6c7d' : 
                                    expandedBlockFromSchedule && expandedBlockFromSchedule !== type.id ? '#9ca3af' : '#1f2937', 
                              fontWeight: expandedBlockFromSchedule === type.id ? 600 : 500,
                              opacity: expandedBlockFromSchedule && expandedBlockFromSchedule !== type.id ? 0.6 : 1
                            }}>
                              {type.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6b7280', mr: 1 }}>
                              {tasksInColumn.length}
                            </Typography>
                            
                            {/* Add Task button */}
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTask(type.id, columnId);
                              }}
                              sx={{ 
                                color: '#52c396',
                                opacity: 0.8,
                                mr: 0.5,
                                '&:hover': { 
                                  opacity: 1,
                                  backgroundColor: 'rgba(82,195,150,0.1)' 
                                }
                              }}
                            >
                              <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>

                            {/* Delete button */}
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeleteConfirm(type.id, type.name, columnId);
                              }}
                              sx={{
                                color: '#e53e3e',
                                opacity: 0.7,
                                mr: 0.5,
                                '&:hover': { 
                                  opacity: 1,
                                  backgroundColor: 'rgba(229,62,62,0.1)' 
                                }
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: 14 }} />
        </IconButton>
                            
                                                        {type.expandedByColumn?.[columnId] ? <ExpandLessIcon sx={{ color: '#6b7280' }} /> : <ExpandMoreIcon sx={{ color: '#6b7280' }} />}
                            
                            {/* Clear highlight button */}
                            {expandedBlockFromSchedule === type.id && (
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearExpandedBlock();
                                }}
                                sx={{ 
                                  color: '#6b7280',
                                  '&:hover': { 
                                    color: '#4a5568',
                                    backgroundColor: 'rgba(74,85,104,0.1)'
                                  }
                                }}
                              >
                                <CloseIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            )}
                          </Box>
                  
                          <Collapse in={type.expandedByColumn?.[columnId] || false}>
                            <Box sx={{ pl: 2, space: 1 }}>
                              {/* Top drop zone for high priority */}
                              <Box
                            sx={{ 
                                  height: 20,
                                  backgroundColor: 'transparent',
                                  border: '2px dashed transparent',
                                  borderRadius: 1,
                                  mb: 1,
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    borderColor: '#ef4444'
                                  }
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
                                  e.currentTarget.style.borderColor = '#ef4444';
                                }}
                                onDragLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                                onDrop={(e) => handleTaskDrop(e, columnId, type.id, 'top')}
                              />
                              
                              {/* Render tasks with drop zones between them */}
                              {(columnId === 'done' ? reorganizeTasksWithDoneAtTop(tasksInColumn) : filterTasks(tasksInColumn)).map((task, index) => (
                                <Box key={task.id}>
                                  {renderTaskCard(task)}
                                  
                                  {/* Middle drop zone for medium priority (between tasks) */}
                                  {index < filterTasks(tasksInColumn).length - 1 && (
                                    <Box
                                      sx={{
                                        height: 16,
                                        backgroundColor: 'transparent',
                                        border: '2px dashed transparent',
                                        borderRadius: 1,
                                        my: 0.5,
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                          backgroundColor: 'rgba(245,158,11,0.1)',
                                          borderColor: '#f59e0b'
                                        }
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.1)';
                                        e.currentTarget.style.borderColor = '#f59e0b';
                                      }}
                                      onDragLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.borderColor = 'transparent';
                                      }}
                                      onDrop={(e) => handleTaskDrop(e, columnId, type.id, 'middle')}
                                    />
                  )}
                </Box>
              ))}
                              
                              {/* Bottom drop zone for low priority */}
                              <Box
                    sx={{
                                  height: 20,
                                  backgroundColor: 'transparent',
                                  border: '2px dashed transparent',
                                  borderRadius: 1,
                                  mt: 1,
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    backgroundColor: 'rgba(34,197,94,0.1)',
                                    borderColor: '#22c55e'
                                  }
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)';
                                  e.currentTarget.style.borderColor = '#22c55e';
                                }}
                                onDragLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                                onDrop={(e) => handleTaskDrop(e, columnId, type.id, 'bottom')}
                              />
                              
                              {tasksInColumn.length === 0 && (
                                <Typography variant="caption" sx={{ color: '#6b7280', fontStyle: 'italic', pl: 2 }}>
                                  No tasks
                                </Typography>
                              )}
                            </Box>
                          </Collapse>
                            
                            {/* Add New Task Button at the end of each block */}
                            <Box sx={{ pl: 2, mt: 1 }}>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddTask(type.id, columnId);
                                }}
                                sx={{
                                  width: '100%',
                                  justifyContent: 'flex-start',
                                  textTransform: 'none',
                                  borderColor: '#8fa3b3',
                                  color: '#4a5568',
                                  fontSize: '0.75rem',
                                  py: 0.5,
                                  '&:hover': {
                                    borderColor: '#5a6c7d',
                                    backgroundColor: '#f1f5f8'
                                  }
                                }}
                              >
                                add new task
                              </Button>
                  </Box>
                            
              </Box>
                          );
                        })}
                    
                    {taskTypes.every(type => type.tasks.filter(task => task.status === columnId).length === 0) && (
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
    
    // Sort search results by priority and creation date
    const sortedSearchResults = searchResults.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      
      // First sort by priority (high > medium > low)
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same priority, sort by creation date (oldest first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    
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
          {sortedSearchResults.map((task) => (
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
                  handleTaskClick(task);
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
                    backgroundColor: '#f1f5f8',
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



  // Chat Component
  const renderChat = () => (
    <>
      {/* Chat Toggle Button */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1000
        }}
      >
        <IconButton
          onClick={toggleChat}
          sx={{
            backgroundColor: chatOpen ? '#5a6c7d' : '#5a6c7d',
            color: '#ffffff',
            width: 56,
            height: 56,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            '&:hover': {
              backgroundColor: chatOpen ? '#4a5568' : '#4a5568',
              transform: 'scale(1.05)'
            },
            transition: 'all 0.2s'
          }}
        >
          {chatOpen ? <CloseIcon /> : <AutoAwesomeIcon />}
        </IconButton>
      </Box>

      {/* Chat Window */}
      {chatOpen && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 90,
            right: 20,
            width: 350,
            height: 500,
            backgroundColor: '#ffffff',
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            border: '1px solid #f1f5f8',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Chat Header */}
          <Box
            sx={{
              backgroundColor: '#5a6c7d',
              color: '#ffffff',
              p: 2,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Assistente IA
            </Typography>
          </Box>

          {/* Chat Messages */}
          <Box
            sx={{
              flex: 1,
              p: 2,
              overflow: 'auto',
              backgroundColor: '#f8fafb',
              display: 'flex',
              flexDirection: 'column',
              gap: 1
            }}
          >
            {chatMessages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1
                }}
              >
                <Box
                  sx={{
                    maxWidth: '80%',
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: message.type === 'user' ? '#5a6c7d' : '#ffffff',
                    color: message.type === 'user' ? '#ffffff' : '#4a5568',
                    border: message.type === 'ai' ? '1px solid #f1f5f8' : 'none',
                    boxShadow: message.type === 'ai' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                    {message.content}
                  </Typography>
                  <Typography variant="caption" sx={{ 
                    opacity: 0.7, 
                    display: 'block', 
                    mt: 0.5,
                    fontSize: '0.7rem'
                  }}>
                    {message.timestamp.toLocaleTimeString('pt-BR', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </Typography>
                </Box>
              </Box>
            ))}
            
            {isChatLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <CircularProgress size={16} sx={{ color: '#5a6c7d' }} />
                  <Typography variant="body2" sx={{ color: '#6b7d8f', fontSize: '0.875rem' }}>
                    Pensando...
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

                  {/* Chat Input */}
        <Box
          component="form"
          onSubmit={handleChatSubmit}
          sx={{
            p: 2,
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff'
          }}
        >
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Digite sua mensagem..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#f8fafb',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&:focus .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                }
              }}
            />
            <IconButton
              type="submit"
              disabled={!chatInput.trim() || isChatLoading}
              sx={{
                backgroundColor: '#5a6c7d',
                color: '#ffffff',
                '&:hover': { backgroundColor: '#4a5568' },
                '&:disabled': { backgroundColor: '#cbd5e0' }
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          

        </Box>
        </Box>
      )}
    </>
  );



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
              <InputLabel sx={{ color: '#6b7d8f', backgroundColor: '#ffffff', px: 0.5 }}>priority</InputLabel>
              <Select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                sx={{
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#8fa3b3'
                  },
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
            
            {/* Só mostrar status se for tarefa geral */}
            {newTask.taskType === 'geral' && (
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#6b7d8f', backgroundColor: '#ffffff', px: 0.5 }}>status</InputLabel>
                <Select
                  value={newTask.status}
                  onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                  sx={{
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#8fa3b3'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#5a6c7d'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#5a6c7d'
                    }
                  }}
                >
                  <MenuItem value="backlog">backlog</MenuItem>
                  <MenuItem value="to-do">to do</MenuItem>
                  <MenuItem value="in-progress">in progress</MenuItem>
                  <MenuItem value="done">done</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="start date"
              type="date"
              value={newTask.startDate ? newTask.startDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setNewTask({ ...newTask, startDate: new Date(e.target.value) })}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  color: '#4a5568',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#8fa3b3'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                },
                '& .MuiInputLabel-root': {
                  color: '#6b7d8f',
                  backgroundColor: '#ffffff',
                  px: 0.5
                },
                '& .MuiInputBase-input': {
                  color: '#4a5568'
                }
              }}
            />
            
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
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#8fa3b3'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#5a6c7d'
                  }
                },
                '& .MuiInputLabel-root': {
                  color: '#6b7d8f',
                  backgroundColor: '#ffffff',
                  px: 0.5
                },
                '& .MuiInputBase-input': {
                  color: '#4a5568'
                }
              }}
            />
          </Box>
          
          {/* Task Type Section */}
          <Box sx={{ 
            border: '1px solid #e2e8f0', 
            borderRadius: 1, 
            p: 2, 
            backgroundColor: '#f8fafb' 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500 }}>
                tipo da task
              </Typography>
              <FormControl>
                <Select
                  value={newTask.taskType}
                  onChange={(e) => setNewTask({ 
                    ...newTask, 
                    taskType: e.target.value as 'geral' | 'recorrente' | 'compromisso',
                    recurringDays: e.target.value !== 'geral' ? newTask.recurringDays || [] : [],
                    recurringTime: e.target.value !== 'geral' ? newTask.recurringTime || '' : '',
                    appointmentTime: e.target.value === 'compromisso' ? newTask.appointmentTime || '' : ''
                  })}
                  size="small"
                  sx={{
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    minWidth: 120,
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#8fa3b3'
                    }
                  }}
                >
                  <MenuItem value="geral">geral</MenuItem>
                  <MenuItem value="recorrente">recorrente</MenuItem>
                  <MenuItem value="compromisso">compromisso</MenuItem>
                </Select>
              </FormControl>
            </Box>
            
            {newTask.taskType !== 'geral' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Recurring Days */}
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7d8f', mb: 1 }}>
                    dias da semana:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {[
                      { value: 'monday', label: 'Segunda' },
                      { value: 'tuesday', label: 'Terça' },
                      { value: 'wednesday', label: 'Quarta' },
                      { value: 'thursday', label: 'Quinta' },
                      { value: 'friday', label: 'Sexta' },
                      { value: 'saturday', label: 'Sábado' },
                      { value: 'sunday', label: 'Domingo' }
                    ].map((day) => (
                      <Chip
                        key={day.value}
                        label={day.label}
                        onClick={() => {
                          const currentDays = newTask.recurringDays || [];
                          const newDays = currentDays.includes(day.value)
                            ? currentDays.filter(d => d !== day.value)
                            : [...currentDays, day.value];
                          setNewTask({ ...newTask, recurringDays: newDays });
                        }}
                        sx={{
                          backgroundColor: (newTask.recurringDays || []).includes(day.value) 
                            ? '#5a6c7d' 
                            : '#e2e8f0',
                          color: (newTask.recurringDays || []).includes(day.value) 
                            ? '#ffffff' 
                            : '#4a5568',
                          cursor: 'pointer',
                          '&:hover': {
                            backgroundColor: (newTask.recurringDays || []).includes(day.value) 
                              ? '#4a5568' 
                              : '#cbd5e0'
                          }
                        }}
                      />
                    ))}
                  </Box>
                </Box>
                
                {/* Recurring Time */}
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7d8f', mb: 1 }}>
                    horário:
                  </Typography>
                  <TextField
                    placeholder="ex: 15:00"
                    value={newTask.recurringTime || ''}
                    onChange={(e) => setNewTask({ ...newTask, recurringTime: e.target.value })}
                    size="small"
                    sx={{
                      width: 120,
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
                      }
                    }}
                  />
                </Box>

                {/* Recurring Date Range - Só para tarefas recorrentes */}
                {newTask.taskType === 'recorrente' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7d8f', mb: 1 }}>
                      período de recorrência:
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField
                        label="data início"
                        type="date"
                        value={newTask.startDate ? newTask.startDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => setNewTask({ ...newTask, startDate: new Date(e.target.value) })}
                        size="small"
                        sx={{
                          backgroundColor: '#ffffff',
                          color: '#4a5568',
                          '& .MuiOutlinedInput-root': {
                            borderColor: '#8fa3b3',
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            }
                          },
                          '& .MuiInputLabel-root': {
                            color: '#6b7d8f',
                            backgroundColor: '#ffffff',
                            px: 0.5
                          },
                          '& .MuiInputBase-input': {
                            color: '#4a5568'
                          }
                        }}
                      />
                      
                      <TextField
                        label="data fim (opcional)"
                        type="date"
                        value={newTask.dueDate ? newTask.dueDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value ? new Date(e.target.value) : undefined })}
                        size="small"
                        sx={{
                          backgroundColor: '#ffffff',
                          color: '#4a5568',
                          '& .MuiOutlinedInput-root': {
                            borderColor: '#8fa3b3',
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#5a6c7d'
                            }
                          },
                          '& .MuiInputLabel-root': {
                            color: '#6b7d8f',
                            backgroundColor: '#ffffff',
                            px: 0.5
                          },
                          '& .MuiInputBase-input': {
                            color: '#4a5568'
                          }
                        }}
                      />
                    </Box>
                    
                    <Typography variant="caption" sx={{ color: '#8fa3b3', fontStyle: 'italic' }}>
                      💡 Deixe a data fim em branco para recorrência indefinida
                    </Typography>
                  </Box>
                )}
                
                {/* Appointment Time for Compromissos */}
                {newTask.taskType === 'compromisso' && (
                  <Box>
                    <Typography variant="body2" sx={{ color: '#6b7d8f', mb: 1 }}>
                      hora do compromisso:
                    </Typography>
                    <TextField
                      placeholder="ex: 15:00"
                      value={newTask.appointmentTime || ''}
                      onChange={(e) => setNewTask({ ...newTask, appointmentTime: e.target.value })}
                      size="small"
                      sx={{
                        width: 120,
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
                        }
                      }}
                    />
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 4, justifyContent: 'space-between' }}>
          {/* Botão de deletar (só aparece quando editando uma tarefa existente) */}
          {selectedTask && (
            <Button
              onClick={() => {
                if (selectedTask) {
                  handleDeleteTask(selectedTask.id);
                  handleCloseTaskDialog();
                }
              }}
              variant="outlined"
              color="error"
              sx={{ 
                borderColor: '#ef4444',
                color: '#ef4444',
                '&:hover': { 
                  borderColor: '#dc2626',
                  backgroundColor: '#fef2f2'
                }
              }}
            >
              delete
            </Button>
          )}
          
          {/* Botões de ação (cancelar e salvar/atualizar) */}
          <Box sx={{ display: 'flex', gap: 2 }}>
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
      </Box>
    </Dialog>
  );

  const renderColumnsDialog = () => (
    <Dialog open={openColumnsDialog} onClose={() => setOpenColumnsDialog(false)} maxWidth="sm" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#4a5568', mb: 3, fontWeight: 600 }}>
          manage columns
        </Typography>
        
        {/* Columns List */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {columnOrder.map((columnId, index) => {
              const column = getColumnById(columnId);
              if (!column) return null;
              
              const columnTasks = taskTypes.flatMap(type => 
                type.tasks.filter(task => task.status === columnId)
              );

                    return (
                      <Box
                  key={columnId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', columnId);
                    e.dataTransfer.setData('type', 'column-reorder');
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const draggedColumnId = e.dataTransfer.getData('text/plain') as KanbanColumn;
                    const dragType = e.dataTransfer.getData('type');
                    
                    if (dragType === 'column-reorder' && draggedColumnId !== columnId) {
                      const draggedIndex = columnOrder.indexOf(draggedColumnId);
                      const targetIndex = columnOrder.indexOf(columnId);
                      
                      if (draggedIndex !== -1 && targetIndex !== -1) {
                        const newColumnOrder = [...columnOrder];
                        const [draggedColumn] = newColumnOrder.splice(draggedIndex, 1);
                        newColumnOrder.splice(targetIndex, 0, draggedColumn);
                        setColumnOrder(newColumnOrder);
                      }
                    }
                  }}
                        sx={{
                                border: '1px solid #f1f5f8',
            borderRadius: 1,
            backgroundColor: '#ffffff',
                    cursor: 'grab',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: '#8fa3b3',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    },
                    '&:active': {
                      cursor: 'grabbing'
                    }
                  }}
                >
                  {/* Column Header */}
                  <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                    gap: 2, 
                    p: 2
                  }}>
                    <DragIndicatorIcon sx={{ color: '#8fa3b3', fontSize: 16 }} />
                    
                    <Box 
                              sx={{
                        width: 3, 
                        height: 16, 
                        backgroundColor: column.color, 
                        borderRadius: 0.5 
                      }} 
                    />
                    
                    {editingColumn?.id === columnId ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <TextField
                          size="small"
                          value={editingColumn.name}
                          onChange={(e) => setEditingColumn({ ...editingColumn, name: e.target.value })}
                          sx={{ flex: 1 }}
                          autoFocus
                        />
                        <IconButton size="small" onClick={handleSaveColumnName}>
                          <CheckIcon sx={{ fontSize: 16, color: '#52c396' }} />
                        </IconButton>
                        <IconButton size="small" onClick={handleCancelColumnEdit}>
                          <CloseIcon sx={{ fontSize: 16, color: '#e53e3e' }} />
                        </IconButton>
                      </Box>
                    ) : (
                      <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                          <Typography variant="body1" sx={{ color: '#4a5568', fontWeight: 500 }}>
                            {column.name}
                          </Typography>
                          {column.fixed && (
                            <Typography variant="caption" sx={{ 
                              color: '#8fa3b3', 
                              fontStyle: 'italic',
                              backgroundColor: '#f1f5f8',
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                              fontSize: '0.7rem'
                            }}>
                              fixed
                            </Typography>
                          )}
                        </Box>
                        {!column.fixed && (
                          <IconButton 
                            size="small" 
                            onClick={() => handleEditColumn(columnId, column.name)}
                            sx={{ color: '#8fa3b3', '&:hover': { color: '#5a6c7d' } }}
                          >
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        )}
                      </>
                    )}
                    
                    <Typography variant="caption" sx={{ color: '#8fa3b3', minWidth: 40, textAlign: 'right' }}>
                      {columnTasks.length}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
                  </Box>
                  
        {/* Add New Column Section */}
        <Box sx={{ mb: 3, p: 2, border: '1px dashed #cbd5e0', borderRadius: 1, backgroundColor: '#f8fafb' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="new column name"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={handleAddNewColumn}
              disabled={!newColumnName.trim()}
              size="small"
                            sx={{ 
                borderColor: '#8fa3b3',
                color: '#4a5568',
                '&:hover': {
                  borderColor: '#5a6c7d',
                  backgroundColor: '#f1f5f8'
                },
                '&:disabled': {
                  borderColor: '#e2e8f0',
                  color: '#a0aec0'
                }
              }}
            >
              add
            </Button>
                          </Box>
                </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={() => setOpenColumnsDialog(false)}
            sx={{
              backgroundColor: '#5a6c7d',
              '&:hover': { backgroundColor: '#4a5568' }
            }}
          >
            done
          </Button>
        </Box>
      </Box>
    </Dialog>
  );

  const renderBlocksDialog = () => (
    <Dialog open={openBlocksDialog} onClose={() => setOpenBlocksDialog(false)} maxWidth="md" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#4a5568', mb: 3, fontWeight: 600 }}>
          {editingBlock ? `editar block: ${editingBlock.name}` : 'manage blocks'}
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
                  {hasScheduleTimes(block) && (
                    <Chip
                      label="tem horários"
                      size="small"
                      sx={{ 
                        backgroundColor: '#48bb78',
                        color: '#ffffff',
                        fontSize: '0.75rem'
                      }}
                    />
                  )}
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
                          onClick={() => {
                            setEditingBlock(block);
                            setBlockSchedule({
                              monday: block.schedule?.monday || [],
                              tuesday: block.schedule?.tuesday || [],
                              wednesday: block.schedule?.wednesday || [],
                              thursday: block.schedule?.thursday || [],
                              friday: block.schedule?.friday || [],
                              saturday: block.schedule?.saturday || [],
                              sunday: block.schedule?.sunday || []
                            });
                            setSelectedBlockColor(block.color);
                            setNewBlockName(block.name);
                          }}
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
        
        {/* Add/Edit Block */}
        <Box sx={{ 
          pt: 2, 
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <TextField
              label={editingBlock ? "nome do block" : "block name"}
              value={editingBlock ? editingBlock.name : newBlockName}
              onChange={(e) => editingBlock ? setEditingBlock({ ...editingBlock, name: e.target.value }) : setNewBlockName(e.target.value)}
              placeholder={editingBlock ? "nome do block..." : "enter block name..."}
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
              onClick={editingBlock ? handleSaveBlock : handleAddBlock}
              disabled={editingBlock ? !editingBlock.name?.trim() : !newBlockName?.trim()}
              sx={{ 
                backgroundColor: '#5a6c7d',
                color: '#ffffff',
                '&:hover': { backgroundColor: '#4a5568' },
                '&:disabled': { backgroundColor: '#cbd5e0', color: '#718096' }
              }}
            >
              {editingBlock ? 'update block' : 'add block'}
            </Button>
            {editingBlock && (
              <Button
                variant="outlined"
                onClick={() => {
                  setEditingBlock(null);
                  setBlockSchedule({
                    monday: [],
                    tuesday: [],
                    wednesday: [],
                    thursday: [],
                    friday: [],
                    saturday: [],
                    sunday: []
                  });
                  setSelectedBlockColor('#5a6c7d');
                  setNewBlockName('');
                }}
                sx={{ 
                  borderColor: '#8fa3b3',
                  color: '#6b7d8f',
                  '&:hover': {
                    borderColor: '#5a6c7d',
                    backgroundColor: '#f1f5f8'
                  }
                }}
              >
                cancel
              </Button>
            )}
      </Box>
          
          {/* Color Picker */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500 }}>
              block color
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {[
                '#5a6c7d', '#6b7d8f', '#8fa3b3', '#b3c5d1', // Blues
                '#e53e3e', '#f56565', '#fc8181', '#fed7d7', // Reds
                '#38a169', '#48bb78', '#68d391', '#9ae6b4', // Greens
                '#d69e2e', '#ed8936', '#f6ad55', '#fbd38d', // Yellows/Oranges
                '#805ad5', '#9f7aea', '#b794f4', '#d6bcfa', // Purples
                '#319795', '#38b2ac', '#4fd1c7', '#81e6d9'  // Teals
              ].map((color) => (
                <Box
                  key={color}
                  onClick={() => setSelectedBlockColor(color)}
                  sx={{
                    width: 32,
                    height: 32,
                    backgroundColor: color,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    border: selectedBlockColor === color ? '3px solid #4a5568' : '2px solid #e2e8f0',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      borderColor: '#4a5568'
                    }
                  }}
                />
              ))}
              </Box>
          </Box>

          {/* Schedule Section */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ color: '#4a5568', fontWeight: 500 }}>
              horários da matéria
            </Typography>
            
                         {/* Add Schedule Time */}
             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
               <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel sx={{ color: '#6b7d8f', backgroundColor: '#ffffff', px: 0.5 }}>dia</InputLabel>
                <Select
                  value={selectedScheduleDay}
                  onChange={(e) => setSelectedScheduleDay(e.target.value)}
                  sx={{
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#8fa3b3'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#5a6c7d'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#5a6c7d'
                    }
                  }}
                >
                  <MenuItem value="monday">Segunda</MenuItem>
                  <MenuItem value="tuesday">Terça</MenuItem>
                  <MenuItem value="wednesday">Quarta</MenuItem>
                  <MenuItem value="thursday">Quinta</MenuItem>
                  <MenuItem value="friday">Sexta</MenuItem>
                  <MenuItem value="saturday">Sábado</MenuItem>
                  <MenuItem value="sunday">Domingo</MenuItem>
                </Select>
              </FormControl>
              
              <TextField
                size="small"
                placeholder="ex: 15:00–16:50"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
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
                  '& .MuiInputBase-input': {
                    color: '#4a5568'
                  }
                }}
              />
              
              <Button
                variant="outlined"
                onClick={() => {
                  addScheduleTime(selectedScheduleDay, newScheduleTime);
                  setNewScheduleTime('');
                }}
                disabled={!newScheduleTime.trim()}
                size="small"
                sx={{ 
                  borderColor: '#8fa3b3',
                  color: '#4a5568',
                  '&:hover': {
                    borderColor: '#5a6c7d',
                    backgroundColor: '#f1f5f8'
                  },
                  '&:disabled': {
                    borderColor: '#e2e8f0',
                    color: '#a0aec0'
                  }
                }}
                               >
                   adicionar
                 </Button>
               </Box>
               
               {/* Feedback Message */}
               {scheduleMessage && (
                 <Typography 
                   variant="body2" 
                   sx={{ 
                     color: scheduleMessage.includes('sucesso') ? '#38a169' : '#e53e3e',
                     fontSize: '0.875rem',
                     fontStyle: 'italic'
                   }}
                 >
                   {scheduleMessage}
                 </Typography>
               )}
             </Box>

            {/* Schedule List */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Object.entries(blockSchedule).map(([day, times]) => {
                if (times.length === 0) return null;
                
                const dayLabels: Record<string, string> = {
                  monday: 'Segunda',
                  tuesday: 'Terça',
                  wednesday: 'Quarta',
                  thursday: 'Quinta',
                  friday: 'Sexta',
                  saturday: 'Sábado',
                  sunday: 'Domingo'
                };
                
                return (
                  <Box key={day} sx={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: 1, 
                    p: 1.5,
                    backgroundColor: '#f8fafb'
                  }}>
                    <Typography variant="subtitle2" sx={{ 
                      color: '#4a5568', 
                      fontWeight: 600, 
                      mb: 1 
                    }}>
                      {dayLabels[day]}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {times.map((time, index) => (
                        <Box key={index} sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          p: 0.5,
                          backgroundColor: '#ffffff',
                          borderRadius: 0.5,
                          border: '1px solid #e2e8f0'
                        }}>
                          <Typography variant="body2" sx={{ color: '#4a5568' }}>
                            {time}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => removeScheduleTime(day, index)}
                            sx={{ 
                              color: '#e53e3e',
                              '&:hover': { backgroundColor: 'rgba(229,62,62,0.1)' }
                            }}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
            
            {/* Clear All Schedule Button */}
            {Object.values(blockSchedule).some(day => day.length > 0) && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={() => setBlockSchedule({
                    monday: [],
                    tuesday: [],
                    wednesday: [],
                    thursday: [],
                    friday: [],
                    saturday: [],
                    sunday: []
                  })}
                  sx={{
                    borderColor: '#e53e3e',
                    color: '#e53e3e',
                    '&:hover': {
                      borderColor: '#c53030',
                      backgroundColor: 'rgba(229,62,62,0.1)'
                    }
                  }}
                >
                  limpar todos os horários
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button onClick={() => setOpenBlocksDialog(false)} sx={{ color: '#6b7d8f' }}>
            close
          </Button>
                </Box>
                </Box>
    </Dialog>
  );

  const renderTasksDialog = () => (
    <Dialog open={openTasksDialog} onClose={() => setOpenTasksDialog(false)} maxWidth="lg" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#4a5568', mb: 3, fontWeight: 600 }}>
          manage tasks
        </Typography>
        
        {/* Columns as Toggles */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {columnOrder.map((columnId) => {
            const column = getColumnById(columnId);
            if (!column) return null;
            
            const columnTasks = taskTypes.flatMap(type => 
              type.tasks.filter(task => task.status === columnId)
            );
            
            return (
              <Box key={columnId} sx={{ border: '1px solid #e2e8f0', borderRadius: 1, backgroundColor: '#ffffff' }}>
                {/* Column Header */}
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                    gap: 2, 
                    p: 2,
                      cursor: 'pointer',
                    backgroundColor: '#f8fafb',
                    borderBottom: '1px solid #f1f5f8',
                    '&:hover': { backgroundColor: '#f1f5f8' }
                  }}
                  onClick={() => toggleColumnExpansion(columnId)}
                >
                  <Box 
                    sx={{ 
                      width: 3, 
                      height: 16, 
                      backgroundColor: column.color, 
                      borderRadius: 0.5 
                    }} 
                  />
                  <Typography variant="subtitle1" sx={{ color: '#4a5568', fontWeight: 500, flex: 1 }}>
                    {column.name}
                    </Typography>
                  <Typography variant="caption" sx={{ color: '#8fa3b3' }}>
                    {columnTasks.length} tasks
                  </Typography>
                  {expandedColumns[columnId] ? <ExpandLessIcon sx={{ color: '#8fa3b3' }} /> : <ExpandMoreIcon sx={{ color: '#8fa3b3' }} />}
                  </Box>
                  
                {/* Tasks List */}
                <Collapse in={expandedColumns[columnId]}>
                  <Box sx={{ p: 2 }}>
                    {columnTasks.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#8fa3b3', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                        no tasks in this column
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {columnTasks.map((task, index) => (
                          <Box
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', task.id);
                              e.dataTransfer.setData('type', 'task-reorder');
                              e.dataTransfer.setData('sourceColumn', columnId);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedTaskId = e.dataTransfer.getData('text/plain');
                              const dragType = e.dataTransfer.getData('type');
                              
                              if (dragType === 'task-reorder') {
                                handleTaskReorder(draggedTaskId, columnId, index);
                              }
                            }}
                            sx={{ 
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              p: 1.5,
                              backgroundColor: '#f8fafb',
                              border: '1px solid #e2e8f0',
                              borderRadius: 1,
                              cursor: 'grab',
                              transition: 'all 0.2s',
                              '&:hover': {
                                backgroundColor: '#f1f5f8',
                                borderColor: '#8fa3b3'
                              },
                              '&:active': {
                                cursor: 'grabbing'
                              }
                            }}
                          >
                            <DragIndicatorIcon sx={{ color: '#8fa3b3', fontSize: 16 }} />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ color: '#4a5568', fontWeight: 500 }}>
                                {task.title}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#8fa3b3' }}>
                                {taskTypes.find(t => t.id === task.type)?.name || 'unknown block'}
                              </Typography>
                            </Box>
                            <Chip
                              label={task.priority}
                              size="small"
                              sx={{
                                backgroundColor: `${getPriorityColor(task.priority)}20`,
                                color: getPriorityColor(task.priority),
                                border: `1px solid ${getPriorityColor(task.priority)}50`,
                                fontSize: '0.75rem'
                              }}
                            />
                          </Box>
                      ))}
                      </Box>
                  )}
                </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button
            variant="contained"
            onClick={() => setOpenTasksDialog(false)}
            sx={{
              backgroundColor: '#5a6c7d',
              '&:hover': { backgroundColor: '#4a5568' }
            }}
          >
            done
          </Button>
        </Box>
      </Box>
    </Dialog>
  );

  const renderDailyView = () => {
    const currentDate = new Date();
    const displayDay = new Date(selectedDay);
    displayDay.setHours(0, 0, 0, 0);
    
    // Get all tasks
    const allTasks = taskTypes.flatMap(type => type.tasks);
    
    // Get recurring tasks for selected day
    const recurringTasksForDay = getRecurringTasksForDay(displayDay);
    
    // Filter normal tasks for selected day
    const normalDayTasks = allTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === displayDay.getTime();
    });
    
    // Combine normal and recurring tasks
    const dayTasks = [...normalDayTasks, ...recurringTasksForDay];
    
    // Group tasks by priority
    const highPriorityTasks = dayTasks.filter(task => task.priority === 'high');
    const mediumPriorityTasks = dayTasks.filter(task => task.priority === 'medium');
    const lowPriorityTasks = dayTasks.filter(task => task.priority === 'low');
    
    return (
      <Box sx={{ p: 4, backgroundColor: '#f8fafb', minHeight: 'calc(100vh - 80px)' }}>
        {/* Daily Header */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 4 
        }}>
          {/* Day Navigation */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => {
                const prevDay = new Date(selectedDay);
                prevDay.setDate(prevDay.getDate() - 1);
                setSelectedDay(prevDay);
              }}
              sx={{ 
                color: '#4a5568',
                '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
              }}
            >
              <Box sx={{ fontSize: '1.5rem' }}>‹</Box>
            </IconButton>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" sx={{ 
              color: '#4a5568', 
              fontWeight: 600
            }}>
              {displayDay.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} - daily overview
            </Typography>
            
            <Typography variant="body2" sx={{ 
              color: '#6b7d8f',
              fontStyle: 'italic'
            }}>
              {dayTasks.length} tasks for {displayDay.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Typography>
          </Box>
          
          <IconButton
            onClick={() => {
              const nextDay = new Date(selectedDay);
              nextDay.setDate(nextDay.getDate() + 1);
              setSelectedDay(nextDay);
            }}
            sx={{ 
              color: '#4a5568',
              '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
            }}
          >
            <Box sx={{ fontSize: '1.5rem' }}>›</Box>
          </IconButton>
        </Box>
          
          <Button
            variant="contained"
            onClick={() => {
              setNewTask({
                id: '',
                title: '',
                description: '',
                priority: 'medium',
                status: 'backlog',
                type: taskTypes.length > 0 ? taskTypes[0].id : '',
                createdAt: new Date(),
                startDate: getTodayDate(),
                dueDate: getTodayDate(),
                taskType: 'geral',
                blockType: 'general',
                recurringDays: [],
                recurringTime: '',
                appointmentTime: ''
              });
              setSelectedTask(null);
              setIsEditing(true);
              setOpenTaskDialog(true);
            }}
            sx={{
              backgroundColor: '#5a6c7d',
              color: '#ffffff',
              '&:hover': { backgroundColor: '#4a5568' },
              px: 3,
              py: 1.5
            }}
          >
            add new task
          </Button>
        </Box>
        
        {/* Priority Sections */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* High Priority */}
          <Box sx={{ 
            backgroundColor: '#ffffff', 
            borderRadius: 2, 
            p: 3,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <Typography variant="h6" sx={{ 
              color: '#e53e3e', 
              mb: 2, 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#e53e3e', 
                borderRadius: '50%' 
              }} />
              high priority ({highPriorityTasks.length})
            </Typography>
            
            {highPriorityTasks.length === 0 ? (
              <Typography variant="body2" sx={{ 
                color: '#8fa3b3', 
                fontStyle: 'italic',
                textAlign: 'center',
                py: 2
              }}>
                no high priority tasks for this day
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {highPriorityTasks.map(task => (
                  <Box
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    sx={{
                      backgroundColor: getStatusColor(task.status),
                      color: '#ffffff',
                      p: 2,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        opacity: 0.8,
                        transform: 'translateY(-1px)',
                        transition: 'all 0.2s'
                      }
                    }}
                  >
                    <Typography variant="body1" sx={{ 
                      fontWeight: 600,
                      mb: 0.5
                    }}>
                      {task.title}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      opacity: 0.9,
                      mb: 1
                    }}>
                      {task.description}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.type}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.status}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          
          {/* Medium Priority */}
          <Box sx={{ 
            backgroundColor: '#ffffff', 
            borderRadius: 2, 
            p: 3,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <Typography variant="h6" sx={{ 
              color: '#ed8936', 
              mb: 2, 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#ed8936', 
                borderRadius: '50%' 
              }} />
              medium priority ({mediumPriorityTasks.length})
            </Typography>
            
            {mediumPriorityTasks.length === 0 ? (
              <Typography variant="body2" sx={{ 
                color: '#8fa3b3', 
                fontStyle: 'italic',
                textAlign: 'center',
                py: 2
              }}>
                no medium priority tasks for this day
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {mediumPriorityTasks.map(task => (
                  <Box
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    sx={{
                      backgroundColor: getStatusColor(task.status),
                      color: '#ffffff',
                      p: 2,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        opacity: 0.8,
                        transform: 'translateY(-1px)',
                        transition: 'all 0.2s'
                      }
                    }}
                  >
                    <Typography variant="body1" sx={{ 
                      fontWeight: 600,
                      mb: 0.5
                    }}>
                      {task.title}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      opacity: 0.9,
                      mb: 1
                    }}>
                      {task.description}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.type}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.status}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          
          {/* Low Priority */}
          <Box sx={{ 
            backgroundColor: '#ffffff', 
            borderRadius: 2, 
            p: 3,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <Typography variant="h6" sx={{ 
              color: '#48bb78', 
              mb: 2, 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#48bb78', 
                borderRadius: '50%' 
              }} />
              low priority ({lowPriorityTasks.length})
            </Typography>
            
            {lowPriorityTasks.length === 0 ? (
              <Typography variant="body2" sx={{ 
                color: '#8fa3b3', 
                fontStyle: 'italic',
                textAlign: 'center',
                py: 2
              }}>
                no low priority tasks for this day
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {lowPriorityTasks.map(task => (
                  <Box
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    sx={{
                      backgroundColor: getStatusColor(task.status),
                      color: '#ffffff',
                      p: 2,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        opacity: 0.8,
                        transform: 'translateY(-1px)',
                        transition: 'all 0.2s'
                      }
                    }}
                  >
                    <Typography variant="body1" sx={{ 
                      fontWeight: 600,
                      mb: 0.5
                    }}>
                      {task.title}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      opacity: 0.9,
                      mb: 1
                    }}>
                      {task.description}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.type}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {task.status}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
        
        {/* Daily Summary */}
        <Box sx={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 2, 
          p: 3,
          border: '1px solid #e2e8f0',
          mt: 3
        }}>
          <Typography variant="h6" sx={{ 
            color: '#4a5568', 
            mb: 2, 
            fontWeight: 600 
          }}>
            daily summary
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#5a6c7d', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                total tasks: {dayTasks.length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#e53e3e', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                high priority: {highPriorityTasks.length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#ed8936', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                medium priority: {mediumPriorityTasks.length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#48bb78', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                low priority: {lowPriorityTasks.length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#48bb78', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                done: {dayTasks.filter((t: Task) => t.status === 'done').length}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderWeeklyView = () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Calculate the start of the selected week (Monday)
    const getWeekStart = (year: number, week: number) => {
      const startOfYear = new Date(year, 0, 1);
      const daysToAdd = (week - 1) * 7;
      const weekStart = new Date(startOfYear);
      // Adjust to start on Monday (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeek = startOfYear.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0
      weekStart.setDate(startOfYear.getDate() + daysToAdd - mondayOffset);
      return weekStart;
    };
    
    const weekStart = getWeekStart(selectedYear, selectedWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    // Get all normal tasks
    const allNormalTasks = taskTypes.flatMap(type => type.tasks);
    
    // Filter normal tasks for the selected week
    const normalWeekTasks = allNormalTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return taskDate >= weekStart && taskDate <= weekEnd;
    });
    
    // Get recurring tasks for each day of the week
    const recurringTasksByDay: Record<string, Task[]> = {};
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);
      const dayKey = dayDate.toISOString().split('T')[0];
      recurringTasksByDay[dayKey] = getRecurringTasksForDay(dayDate);
    }
    
    // Group all tasks by day (normal + recurring)
    const tasksByDay: Record<string, Task[]> = {};
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);
      const dayKey = dayDate.toISOString().split('T')[0];
      
      // Get normal tasks for this day
      const normalTasksForDay = normalWeekTasks.filter(task => {
        const taskDate = task.dueDate ? new Date(task.dueDate) : new Date();
        return taskDate.toDateString() === dayDate.toDateString();
      });
      
      // Get recurring tasks for this day
      const recurringTasksForDay = recurringTasksByDay[dayKey] || [];
      
      // Combine normal and recurring tasks
      tasksByDay[dayKey] = [...normalTasksForDay, ...recurringTasksForDay];
    }
    
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    return (
      <Box sx={{ p: 4, backgroundColor: '#f8fafb', minHeight: 'calc(100vh - 80px)' }}>
        {/* Week Navigation */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 4 
        }}>
          <IconButton
            onClick={() => {
              if (selectedWeek === 1) {
                setSelectedWeek(52);
                setSelectedYear(selectedYear - 1);
              } else {
                setSelectedWeek(selectedWeek - 1);
              }
            }}
            sx={{ 
              color: '#4a5568',
              '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
            }}
          >
            <Box sx={{ fontSize: '1.5rem' }}>‹</Box>
          </IconButton>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" sx={{ 
              color: '#4a5568', 
              fontWeight: 600
            }}>
              week {selectedWeek}, {selectedYear} - weekly overview
              </Typography>
            <Typography variant="body2" sx={{ 
              color: '#6b7d8f',
              fontStyle: 'italic'
            }}>
              {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {weekEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Typography>
            
            {(selectedWeek !== (() => {
              const days = Math.floor((currentDate.getTime() - new Date(currentYear, 0, 1).getTime()) / (24 * 60 * 60 * 1000));
              const dayOfWeek = new Date(currentYear, 0, 1).getDay();
              const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              return Math.ceil((days + mondayOffset + 1) / 7);
            })()) && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  const days = Math.floor((currentDate.getTime() - new Date(currentYear, 0, 1).getTime()) / (24 * 60 * 60 * 1000));
                  const dayOfWeek = new Date(currentYear, 0, 1).getDay();
                  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                  const currentWeek = Math.ceil((days + mondayOffset + 1) / 7);
                  setSelectedWeek(currentWeek);
                  setSelectedYear(currentYear);
                }}
                sx={{
                  color: '#5a6c7d',
                  borderColor: '#8fa3b3',
                  fontSize: '0.75rem',
                  '&:hover': {
                    borderColor: '#5a6c7d',
                    backgroundColor: 'rgba(90,108,125,0.05)'
                  }
                }}
              >
                go to current week
              </Button>
            )}
          </Box>
          
          <IconButton
            onClick={() => {
              if (selectedWeek === 52) {
                setSelectedWeek(1);
                setSelectedYear(selectedYear + 1);
              } else {
                setSelectedWeek(selectedWeek + 1);
              }
            }}
            sx={{ 
              color: '#4a5568',
              '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
            }}
          >
            <Box sx={{ fontSize: '1.5rem' }}>›</Box>
          </IconButton>
        </Box>
        
        {/* Add New Task Button */}
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Button
            variant="contained"
            onClick={() => {
              setNewTask({
                id: '',
                title: '',
                description: '',
                priority: 'medium',
                status: 'backlog',
                type: taskTypes.length > 0 ? taskTypes[0].id : '',
                createdAt: new Date(),
                startDate: getTodayDate(),
                dueDate: getTodayDate(),
                taskType: 'geral',
                blockType: 'general',
                recurringDays: [],
                recurringTime: '',
                appointmentTime: ''
              });
              setSelectedTask(null);
              setIsEditing(true);
              setOpenTaskDialog(true);
            }}
            sx={{
              backgroundColor: '#5a6c7d',
              color: '#ffffff',
              '&:hover': { backgroundColor: '#4a5568' },
              px: 3,
              py: 1.5
            }}
          >
            add new task
          </Button>
        </Box>
        
        {/* Weekly Grid */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: 2,
          mb: 4
        }}>
          {dayNames.map((dayName, index) => {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + index);
            const dayKey = dayDate.toISOString().split('T')[0];
            const dayTasks = tasksByDay[dayKey] || [];
            const isToday = dayDate.toDateString() === currentDate.toDateString();
            
            return (
              <Box
                key={dayName}
                sx={{
                  backgroundColor: '#ffffff',
                  borderRadius: 2,
                  p: 2,
                  border: isToday ? '2px solid #5a6c7d' : '1px solid #e2e8f0',
                  minHeight: 200,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                {/* Day Header */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  mb: 2,
                  pb: 1,
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  <Typography variant="subtitle2" sx={{ 
                    color: '#4a5568', 
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {dayName}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ 
                      color: isToday ? '#5a6c7d' : '#6b7d8f',
                      fontWeight: isToday ? 600 : 400
                    }}>
                      {dayDate.getDate()}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewTask({
                          id: '',
                          title: '',
                          description: '',
                          priority: 'medium',
                          status: 'backlog',
                          type: taskTypes.length > 0 ? taskTypes[0].id : '',
                          createdAt: new Date(),
                          startDate: dayDate,
                          dueDate: dayDate,
                          taskType: 'geral',
                          blockType: 'general',
                          recurringDays: [],
                          recurringTime: '',
                          appointmentTime: ''
                        });
                        setSelectedTask(null);
                        setIsEditing(true);
                        setOpenTaskDialog(true);
                      }}
                      sx={{
                        color: '#5a6c7d',
                        width: 20,
                        height: 20,
                        '&:hover': {
                          backgroundColor: 'rgba(90,108,125,0.1)'
                        }
                      }}
                    >
                      <AddIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                </Box>
                
                {/* Tasks for this day */}
                  <Box
                    sx={{
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 1,
                    minHeight: 100
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.backgroundColor = 'rgba(90,108,125,0.1)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.backgroundColor = 'transparent';
                    
                    const type = e.dataTransfer.getData('type');
                    const taskId = e.dataTransfer.getData('taskId');
                    
                    if (type === 'task' && taskId) {
                      // Update task due date to this day
                      const updatedTask = { ...taskTypes.flatMap(t => t.tasks).find(t => t.id === taskId)! };
                      updatedTask.dueDate = dayDate;
                      
                      // Update the task in its block
                      setTaskTypes(prev => prev.map(block => ({
                        ...block,
                        tasks: block.tasks.map(t => t.id === taskId ? updatedTask : t)
                      })));
                    }
                  }}
                >
                  {dayTasks.length === 0 ? (
                    <Typography variant="body2" sx={{ 
                      color: '#8fa3b3', 
                      fontStyle: 'italic',
                      textAlign: 'center',
                      mt: 2
                    }}>
                      drop tasks here
                    </Typography>
                  ) : (
                    dayTasks.map(task => (
                      <Box
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('type', 'task');
                          e.dataTransfer.setData('taskId', task.id);
                          e.dataTransfer.setData('sourceColumn', 'weekly');
                        }}
                        onClick={() => handleTaskClick(task)}
                        sx={{
                          backgroundColor: getStatusColor(task.status),
                          color: '#ffffff',
                          p: 1.5,
                      borderRadius: 1,
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          position: 'relative',
                          '&:hover': {
                            opacity: 0.8,
                            transform: 'translateY(-1px)',
                            transition: 'all 0.2s'
                          }
                        }}
                      >
                        <Typography variant="body2" sx={{ 
                          fontWeight: 600,
                          mb: 0.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {task.title}
                        </Typography>
                        <Typography variant="caption" sx={{ 
                          opacity: 0.9,
                          display: 'block',
                          mb: 1
                        }}>
                          {task.type}
                        </Typography>
                        
                        {/* Action buttons */}
                        <Box sx={{ 
                          display: 'flex', 
                          gap: 0.5, 
                          justifyContent: 'flex-end',
                          position: 'absolute',
                          top: 4,
                          right: 4
                        }}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkTaskDone(task.id);
                            }}
                            sx={{
                              color: '#ffffff',
                              backgroundColor: 'rgba(255,255,255,0.2)',
                              width: 20,
                              height: 20,
                              '&:hover': {
                                backgroundColor: 'rgba(255,255,255,0.3)'
                              }
                            }}
                          >
                            <CheckIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            sx={{
                              color: '#ffffff',
                              backgroundColor: 'rgba(255,255,255,0.2)',
                              width: 20,
                              height: 20,
                              '&:hover': {
                                backgroundColor: 'rgba(255,255,255,0.3)'
                              }
                            }}
                          >
                            <DeleteIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                </Box>
                      </Box>
                    ))
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
        
        {/* Weekly Summary */}
        <Box sx={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 2, 
          p: 3,
          border: '1px solid #e2e8f0'
        }}>
          <Typography variant="h6" sx={{ 
            color: '#4a5568', 
            mb: 2, 
            fontWeight: 600 
          }}>
            weekly summary
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#5a6c7d', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                total tasks: {Object.values(tasksByDay).flat().length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#48bb78', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                done: {Object.values(tasksByDay).flat().filter((t: Task) => t.status === 'done').length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#ed8936', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                in progress: {Object.values(tasksByDay).flat().filter((t: Task) => t.status === 'in-progress').length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: '#e53e3e', 
                borderRadius: '50%' 
              }} />
              <Typography variant="body2" sx={{ color: '#4a5568' }}>
                overdue: {Object.values(tasksByDay).flat().filter((t: Task) => {
                  const taskDate = t.dueDate ? new Date(t.dueDate) : new Date();
                  return taskDate < currentDate && t.status !== 'done';
                }).length}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderMonthlyView = () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    // Use selected month and year, or current if not set
    const displayMonth = selectedMonth;
    const displayYear = selectedYear;
    
    // Get all normal tasks with due dates
    const allNormalTasks = taskTypes.flatMap(type => 
      type.tasks.filter(task => task.dueDate).map(task => ({
        ...task,
        blockName: type.name,
        blockColor: type.color
      }))
    );
    
    // Get recurring tasks for the selected month (only for calendar display)
    const recurringTasksForMonth = getRecurringTasksForMonth(displayYear, displayMonth).map(task => ({
      ...task,
      blockName: task.taskType === 'recorrente' ? 'recurring' : 'compromisso',
      blockColor: task.taskType === 'recorrente' ? '#5a6c7d' : '#f59e0b' // Cinza da paleta principal para recorrente, laranja para compromisso
    }));
    
    // Filter normal tasks for selected month
    const normalMonthTasks = allNormalTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return taskDate.getMonth() === displayMonth && taskDate.getFullYear() === displayYear;
    });
    
    // Combine normal and recurring tasks for calendar display
    const monthTasks = [...normalMonthTasks, ...recurringTasksForMonth];
    
    // Para o gantt, usar apenas tarefas normais + tarefas recorrentes originais (não as instâncias)
    const recurringTasksForGantt = recurringTasks.filter(task => 
      task.dueDate && // Só tarefas com deadline
      task.startDate && // Só tarefas com data de início
      task.recurringDays && task.recurringDays.length > 0 // Só tarefas recorrentes
    ).map(task => ({
      ...task,
      blockName: 'recurring',
      blockColor: '#5a6c7d',
      // Usar a data de início e fim originais para o gantt
      startDate: task.startDate,
      dueDate: task.dueDate
    }));
    
    // Combine normal tasks and recurring tasks for Gantt
    const allGanttTasks = [...normalMonthTasks, ...recurringTasksForGantt];
    
    // Sort all tasks by due date
    const sortedTasks = allGanttTasks.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    // Get month name
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    // Calculate days in month
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(displayYear, displayMonth, 1).getDay();
    
    return (
      <Box sx={{ p: 4, backgroundColor: '#f8fafb', minHeight: 'calc(100vh - 80px)' }}>
        {/* Month Navigation */}
        <Box sx={{ 
                      display: 'flex', 
          justifyContent: 'space-between', 
                      alignItems: 'center', 
          mb: 4 
        }}>
          <IconButton
            onClick={() => {
              if (displayMonth === 0) {
                setSelectedMonth(11);
                setSelectedYear(displayYear - 1);
              } else {
                setSelectedMonth(displayMonth - 1);
              }
            }}
            sx={{ 
              color: '#4a5568',
              '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
            }}
          >
            <Box sx={{ fontSize: '1.5rem' }}>‹</Box>
          </IconButton>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" sx={{ 
              color: '#4a5568', 
              fontWeight: 600
            }}>
              {monthNames[displayMonth]} {displayYear} - monthly overview
                    </Typography>
            
            {(displayMonth !== currentMonth || displayYear !== currentYear) && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSelectedMonth(currentMonth);
                  setSelectedYear(currentYear);
                }}
                sx={{
                  color: '#5a6c7d',
                  borderColor: '#8fa3b3',
                  fontSize: '0.75rem',
                  '&:hover': {
                    borderColor: '#5a6c7d',
                    backgroundColor: 'rgba(90,108,125,0.05)'
                  }
                }}
              >
                go to current month
              </Button>
            )}
                  </Box>
                  
          <IconButton
            onClick={() => {
              if (displayMonth === 11) {
                setSelectedMonth(0);
                setSelectedYear(displayYear + 1);
              } else {
                setSelectedMonth(displayMonth + 1);
              }
            }}
                            sx={{ 
              color: '#4a5568',
              '&:hover': { backgroundColor: 'rgba(90,108,125,0.1)' }
            }}
          >
            <Box sx={{ fontSize: '1.5rem' }}>›</Box>
          </IconButton>
        </Box>
        
        {/* Gantt Chart */}
        <Box sx={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 2, 
          p: 3, 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          mb: 4
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ 
              color: '#4a5568', 
              fontWeight: 500 
            }}>
              gantt chart
            </Typography>
            <Button
              variant="contained"
              onClick={() => handleAddTask(undefined, 'backlog')}
              sx={{ 
                backgroundColor: '#5a6c7d',
                '&:hover': { backgroundColor: '#4a5568' }
              }}
            >
              add new task
            </Button>
                </Box>
          
          {/* Timeline Header */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: '200px repeat(31, 1fr)', 
            gap: 1, 
            mb: 2,
            borderBottom: '2px solid #e2e8f0'
          }}>
            <Box sx={{ p: 1, fontWeight: 600, color: '#4a5568' }}>
              task / project
            </Box>
            {Array.from({ length: daysInMonth }, (_, i) => (
              <Box key={i + 1} sx={{ 
                p: 1, 
                textAlign: 'center', 
                fontSize: '0.75rem',
                color: '#6b7d8f',
                borderLeft: '1px solid #f1f5f8'
              }}>
                {i + 1}
              </Box>
            ))}
              </Box>

          {/* Gantt Bars */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sortedTasks.map((task: any, index: number) => {
              if (!task.dueDate) return null;
              const taskDate = new Date(task.dueDate);
              const dayOfMonth = taskDate.getDate();
              const isOverdue = taskDate < new Date() && task.status !== 'done';
              const isToday = taskDate.toDateString() === new Date().toDateString();
             
              return (
                <Box key={`${task.id}-${index}`} sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '200px repeat(31, 1fr)', 
                  gap: 1,
                  alignItems: 'center',
                  minHeight: 40,
                  '&:hover': { backgroundColor: '#f8fafb' }
                }}>
                  {/* Task Info */}
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    p: 1
                  }}>
                    <Box 
                      sx={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        backgroundColor: task.blockColor 
                      }} 
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ 
                        color: '#4a5568', 
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }} onClick={() => handleTaskClick(task)}>
                        {task.title}
                      </Typography>
                      <Typography variant="caption" sx={{ 
                        color: '#6b7d8f',
                        fontSize: '0.75rem'
                      }}>
                        {task.blockName}
                      </Typography>
                </Box>
                </Box>
                  
                  {/* Timeline Cells */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const currentDate = new Date(displayYear, displayMonth, day);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Check if this day is within the task timeline
                    const taskStartDate = new Date(task.startDate);
                    taskStartDate.setHours(0, 0, 0, 0);
                    
                    // Para tarefas recorrentes, verificar se é um dia de recorrência
                    let isInTaskTimeline = false;
                    let isTaskStart = false;
                    let isTaskEnd = false;
                    
                    if (task.taskType === 'recorrente' && task.recurringDays && task.recurringDays.length > 0) {
                      // Tarefa recorrente: verificar se é um dia de recorrência dentro do período
                      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                      const isRecurringDay = task.recurringDays.includes(dayName);
                      const isInPeriod = currentDate >= taskStartDate && currentDate <= taskDate;
                      
                      isInTaskTimeline = isRecurringDay && isInPeriod;
                      isTaskStart = currentDate.getTime() === taskStartDate.getTime() && isRecurringDay;
                      isTaskEnd = currentDate.getTime() === taskDate.getTime() && isRecurringDay;
                    } else {
                      // Tarefa normal: verificar se está dentro do período
                      isInTaskTimeline = currentDate >= taskStartDate && currentDate <= taskDate;
                      isTaskStart = currentDate.getTime() === taskStartDate.getTime();
                      isTaskEnd = currentDate.getTime() === taskDate.getTime();
                    }
                    
                    const isOverdue = taskDate < today && task.status !== 'done';
                    const isToday = currentDate.toDateString() === new Date().toDateString();
                    
                    // Determine background color - only color days within task timeline
                    let backgroundColor = '#ffffff';
                    if (isInTaskTimeline) {
                      if (isOverdue) {
                        backgroundColor = '#fed7d7'; // Red for overdue
                      } else if (task.status === 'done') {
                        backgroundColor = '#c6f6d5'; // Green for done
                      } else {
                        backgroundColor = getStatusColor(task.status);
                      }
                    }
                    // All other days remain white
                    
                    return (
                      <Box 
                        key={day} 
                        onClick={() => {
                          // Determine if this is closer to start or end
                          const startDistance = Math.abs(currentDate.getTime() - taskStartDate.getTime());
                          const endDistance = Math.abs(currentDate.getTime() - taskDate.getTime());
                          
                          if (startDistance <= endDistance) {
                            // Closer to start date
                            handleGanttDateClick(task, true, currentDate);
                          } else {
                            // Closer to end date
                            handleGanttDateClick(task, false, currentDate);
                          }
                        }}
                        sx={{ 
                          height: 24,
                          border: '1px solid #f1f5f8',
                          borderRadius: 1,
                          backgroundColor: backgroundColor,
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          '&:hover': {
                            borderColor: '#5a6c7d',
                            boxShadow: '0 0 0 2px rgba(90,108,125,0.2)'
                          }
                        }}
                      >
                        {isTaskStart && (
                          <Box sx={{
                            position: 'absolute',
                            top: -8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#4a5568',
                            color: '#ffffff',
                            fontSize: '0.625rem',
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                            whiteSpace: 'nowrap',
                            zIndex: 1
                          }}>
                            start
                </Box>
                        )}
                        {isTaskEnd && (
                          <Box sx={{
                            position: 'absolute',
                            top: -8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#4a5568',
                            color: '#ffffff',
                            fontSize: '0.625rem',
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                            whiteSpace: 'nowrap',
                            zIndex: 1
                          }}>
                            {task.status}
                </Box>
                        )}
      </Box>
    );
                  })}
                </Box>
              );
            })}
          </Box>
          
          {sortedTasks.length === 0 && (
            <Box sx={{ 
              textAlign: 'center', 
              py: 4, 
              color: '#6b7d8f',
              fontStyle: 'italic'
            }}>
              no tasks with due dates for this month
            </Box>
          )}
        </Box>
        
        {/* Calendar Grid */}
        <Box sx={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 2, 
          p: 3, 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
        }}>
          <Typography variant="h6" sx={{ 
            color: '#4a5568', 
            mb: 3, 
            fontWeight: 500 
          }}>
            calendar view
          </Typography>
          
          {/* Day Names */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: 1, 
            mb: 1 
          }}>
            {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => (
              <Box key={day} sx={{ 
                p: 1, 
                textAlign: 'center', 
                fontWeight: 600, 
                color: '#4a5568',
                fontSize: '0.875rem'
              }}>
                {day}
                </Box>
            ))}
              </Box>

          {/* Calendar Grid */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: 1 
          }}>
            {/* Empty cells for days before month starts */}
            {Array.from({ length: firstDayOfMonth }, (_, i) => (
              <Box key={`empty-${i}`} sx={{ 
                height: 80, 
                backgroundColor: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 1
              }} />
            ))}
            
            {/* Days of the month */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const currentDate = new Date(displayYear, displayMonth, day);
              const isToday = currentDate.toDateString() === new Date().toDateString();
                      const dayTasks = monthTasks.filter((task: any) => {
          if (!task.dueDate) return false;
          const taskDate = new Date(task.dueDate);
          return taskDate.getDate() === day;
        });
              
    return (
                <Box key={day} sx={{ 
                  height: 80,
                  backgroundColor: isToday ? '#ebf8ff' : '#ffffff',
                  border: isToday ? '2px solid #3182ce' : '1px solid #e2e8f0',
                  borderRadius: 1,
                  p: 1,
                  position: 'relative'
                }}>
                  <Typography variant="caption" sx={{ 
                    color: isToday ? '#3182ce' : '#4a5568',
                    fontWeight: isToday ? 600 : 400,
                    fontSize: '0.875rem'
                  }}>
                    {day}
        </Typography>
                  
                  {/* Task indicators */}
                  {dayTasks.slice(0, 3).map((task, index) => (
                    <Box key={task.id} sx={{ 
                      mt: 0.5,
                      p: 0.5,
                      backgroundColor: getStatusColor(task.status),
                      color: '#ffffff',
                      borderRadius: 0.5,
                      fontSize: '0.625rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer'
                    }} onClick={() => handleTaskClick(task)}>
                      {task.title}
                </Box>
                  ))}
                  
                  {dayTasks.length > 3 && (
                    <Typography variant="caption" sx={{ 
                      color: '#6b7d8f',
                      fontSize: '0.625rem',
                      mt: 0.5,
                      display: 'block'
                    }}>
                      +{dayTasks.length - 3} more
                    </Typography>
                  )}
                </Box>
              );
            })}
                </Box>
              </Box>
      </Box>
    );
  };

  const renderScheduleView = () => {
    // Gerar dados do schedule baseado nos blocks
    const scheduleData: Record<string, Array<{ time: string; subject: string; color: string }>> = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    };

    // Preencher schedule com dados dos blocks
    taskTypes.forEach(block => {
      if (block.schedule) {
        const schedule = block.schedule;
        const scheduleKeys = Object.keys(schedule) as Array<keyof typeof schedule>;
        scheduleKeys.forEach(day => {
          const daySchedule = schedule[day];
          if (daySchedule && daySchedule.length > 0) {
            daySchedule.forEach(time => {
              scheduleData[day].push({
                time,
                subject: block.name,
                color: block.color
              });
            });
          }
        });
      }
    });

    // Ordenar horários por cada dia
    Object.keys(scheduleData).forEach(day => {
      scheduleData[day].sort((a, b) => {
        const timeA = a.time.split('–')[0].trim();
        const timeB = b.time.split('–')[0].trim();
        return timeA.localeCompare(timeB);
      });
    });

    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    return (
      <Box sx={{ p: 4, backgroundColor: '#f8fafb', minHeight: 'calc(100vh - 80px)' }}>
        {/* Schedule Header */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 4 
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" sx={{ 
              color: '#4a5568', 
              fontWeight: 600
            }}>
              Grade Semanal - Horários das Aulas
            </Typography>
            
            <Typography variant="body2" sx={{ 
              color: '#6b7d8f',
              fontStyle: 'italic'
            }}>
              Visão semanal das matérias e horários
            </Typography>
            <Typography variant="body2" sx={{ 
              color: '#5a6c7d',
              fontSize: '0.875rem',
              mt: 1
            }}>
              💡 Clique em uma disciplina para expandir suas atividades no kanban
            </Typography>
          </Box>
        </Box>
        
        {/* Weekly Schedule Grid */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: 2,
          mb: 4
        }}>
          {dayNames.map((dayName, index) => {
            const dayClasses = scheduleData[dayName as keyof typeof scheduleData] || [];
            const dayLabel = dayLabels[index];
            
            return (
              <Box
                key={dayName}
                sx={{
                  backgroundColor: '#ffffff',
                  borderRadius: 2,
                  p: 2,
                  border: '1px solid #e2e8f0',
                  minHeight: 300,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                {/* Day Header */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 2,
                  pb: 1,
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  <Typography variant="h6" sx={{ 
                    color: '#4a5568', 
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {dayLabel}
                  </Typography>
                </Box>
                
                {/* Classes for this day */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {dayClasses.length === 0 ? (
                    <Typography variant="body2" sx={{ 
                      color: '#8fa3b3', 
                      fontStyle: 'italic',
                      textAlign: 'center',
                      mt: 2
                    }}>
                      Sem aulas
                    </Typography>
                  ) : (
                    dayClasses.map((classInfo, classIndex) => {
                      // Find the block that corresponds to this subject
                      const block = taskTypes.find(b => b.name === classInfo.subject);
                      
                      return (
                        <Box
                          key={`${dayName}-${classIndex}`}
                          onClick={() => {
                            if (block) {
                              expandBlockFromSchedule(block.id);
                            }
                          }}
                          sx={{
                            backgroundColor: classInfo.color,
                            color: '#ffffff',
                            p: 1.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            position: 'relative',
                            '&:hover': {
                              opacity: 0.9,
                              transform: 'translateY(-1px)',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                            }
                          }}
                        >
                        {/* Delete schedule item */}
                        {block && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteScheduleItem(
                                block.id,
                                dayName as 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
                                classInfo.time
                              );
                            }}
                            sx={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              color: '#ffffff',
                              '&:hover': { color: '#f1f5f8' }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                        <Typography variant="body2" sx={{ 
                          fontWeight: 600,
                          mb: 0.5,
                          fontSize: '0.75rem'
                        }}>
                          {classInfo.time}
                        </Typography>
                        <Typography variant="body2" sx={{ 
                          fontWeight: 500,
                          fontSize: '0.8rem',
                          lineHeight: 1.2
                        }}>
                          {classInfo.subject}
                        </Typography>
                        
                        {/* Indicator if block is expanded in kanban */}
                        {block && expandedBlockFromSchedule === block.id && (
                          <Box sx={{ 
                            position: 'absolute', 
                            top: 4, 
                            right: 4,
                            width: 8,
                            height: 8,
                            backgroundColor: '#ffffff',
                            borderRadius: '50%',
                            border: '1px solid rgba(255,255,255,0.3)'
                          }} />
                        )}
                      </Box>
                      );
                    })
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
        
        {/* Schedule Summary */}
        <Box sx={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 2, 
          p: 3,
          border: '1px solid #e2e8f0'
        }}>
          <Typography variant="h6" sx={{ 
            color: '#4a5568', 
            mb: 2, 
            fontWeight: 600 
          }}>
            Resumo da Grade
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {taskTypes
              .filter(block => hasScheduleTimes(block))
              .map(block => (
                <Box key={block.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ 
                    width: 12, 
                    height: 12, 
                    backgroundColor: block.color, 
                    borderRadius: '50%' 
                  }} />
                  <Typography variant="body2" sx={{ color: '#4a5568' }}>
                    {block.name}
                  </Typography>
                </Box>
              ))}
            {taskTypes.filter(block => hasScheduleTimes(block)).length === 0 && (
              <Typography variant="body2" sx={{ color: '#8fa3b3', fontStyle: 'italic' }}>
                Nenhuma matéria com horários cadastrados
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

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
        ) : currentPage === 'monthly' ? (
          renderMonthlyView()
        ) : currentPage === 'weekly' ? (
          renderWeeklyView()
        ) : currentPage === 'daily' ? (
          renderDailyView()
        ) : currentPage === 'schedule' ? (
          renderScheduleView()
        ) : (
          <>
            {renderKanbanHeader()}
            {renderKanbanBoard()}
          </>
        )}
      {renderTaskDialog()}
      {renderBlocksDialog()}
      {renderColumnsDialog()}
      {renderTasksDialog()}
      {renderSearchResults()}

      
      {/* Move Task Dialog */}
      <Dialog 
        open={moveTaskDialog.open} 
        onClose={handleCancelMoveTask}
        maxWidth="sm"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ color: '#4a5568', mb: 2, fontWeight: 600 }}>
            move task to different project
        </Typography>
          
          <Typography variant="body1" sx={{ color: '#6b7d8f', mb: 3 }}>
            select the project where you want to move this task:
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {taskTypes.map(type => (
              <Button
                key={type.id}
                variant="outlined"
                onClick={() => handleConfirmMoveTask(type.id)}
                disabled={type.name === moveTaskDialog.currentBlockName}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  borderColor: '#8fa3b3',
                  color: '#4a5568',
                  '&:hover': {
                    borderColor: '#5a6c7d',
                    backgroundColor: '#f1f5f8'
                  },
                  '&:disabled': {
                    borderColor: '#e2e8f0',
                    color: '#a0aec0',
                    backgroundColor: '#f7fafc'
                  }
                }}
                startIcon={
                  <Box 
                    sx={{ 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%', 
                      backgroundColor: type.color 
                    }} 
                  />
                }
              >
                {type.name}
                {type.name === moveTaskDialog.currentBlockName && (
                  <Typography variant="caption" sx={{ ml: 1, color: '#a0aec0', fontStyle: 'italic' }}>
                    (current)
                  </Typography>
                )}
              </Button>
            ))}
      </Box>
          
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={handleCancelMoveTask}
              sx={{
                color: '#6b7d8f',
                borderColor: '#8fa3b3',
                '&:hover': {
                  borderColor: '#5a6c7d',
                  backgroundColor: '#f1f5f8'
                }
              }}
            >
              cancel
            </Button>
          </Box>
        </Box>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteConfirmDialog.open} 
        onClose={handleCancelDelete}
        maxWidth="sm"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ color: '#4a5568', mb: 2, fontWeight: 600 }}>
            {deleteConfirmDialog.columnId ? 'delete block from column' : 'delete entire block'}
          </Typography>
          
          <Typography variant="body1" sx={{ color: '#6b7d8f', mb: 3 }}>
            {deleteConfirmDialog.columnId 
              ? `are you sure you want to delete the block "${deleteConfirmDialog.blockName}" from the "${deleteConfirmDialog.columnId}" column?`
              : `are you sure you want to delete the entire block "${deleteConfirmDialog.blockName}"?`
            }
          </Typography>
          
          <Typography variant="body2" sx={{ color: '#e53e3e', mb: 3, fontStyle: 'italic' }}>
            {deleteConfirmDialog.columnId
              ? `⚠️ this will only delete tasks from the "${deleteConfirmDialog.columnId}" column. the block and its tasks in other columns will remain.`
              : `⚠️ this action cannot be undone. all tasks in this block will be permanently deleted.`
            }
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={handleCancelDelete}
              sx={{
                color: '#6b7d8f',
                borderColor: '#8fa3b3',
                '&:hover': {
                  borderColor: '#5a6c7d',
                  backgroundColor: '#f1f5f8'
                }
              }}
            >
              cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmDelete}
              sx={{
                backgroundColor: '#e53e3e',
                '&:hover': {
                  backgroundColor: '#c53030'
                }
              }}
            >
              delete
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Chat Bot */}
      {renderChat()}
    </Box>
  );
}

export default App;
