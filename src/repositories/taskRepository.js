import { loadStoredJson, saveStoredJson } from "../storage/localStore";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  taskFromSupabase,
  taskToSupabase,
  categoryFromSupabase,
  categoryToSupabase
} from "../services/supabaseMappings";

export async function loadTasks() {
  return loadStoredJson("tasks", []);
}

export async function saveTasks(tasks) {
  return saveStoredJson("tasks", tasks);
}

export async function loadCategories() {
  return loadStoredJson("fields", null);
}

export async function saveCategories(categories) {
  return saveStoredJson("fields", categories);
}

export const taskRepositoryMode = isSupabaseConfigured ? "local-ready-for-supabase" : "local";

export const supabaseMappers = {
  taskToSupabase,
  taskFromSupabase,
  categoryToSupabase,
  categoryFromSupabase
};
