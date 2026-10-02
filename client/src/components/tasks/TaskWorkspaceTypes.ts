import type { TaskFilters } from '../../stores/uiStore';

export type TaskScope =
  'owned' | 'created' | 'assigned' | 'watching' | 'completed' | 'all' | 'activity';

export type TaskViewMode = 'list' | 'kanban' | 'calendar';
export type TaskSort = 'due_asc' | 'due_desc' | 'created_desc' | 'priority_desc' | 'title_asc';
export type TaskGroup = 'due' | 'status' | 'priority' | 'assignee' | 'board' | 'customer' | 'none';

export type TaskColumnKey =
  | 'priority'
  | 'startDate'
  | 'dueDate'
  | 'assignee'
  | 'status'
  | 'customer'
  | 'project'
  | 'board'
  | 'progress'
  | 'creator'
  | 'createdAt'
  | 'source';

export interface TaskWorkspaceConfig {
  scope: TaskScope;
  mode: TaskViewMode;
  sort: TaskSort;
  group: TaskGroup;
  columns: TaskColumnKey[];
  filters: TaskFilters;
}

export interface SavedTaskView {
  id: number;
  owner_user_id: number;
  owner_name: string | null;
  name: string;
  config: Partial<TaskWorkspaceConfig>;
  is_shared: number;
  created_at: string;
  updated_at: string;
}

export interface TaskActivity {
  id: number;
  card_id: number;
  task_title: string;
  actor_contact_id: number | null;
  actor_name: string | null;
  action: 'created' | 'updated' | 'moved' | 'completed' | 'reopened' | 'watched' | 'commented';
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  board_id: number;
  board_name: string;
  list_name: string;
}

export const DEFAULT_TASK_COLUMNS: TaskColumnKey[] = [
  'priority',
  'dueDate',
  'assignee',
  'status',
  'customer',
  'progress',
];

export const TASK_COLUMN_LABELS: Record<TaskColumnKey, string> = {
  priority: 'Ưu tiên',
  startDate: 'Bắt đầu',
  dueDate: 'Hạn hoàn thành',
  assignee: 'Người phụ trách',
  status: 'Trạng thái',
  customer: 'Khách hàng',
  project: 'Dự án',
  board: 'Luồng việc',
  progress: 'Tiến độ',
  creator: 'Người tạo',
  createdAt: 'Ngày tạo',
  source: 'Nguồn',
};
