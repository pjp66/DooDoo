export function taskToSupabase(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    date: task.date,
    category: task.category,
    priority: task.priority,
    priority_label: task.priorityLabel,
    is_all_day: task.isAllDay,
    start_time: task.startTime,
    end_time: task.endTime,
    reminder_type: task.reminderType,
    reminder_time: task.reminderTime,
    memo: task.memo,
    is_completed: task.isCompleted ?? task.done,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
}

export function taskFromSupabase(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    category: row.category,
    priority: row.priority,
    priorityLabel: row.priority_label,
    isAllDay: row.is_all_day,
    startTime: row.start_time,
    endTime: row.end_time,
    reminderType: row.reminder_type,
    reminderTime: row.reminder_time,
    memo: row.memo || "",
    done: row.is_completed,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function categoryToSupabase(category, userId, sortOrder = 0) {
  return {
    id: category.id,
    user_id: userId,
    name: category.name,
    color: category.color,
    sort_order: sortOrder,
    created_at: category.createdAt,
    updated_at: category.updatedAt
  };
}

export function categoryFromSupabase(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
