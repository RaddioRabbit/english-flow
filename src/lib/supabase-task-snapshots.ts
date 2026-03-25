import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase-client";

export const SUPABASE_TASK_SNAPSHOTS_TABLE = "task_snapshots";

export interface SupabaseTaskSnapshotRecord<TTask = unknown> {
  id: string;
  workflow_id: string;
  sentence: string;
  book_name: string;
  author: string;
  status: string;
  current_stage: string;
  resume_route: string | null;
  flow_mode: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  task_data: TTask;
}

export async function upsertSupabaseTaskSnapshots(records: SupabaseTaskSnapshotRecord[]) {
  if (!records.length) {
    return { success: true as const };
  }

  if (!isSupabaseConfigured()) {
    return { success: false as const, error: "Supabase is not configured." };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false as const, error: "Supabase is not configured." };
  }

  const { error } = await supabase.from(SUPABASE_TASK_SNAPSHOTS_TABLE).upsert(records, {
    onConflict: "id",
  });

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

export async function deleteSupabaseTaskSnapshot(taskId: string) {
  if (!taskId) {
    return { success: true as const };
  }

  if (!isSupabaseConfigured()) {
    return { success: false as const, error: "Supabase is not configured." };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false as const, error: "Supabase is not configured." };
  }

  const { error } = await supabase.from(SUPABASE_TASK_SNAPSHOTS_TABLE).delete().eq("id", taskId);
  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

export async function loadSupabaseTaskSnapshots<TTask = unknown>() {
  if (!isSupabaseConfigured()) {
    return { success: false as const, error: "Supabase is not configured.", tasks: [] as TTask[] };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false as const, error: "Supabase is not configured.", tasks: [] as TTask[] };
  }

  const { data, error } = await supabase
    .from(SUPABASE_TASK_SNAPSHOTS_TABLE)
    .select("task_data")
    .order("updated_at", { ascending: false });

  if (error) {
    return { success: false as const, error: error.message, tasks: [] as TTask[] };
  }

  const tasks = (data ?? [])
    .map((row) => row?.task_data as TTask | null | undefined)
    .filter((task): task is TTask => Boolean(task));

  return { success: true as const, tasks };
}
