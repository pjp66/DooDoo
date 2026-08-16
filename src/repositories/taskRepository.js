import { loadStoredJson, saveStoredJson } from "../storage/localStore";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  taskFromSupabase,
  taskToSupabase,
  categoryFromSupabase,
  categoryToSupabase
} from "../services/supabaseMappings";

function shouldUseSupabase(userId) {
  return Boolean(isSupabaseConfigured && supabase && userId);
}

const pendingDefaultCategoryCreation = new Map();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTaskErrorMessage(action, error) {
  const message = error?.message || "";
  if (message.includes("Network request failed") || message.includes("fetch")) return "네트워크 연결을 확인해주세요.";
  if (message.includes("permission denied") || message.includes("row-level security")) return "Supabase 권한 정책을 확인해주세요.";
  if (message.includes("relation") && message.includes("does not exist")) return "Supabase tasks 테이블을 찾지 못했어요.";
  return `${action} 못했어요. 잠시 후 다시 시도해주세요.`;
}

function getCategoryErrorMessage(action, error) {
  const message = error?.message || "";
  if (message.includes("Network request failed") || message.includes("fetch")) return "네트워크 연결을 확인해주세요.";
  if (message.includes("permission denied") || message.includes("row-level security")) return "Supabase 권한 정책을 확인해주세요.";
  if (message.includes("relation") && message.includes("does not exist")) return "Supabase categories 테이블을 찾지 못했어요.";
  if (message.includes("duplicate")) return "같은 이름의 분야가 이미 있어요.";
  return `${action} 못했어요. 잠시 후 다시 시도해주세요.`;
}

