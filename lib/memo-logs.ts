import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoLog = {
  id: string;
  memo_request_id: string;
  actor_id: string | null;
  actor_name: string | null;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

type RawMemoLog = {
  id: string;
  memo_request_id: string;
  actor_id: string | null;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

export async function loadMemoLogsByRequest(
  admin: SupabaseClient,
  requestIds: string[]
) {
  if (requestIds.length === 0) {
    return new Map<string, MemoLog[]>();
  }

  const { data: logs, error: logsError } = await admin
    .from("memo_request_logs")
    .select("id, memo_request_id, actor_id, from_status, to_status, note, created_at")
    .in("memo_request_id", requestIds)
    .order("created_at", { ascending: true });

  if (logsError) {
    throw new Error(logsError.message);
  }

  const rawLogs = (logs ?? []) as RawMemoLog[];
  const actorIds = Array.from(
    new Set(rawLogs.map((log) => log.actor_id).filter(Boolean) as string[])
  );
  const actorNames = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of profiles ?? []) {
      actorNames.set(profile.id, profile.full_name);
    }
  }

  const grouped = new Map<string, MemoLog[]>();

  for (const log of rawLogs) {
    const current = grouped.get(log.memo_request_id) ?? [];
    current.push({
      ...log,
      actor_name: log.actor_id ? actorNames.get(log.actor_id) ?? null : null,
    });
    grouped.set(log.memo_request_id, current);
  }

  return grouped;
}
