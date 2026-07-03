import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MemberRole =
  | "admin"
  | "director"
  | "teacher"
  | "staff"
  | "janitor";

type AccountStatus = "pending" | "active" | "suspended";

type UpdateMemberBody = {
  id?: unknown;
  role?: unknown;
  accountStatus?: unknown;
  position?: unknown;
  alternateWorkplace?: unknown;
  countAsPresentWhenNoCheckin?: unknown;
};

type DeleteMemberBody = {
  id?: unknown;
};

const ALLOWED_ROLES: MemberRole[] = [
  "admin",
  "director",
  "teacher",
  "staff",
  "janitor",
];

const ALLOWED_STATUSES: AccountStatus[] = [
  "pending",
  "active",
  "suspended",
];

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    for (const key of ["message", "msg", "error_description", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const serialized = JSON.stringify(record);
    if (serialized && serialized !== "{}") return serialized;
  }

  return fallback;
}

async function requireAdmin(request: Request) {
  const config = getServerConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "เธฃเธฐเธเธเธขเธฑเธเนเธกเนเนเธ”เนเธ•เธฑเนเธเธเนเธฒ Supabase เธเธฑเนเธ Server",
        },
        { status: 500 }
      ),
    };
  }

  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน",
        },
        { status: 401 }
      ),
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
    }
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Session เธซเธกเธ”เธญเธฒเธขเธธ เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน",
        },
        { status: 401 }
      ),
    };
  }

  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["admin", "director"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "เธเธธเธ“เนเธกเนเธกเธตเธชเธดเธ—เธเธดเนเธเธฑเธ”เธเธฒเธฃเธชเธกเธฒเธเธดเธ",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
    adminClient,
  };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const { data, error } = await authResult.adminClient
      .from("profiles")
      .select(
        `
          id,
          full_name,
          phone,
          position,
          role,
          account_status,
          alternate_workplace,
          count_as_present_when_no_checkin,
          profile_image_file_id,
          signature_file_id,
          created_at,
          updated_at
        `
      )
      .not("phone", "like", "deleted:%")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load members error:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เนเธซเธฅเธ”เธฃเธฒเธขเธเธทเนเธญเธชเธกเธฒเธเธดเธเนเธ”เน",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      members: data ?? [],
    });
  } catch (error) {
    console.error("Members GET API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธฃเธฐเธซเธงเนเธฒเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธชเธกเธฒเธเธดเธ",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const body = (await request.json()) as UpdateMemberBody;

    const id = typeof body.id === "string" ? body.id.trim() : "";

    const role =
      typeof body.role === "string"
        ? (body.role.trim() as MemberRole)
        : "";

    const accountStatus =
      typeof body.accountStatus === "string"
        ? (body.accountStatus.trim() as AccountStatus)
        : "";

    const position =
      typeof body.position === "string"
        ? body.position.trim()
        : "";

    const alternateWorkplace =
      typeof body.alternateWorkplace === "string"
        ? body.alternateWorkplace.trim()
        : "";

    const countAsPresentWhenNoCheckin =
      body.countAsPresentWhenNoCheckin === true;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธเธเธฃเธซเธฑเธชเธชเธกเธฒเธเธดเธ",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role as MemberRole)) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธ—เธเธฒเธ—เธชเธกเธฒเธเธดเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(accountStatus as AccountStatus)) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธชเธ–เธฒเธเธฐเธชเธกเธฒเธเธดเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ",
        },
        { status: 400 }
      );
    }

    if (alternateWorkplace.length > 200) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธทเนเธญเธชเธ–เธฒเธเธ—เธตเนเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธขเธฒเธงเน€เธเธดเธเนเธ",
        },
        { status: 400 }
      );
    }

    if (countAsPresentWhenNoCheckin && !alternateWorkplace) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธชเธ–เธฒเธเธ—เธตเนเธเธเธดเธเธฑเธ•เธดเธเธฒเธเน€เธเธดเนเธกเน€เธ•เธดเธก",
        },
        { status: 400 }
      );
    }

    if (position.length > 150) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธทเนเธญเธ•เธณเนเธซเธเนเธเธขเธฒเธงเน€เธเธดเธเนเธ",
        },
        { status: 400 }
      );
    }

    if (id === authResult.user.id) {
      if (role !== "admin" || accountStatus !== "active") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฅเธ”เธชเธดเธ—เธเธดเนเธซเธฃเธทเธญเธฃเธฐเธเธฑเธเธเธฑเธเธเธตเธเธนเนเธ”เธนเนเธฅเธ—เธตเนเธเธณเธฅเธฑเธเนเธเนเธเธฒเธเธญเธขเธนเน",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await authResult.adminClient
      .from("profiles")
      .update({
        role,
        account_status: accountStatus,
        position: position || null,
        alternate_workplace: countAsPresentWhenNoCheckin
          ? alternateWorkplace
          : null,
        count_as_present_when_no_checkin: countAsPresentWhenNoCheckin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
          id,
          full_name,
          phone,
          position,
          role,
          account_status,
          alternate_workplace,
          count_as_present_when_no_checkin,
          profile_image_file_id,
          signature_file_id,
          created_at,
          updated_at
        `
      )
      .single();

    if (error) {
      console.error("Update member error:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเธชเธกเธฒเธเธดเธเนเธ”เน",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      member: data,
      message: "เธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเธชเธกเธฒเธเธดเธเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง",
    });
  } catch (error) {
    console.error("Members PATCH API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธฃเธฐเธซเธงเนเธฒเธเธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเธชเธกเธฒเธเธดเธ",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const body = (await request.json()) as DeleteMemberBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธเธเธฃเธซเธฑเธชเธชเธกเธฒเธเธดเธเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธฅเธ",
        },
        { status: 400 }
      );
    }

    if (id === authResult.user.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฅเธเธเธฑเธเธเธตเธ—เธตเนเธเธณเธฅเธฑเธเนเธเนเธเธฒเธเธญเธขเธนเน",
        },
        { status: 400 }
      );
    }

    const { data: member, error: memberError } = await authResult.adminClient
      .from("profiles")
      .select("id, full_name, phone")
      .eq("id", id)
      .maybeSingle();

    if (memberError) {
      console.error("Find member before delete error:", memberError);

      return NextResponse.json(
        {
          ok: false,
          message: "เธ•เธฃเธงเธเธชเธญเธเธชเธกเธฒเธเธดเธเธเนเธญเธเธฅเธเนเธกเนเธชเธณเน€เธฃเนเธ",
        },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธเธเธชเธกเธฒเธเธดเธเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธฅเธ",
        },
        { status: 404 }
      );
    }

    const { error: deleteAuthError } =
      await authResult.adminClient.auth.admin.deleteUser(id, true);
    const authDeleteWarning = deleteAuthError
      ? getErrorMessage(
          deleteAuthError,
          "Supabase Auth เนเธกเนเธ•เธญเธเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธเธฅเธฑเธเธกเธฒ"
        )
      : "";

    if (deleteAuthError) {
      console.error("Delete member auth user error:", deleteAuthError);
    }

    const { error: archiveProfileError } = await authResult.adminClient
      .from("profiles")
      .update({
        account_status: "suspended",
        phone: member.phone?.startsWith("deleted:")
          ? member.phone
          : `deleted:${id}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (archiveProfileError) {
      console.error("Archive member profile error:", archiveProfileError);

      return NextResponse.json(
        {
          ok: false,
          message: `เธเธดเธ”เธเธฑเธเธเธตเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธฅเนเธง เนเธ•เนเธเนเธญเธเธชเธกเธฒเธเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ: ${getErrorMessage(
            archiveProfileError,
            "เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅเธชเธกเธฒเธเธดเธเธญเธตเธเธเธฃเธฑเนเธ"
          )}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      message: authDeleteWarning
        ? `เธเนเธญเธเธชเธกเธฒเธเธดเธ ${member.full_name || ""} เนเธฅเนเธง เนเธ•เน Supabase Auth เนเธเนเธเน€เธ•เธทเธญเธ: ${authDeleteWarning}`
        : `เธฅเธเธชเธกเธฒเธเธดเธ ${member.full_name || ""} เน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง`,
    });
  } catch (error) {
    console.error("Members DELETE API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธฃเธฐเธซเธงเนเธฒเธเธฅเธเธชเธกเธฒเธเธดเธ",
      },
      { status: 500 }
    );
  }
}

