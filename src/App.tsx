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
  Close as CloseIcon,
  ViewColumn as ViewColumnIcon,
  ViewList as ViewListIcon
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
  status: string; // Allow dynamic column names
  type: string;
  createdAt: Date;
  startDate: Date;
  dueDate: Date;
}

interface TaskType {
  id: string;
  name: string;
  color: string;
  expanded: boolean; // Keep for backward compatibility
  expandedByColumn: Record<string, boolean>;
  tasks: Task[];
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
          // Convert date strings back to Date objects
          const taskTypesWithDates = result.taskTypes.map((type: TaskType) => ({
            ...type,
            tasks: type.tasks.map((task: Task) => ({
              ...task,
              createdAt: new Date(task.createdAt),
              startDate: new Date(task.startDate),
              dueDate: new Date(task.dueDate)
            }))
          }));
          resolve({ taskTypes: taskTypesWithDates });
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
  const [columns, setColumns] = useState([
    { id: 'backlog', name: 'backlog', bgColor: '#e2e8f0', color: '#4a5568', fixed: true },
    { id: 'to-do', name: 'to do', bgColor: '#e2e8f0', color: '#4a5568', fixed: false },
    { id: 'in-progress', name: 'in progress', bgColor: '#e2e8f0', color: '#4a5568', fixed: false },
    { id: 'done', name: 'done', bgColor: '#e2e8f0', color: '#4a5568', fixed: true }
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

    // Remove task from source
    setTaskTypes(prev => prev.map(type => 
      type.id === sourceType 
        ? { ...type, tasks: type.tasks.filter(t => t.id !== taskId) }
        : type
    ));

    // Update task with new status and priority
    const updatedTask = { 
      ...taskToMove, 
      status: targetColumnId as 'backlog' | 'to-do' | 'in-progress' | 'done',
      priority: newPriority
    };
    
    // Add task to target and reorganize if moving to 'done'
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
        
        // Remove task from source
        setTaskTypes(prev => prev.map(type => 
          type.id === sourceType 
            ? { ...type, tasks: type.tasks.filter(t => t.id !== taskId) }
            : type
        ));

        // Update task with new status and priority
        const updatedTask = { 
          ...taskToMove, 
          status: targetColumnId as 'backlog' | 'to-do' | 'in-progress' | 'done',
          priority: targetPriority as 'high' | 'medium' | 'low'
        };
        
        // Add task to target and reorganize if moving to 'done'
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
    type: '',
    createdAt: new Date(),
    startDate: getTodayDate(),
    dueDate: getTodayDate()
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedBlockForNewTask, setSelectedBlockForNewTask] = useState<string>('feature');
  const [backlogExpanded, setBacklogExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState<'yearly' | 'kanban' | 'monthly' | 'weekly'>('kanban');
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
  const [selectedBlockColor, setSelectedBlockColor] = useState('#5a6c7d');
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
  const [moveTaskDialog, setMoveTaskDialog] = useState<{open: boolean, taskId: string, currentBlockName: string}>({
    open: false,
    taskId: '',
    currentBlockName: ''
  });

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
      startDate: task.startDate,
      dueDate: task.dueDate
    });
    setIsEditing(true);
    setOpenTaskDialog(true);
  };

  const handleAddTask = (blockType?: string, columnId?: string) => {
    const newStatus = (columnId as string) || 'backlog';
    console.log('handleAddTask called with:', { blockType, columnId, newStatus });
    
    setNewTask({
      id: '',
      title: '',
      description: '',
      priority: 'medium',
      status: newStatus,
      type: blockType || (taskTypes.length > 0 ? taskTypes[0].id : ''),
      createdAt: new Date(),
      startDate: getTodayDate(),
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
      startDate: getTodayDate(),
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
        startDate: newTask.startDate || getTodayDate(),
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
        startDate: newTask.startDate || getTodayDate(),
        dueDate: newTask.dueDate || getTodayDate()
      };
      
      console.log('Saving new task:', newTaskToAdd);
      
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
  };

  const handleAddBlock = () => {
    if (!newTask.type.trim()) return;
    
    const newBlock: TaskType = {
      id: Date.now().toString(),
      name: newTask.type,
      color: selectedBlockColor,
      tasks: [],
      expanded: true,
      expandedByColumn: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: true
      }), {})
    };
    
    setTaskTypes(prev => [...prev, newBlock]);
    setNewTask({ ...newTask, type: '' });
    setSelectedBlockColor('#5a6c7d'); // Reset to default color
  };

  const handleEditBlock = (block: TaskType) => {
    setEditingBlock({ ...block });
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
      bgColor: '#e2e8f0',
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
      const updatedTask = { ...taskToMove, type: targetBlockId };
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
        <Button
          variant={currentPage === 'monthly' ? 'contained' : 'outlined'}
          onClick={() => setCurrentPage('monthly')}
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
          variant={currentPage === 'weekly' ? 'contained' : 'outlined'}
          onClick={() => setCurrentPage('weekly')}
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
                                mr: 2 
                              }} 
                            />
                            <Typography variant="subtitle2" sx={{ flex: 1, color: '#1f2937', fontWeight: 500 }}>
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
        task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        type.name.toLowerCase().includes(searchTerm.toLowerCase())
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
                  </Box>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#6b7d8f', backgroundColor: '#ffffff', px: 0.5 }}>type</InputLabel>
              <Select
                value={newTask.type}
                onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
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
                {taskTypes.map(type => (
                  <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
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
                    border: '1px solid #e2e8f0',
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
          flexDirection: 'column',
          gap: 2
        }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
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
                    borderBottom: '1px solid #e2e8f0',
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
    
    // Get all tasks
    const allTasks = taskTypes.flatMap(type => type.tasks);
    
    // Filter tasks for the selected week
    const weekTasks = allTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return taskDate >= weekStart && taskDate <= weekEnd;
    });
    
    // Group tasks by day
    const tasksByDay: Record<string, Task[]> = {};
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);
      const dayKey = dayDate.toISOString().split('T')[0];
      tasksByDay[dayKey] = weekTasks.filter(task => {
        const taskDate = new Date(task.dueDate);
        return taskDate.toDateString() === dayDate.toDateString();
      });
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
                dueDate: getTodayDate()
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
                          dueDate: dayDate
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
                total tasks: {weekTasks.length}
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
                done: {weekTasks.filter(t => t.status === 'done').length}
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
                in progress: {weekTasks.filter(t => t.status === 'in-progress').length}
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
                overdue: {weekTasks.filter(t => {
                  const taskDate = new Date(t.dueDate);
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
    
    // Get all tasks with due dates
    const allTasks = taskTypes.flatMap(type => 
      type.tasks.filter(task => task.dueDate).map(task => ({
        ...task,
        blockName: type.name,
        blockColor: type.color
      }))
    );
    
    // Filter tasks for selected month
    const monthTasks = allTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return taskDate.getMonth() === displayMonth && taskDate.getFullYear() === displayYear;
    });
    
    // Sort tasks by due date
    const sortedTasks = monthTasks.sort((a, b) => {
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
              onClick={() => handleAddTask()}
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
            {sortedTasks.map((task, index) => {
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
                     const isInTaskTimeline = currentDate >= taskStartDate && currentDate <= taskDate;
                     const isTaskStart = currentDate.getTime() === taskStartDate.getTime();
                    const isTaskEnd = currentDate.getTime() === taskDate.getTime();
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
                      <Box key={day} sx={{ 
                        height: 24,
                        border: '1px solid #f1f5f8',
                        borderRadius: 1,
                        backgroundColor: backgroundColor,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
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
              const dayTasks = monthTasks.filter(task => {
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
    </Box>
  );
}

export default App;
