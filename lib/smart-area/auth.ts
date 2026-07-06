import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SmartAreaProfile = {
  id: string;
  full_name: string;
  role: string;
  account_status: string;
  work_permissions: string[];
};

type SmartAreaAuthSuccess = {
  ok: true;
  profile: SmartAreaProfile;
  admin: SupabaseClient;
  canManageAll: boolean;
};

type SmartAreaAuthFailure = {
  ok: false;
  status: number;
  message: string;
};

function serverConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ")
    ? value.slice("Bearer ".length).trim()
    : "";
}

export async function requireSmartAreaUser(
  request: Request,
): Promise<SmartAreaAuthSuccess | SmartAreaAuthFailure> {
  const config = serverConfig();

  if (!config) {
    return {
      ok: false,
      status: 500,
      message: "ยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
    };
  }

  const token = bearerToken(request);

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role, account_status, work_permissions")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || data.account_status !== "active") {
    return {
      ok: false,
      status: 403,
      message: "บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบ",
    };
  }

  const workPermissions = Array.isArray(data.work_permissions)
    ? data.work_permissions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const role = String(data.role || "").trim().toLowerCase();
  const canManageAll =
    role === "admin" ||
    role === "director" ||
    workPermissions.includes("smart_area.clerk");

  return {
    ok: true,
    profile: {
      id: data.id,
      full_name: String(data.full_name || "").trim(),
      role,
      account_status: data.account_status,
      work_permissions: workPermissions,
    },
    admin,
    canManageAll,
  };
}
