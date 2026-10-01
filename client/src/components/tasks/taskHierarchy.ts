import type { TaskRow } from '../../types';

export interface TaskHierarchy {
  /** Việc cấp trên cùng: không có cha, hoặc cha không nằm trong tập đang hiển thị. */
  roots: TaskRow[];
  childrenOf: Map<number, TaskRow[]>;
}

/** Tách danh sách phẳng thành việc cha và việc con (giữ nguyên thứ tự đầu vào). */
export function splitByParent(tasks: TaskRow[]): TaskHierarchy {
  const ids = new Set(tasks.map((task) => task.id));
  const roots: TaskRow[] = [];
  const childrenOf = new Map<number, TaskRow[]>();
  for (const task of tasks) {
    if (task.parent_id && ids.has(task.parent_id)) {
      childrenOf.set(task.parent_id, [...(childrenOf.get(task.parent_id) ?? []), task]);
    } else {
      roots.push(task);
    }
  }
  return { roots, childrenOf };
}

/** Danh sách phẳng theo thứ tự cha → con, kèm cấp lồng nhau. */
export function flattenHierarchy(tasks: TaskRow[]): Array<{ task: TaskRow; depth: number }> {
  const { roots, childrenOf } = splitByParent(tasks);
  const rows: Array<{ task: TaskRow; depth: number }> = [];
  const walk = (task: TaskRow, depth: number) => {
    rows.push({ task, depth });
    for (const child of childrenOf.get(task.id) ?? []) walk(child, depth + 1);
  };
  for (const task of roots) walk(task, 0);
  return rows;
}
