export function taskToSupabase(task, userId) {
  const row = {
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
    notification_id: task.notificationId,
    sort_order: task.sortOrder,
    memo: task.memo,
    is_completed: task.isCompleted ?? task.done,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };

  if (typeof task.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(task.id)) {
    row.id = task.id;
  }

  return row;
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
    reminderDate: row.reminder_date || null,
    notificationId: row.notification_id,
    sortOrder: row.sort_order ?? null,
    memo: row.memo || "",
    done: row.is_completed,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function categoryToSupabase(category, userId, sortOrder = 0) {
  const row = {
    user_id: userId,
    name: category.name,
    color: category.color,
    sort_order: sortOrder,
    created_at: category.createdAt,
    updated_at: category.updatedAt
  };

  if (typeof category.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(category.id)) {
    row.id = category.id;
  }

  return row;
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