function isMissingNotificationIdColumn(error) {
  const message = error?.message || "";
  return message.includes("notification_id") && (
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function withoutNotificationId(row) {
  const { notification_id, ...rest } = row;
  return rest;
}

function isMissingTaskOptionalColumn(error) {
  const message = error?.message || "";
  return (message.includes("notification_id") || message.includes("sort_order")) && (
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function withoutMissingTaskOptionalColumns(row, error) {
  const nextRow = { ...row };
  delete nextRow.notification_id;
  delete nextRow.sort_order;
  return nextRow;
}

export async function loadTasks(userId) {
  if (shouldUseSupabase(userId)) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw new Error(getTaskErrorMessage("할 일을 불러오지", error));
    return (data || []).map(taskFromSupabase);
  }

  return loadStoredJson("tasks", []);
}

export async function saveTasks(tasks, userId) {
  if (shouldUseSupabase(userId)) return;
  return saveStoredJson("tasks", tasks);
}

export async function createTask(task, userId) {
  if (!shouldUseSupabase(userId)) return task;

  const row = taskToSupabase(task, userId);
  let { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select()
    .single();

  if (isMissingNotificationIdColumn(error) || isMissingTaskOptionalColumn(error)) {
    const fallbackRow = isMissingTaskOptionalColumn(error) ? withoutMissingTaskOptionalColumns(row, error) : withoutNotificationId(row);
    const fallback = await supabase
      .from("tasks")
      .insert(fallbackRow)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(getTaskErrorMessage("할 일을 저장하지", error));
  return { ...taskFromSupabase(data), notificationId: data?.notification_id || task.notificationId || null };
}

export async function updateTask(task, userId) {
  if (!shouldUseSupabase(userId)) return task;

  const { id, user_id, ...row } = taskToSupabase(task, userId);
  let { data, error } = await supabase
    .from("tasks")
    .update(row)
    .eq("id", task.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (isMissingNotificationIdColumn(error) || isMissingTaskOptionalColumn(error)) {
    const fallbackRow = isMissingTaskOptionalColumn(error) ? withoutMissingTaskOptionalColumns(row, error) : withoutNotificationId(row);
    const fallback = await supabase
      .from("tasks")
      .update(fallbackRow)
      .eq("id", task.id)
      .eq("user_id", userId)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(getTaskErrorMessage("할 일을 수정하지", error));
  return { ...taskFromSupabase(data), notificationId: data?.notification_id || task.notificationId || null };
}

export async function updateTaskCompletion(id, done, userId) {
  if (!shouldUseSupabase(userId)) return null;

  const { data, error } = await supabase
    .from("tasks")
    .update({ is_completed: done, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(getTaskErrorMessage("완료 상태를 저장하지", error));
  return taskFromSupabase(data);
}

export async function deleteTaskById(id, userId) {
  if (!shouldUseSupabase(userId)) return;

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(getTaskErrorMessage("할 일을 삭제하지", error));
}

async function createDefaultCategories(userId, defaults = []) {
  if (!shouldUseSupabase(userId) || defaults.length === 0) return [];

  if (pendingDefaultCategoryCreation.has(userId)) {
    return pendingDefaultCategoryCreation.get(userId);
  }

  const creation = (async () => {
    const { data: latestRows, error: latestError } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (latestError) throw new Error(getCategoryErrorMessage("분야를 불러오지", latestError));
    if (latestRows?.length) return latestRows.map(categoryFromSupabase);

    const now = new Date().toISOString();
    const rows = defaults.map((category, index) => categoryToSupabase({
      name: category.name,
      color: category.color,
      createdAt: now,
      updatedAt: now
    }, userId, index));

    const { data, error } = await supabase
      .from("categories")
      .insert(rows)
      .select()
      .order("sort_order", { ascending: true });

    if (error) throw new Error(getCategoryErrorMessage("기본 분야를 생성하지", error));
    return (data || []).map(categoryFromSupabase);
  })();

  pendingDefaultCategoryCreation.set(userId, creation);
  try {
    return await creation;
  } finally {
    pendingDefaultCategoryCreation.delete(userId);
  }
}

export async function loadCategories(userId, defaults = []) {
  if (shouldUseSupabase(userId)) {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(getCategoryErrorMessage("분야를 불러오지", error));
    if (!data?.length) return createDefaultCategories(userId, defaults);
    return data.map(categoryFromSupabase);
  }

  return loadStoredJson("fields", null);
}

export async function saveCategories(categories, userId) {
  if (shouldUseSupabase(userId)) return;
  return saveStoredJson("fields", categories);
}

export async function createCategory(category, userId, sortOrder = 0) {
  if (!shouldUseSupabase(userId)) return category;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("categories")
    .insert(categoryToSupabase({ ...category, createdAt: now, updatedAt: now }, userId, sortOrder))
    .select()
    .single();

  if (error) throw new Error(getCategoryErrorMessage("분야를 추가하지", error));
  return categoryFromSupabase(data);
}

export async function updateCategory(category, previousCategory, userId) {
  if (!shouldUseSupabase(userId)) return category;

  const now = new Date().toISOString();
  const { id, user_id, ...row } = categoryToSupabase({ ...category, updatedAt: now }, userId, category.sortOrder ?? 0);
  const { data, error } = await supabase
    .from("categories")
    .update(row)
    .eq("id", category.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(getCategoryErrorMessage("분야를 수정하지", error));

  if (previousCategory?.name && previousCategory.name !== category.name) {
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ category: category.name, updated_at: now })
      .eq("user_id", userId)
      .eq("category", previousCategory.name);

    if (taskError) throw new Error(getTaskErrorMessage("분야를 쓰는 할 일을 수정하지", taskError));
  }

  return categoryFromSupabase(data);
}

export async function updateCategoryOrder(categories, userId) {
  const orderedCategories = categories.map((category, index) => ({
    ...category,
    sortOrder: index,
    updatedAt: new Date().toISOString()
  }));

  if (!shouldUseSupabase(userId)) return orderedCategories;

  const remoteCategories = orderedCategories.filter((category) => UUID_PATTERN.test(category.id));
  if (remoteCategories.length === 0) return orderedCategories;

  const updates = remoteCategories.map((category) => (
    supabase
      .from("categories")
      .update({ sort_order: category.sortOrder, updated_at: category.updatedAt })
      .eq("id", category.id)
      .eq("user_id", userId)
      .select()
      .single()
  ));

  const results = await Promise.all(updates);
  const errorResult = results.find((result) => result.error);
  if (errorResult?.error) throw new Error(getCategoryErrorMessage("분야 순서를 저장하지", errorResult.error));

  const savedById = new Map(results.map((result) => {
    const category = categoryFromSupabase(result.data);
    return [category.id, category];
  }));

  return orderedCategories.map((category) => savedById.get(category.id) || category);
}

export async function deleteCategoryById(category, userId) {
  if (!shouldUseSupabase(userId)) return;

  const now = new Date().toISOString();
  const { error: taskError } = await supabase
    .from("tasks")
    .update({ category: "미지정", updated_at: now })
    .eq("user_id", userId)
    .eq("category", category.name);

  if (taskError) throw new Error(getTaskErrorMessage("분야를 쓰는 할 일을 수정하지", taskError));

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", category.id)
    .eq("user_id", userId);

  if (error) throw new Error(getCategoryErrorMessage("분야를 삭제하지", error));
}

export const taskRepositoryMode = isSupabaseConfigured ? "local-ready-for-supabase" : "local";

export const supabaseMappers = {
  taskToSupabase,
  taskFromSupabase,
  categoryToSupabase,
  categoryFromSupabase
};
