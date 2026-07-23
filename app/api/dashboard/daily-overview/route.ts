import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";

export const dynamic = "force-dynamic";

type StaffProfile = {
  id: string;
  full_name: string | null;
  position: string | null;
  role: string | null;
  account_status: string | null;
  profile_image_file_id: string | null;
  alternate_workplace: string | null;
  count_as_present_when_no_checkin: boolean | null;
};

type AttendanceRecord = {
  user_id: string | null;
  check_in_at: string | null;
  check_in_status: string | null;
};

type LeaveRequest = {
  user_id: string | null;
  leave_type: string | null;
  reason: string | null;
};

type OfficialDutyRequest = {
  user_id: string | null;
  subject: string | null;
  reason: string | null;
};

type StudentRow = {
  id: string;
  class_level: string | null;
  class_room: string | null;
};

type StudentAttendanceRow = {
  student_id: string | null;
  class_level: string | null;
  class_room: string | null;
  status: string | null;
};

type WorkCalendarDay = {
  work_date: string | null;
  day_type: "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY" | null;
};

type StudentClassInfo = {
  classLevel: string;
  classRoom: string;
};

type SmartAreaTask = {
  assignee_id: string | null;
  assignee_name_snapshot: string | null;
  status: string | null;
  assignment_opened_at: string | null;
  assignment_acknowledged_at: string | null;
  is_active: boolean | null;
};

type SmartAreaBook = {
  id: string;
  subject: string | null;
  received_date: string | null;
  status: string | null;
  updated_at: string | null;
  is_active: boolean | null;
  smart_area_tasks?: SmartAreaTask[] | null;
};

type OrderRecipientRow = {
  id: string;
  profile_id: string | null;
  recipient_name_snapshot: string | null;
  acknowledged_at: string | null;
  notified_at: string | null;
  order_documents?:
    | {
        id: string;
        order_number: string | null;
        subject: string | null;
        order_date: string | null;
        status: string | null;
      }
    | {
    id: string;
    order_number: string | null;
    subject: string | null;
    order_date: string | null;
    status: string | null;
      }[]
    | null;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : "";
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWeekend(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isWorkingDay(value: string, calendarDay?: WorkCalendarDay | null) {
  if (calendarDay?.day_type === "SPECIAL_WORKDAY") return true;
  if (
    calendarDay?.day_type === "PUBLIC_HOLIDAY" ||
    calendarDay?.day_type === "SCHOOL_HOLIDAY"
  ) {
    return false;
  }
  return !isWeekend(value);
}

function displayName(profile: StaffProfile) {
  return profile.full_name?.trim() || profile.position?.trim() || "ไม่ระบุชื่อ";
}

function thaiDateShort(value: string) {
  const dateValue = String(value || "").slice(0, 10);
  if (!isValidDate(dateValue)) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00+07:00`));
}

function orderFromRecipient(recipient: OrderRecipientRow) {
  const order = recipient.order_documents;
  return Array.isArray(order) ? order[0] ?? null : order ?? null;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayDifference(fromDate: string, toDate: string) {
  if (!isValidDate(fromDate) || !isValidDate(toDate)) return 0;
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toTime = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.max(0, Math.floor((toTime - fromTime) / 86_400_000));
}

function classKey(classLevel: string, classRoom: string | null | undefined) {
  return `${classLevel.trim()}|${String(classRoom ?? "").trim()}`;
}

function normalizeStudentStatus(value: string | null) {
  if (value === "absent") return "absent";
  if (value === "leave" || value === "sick" || value === "personal") {
    return "leave";
  }
  return "present";
}

function countsAsPresentWithoutCheckIn(profile: StaffProfile) {
  return Boolean(
    profile.count_as_present_when_no_checkin &&
      profile.alternate_workplace?.trim(),
  );
}

async function requireActiveUser(request: Request) {
  const config = getConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 },
      ),
    };
  }

  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const authClient = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์ใช้งาน Dashboard" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, admin, profile };
}

export async function GET(request: Request) {
  try {
    const auth = await requireActiveUser(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const requestedDate = url.searchParams.get("date")?.trim() || "";
    const date = isValidDate(requestedDate) ? requestedDate : todayBangkok();
    const overdueBefore = addDays(date, -3);
    const canViewAllOrders = ["admin", "director"].includes(
      String(auth.profile.role || ""),
    );
    const orderRecipientsQuery = auth.admin
      .from("order_document_recipients")
      .select(
        `
          id,
          profile_id,
          recipient_name_snapshot,
          acknowledged_at,
          notified_at,
          order_documents (
            id,
            order_number,
            subject,
            order_date,
            status
          )
        `,
      )
      .order("notified_at", { ascending: false })
      .limit(canViewAllOrders ? 200 : 30);

    const [
      profilesResult,
      attendanceResult,
      leaveResult,
      officialDutyResult,
      studentsResult,
      studentAttendanceResult,
      booksResult,
      orderRecipientsResult,
      workCalendarResult,
    ] = await Promise.all([
      auth.admin
        .from("profiles")
        .select(
          "id, full_name, position, role, account_status, profile_image_file_id, alternate_workplace, count_as_present_when_no_checkin",
        )
        .eq("account_status", "active")
        .order("full_name", { ascending: true }),
      auth.admin
        .from("attendance_records")
        .select("user_id, check_in_at, check_in_status")
        .eq("work_date", date),
      auth.admin
        .from("leave_requests")
        .select("user_id, leave_type, reason")
        .in("status", ["pending", "approved"])
        .lte("start_date", date)
        .gte("end_date", date),
      auth.admin
        .from("official_duty_requests")
        .select("user_id, subject, reason")
        .in("status", ["pending", "approved"])
        .lte("duty_date", date)
        .or(`duty_end_date.gte.${date},duty_end_date.is.null`),
      auth.admin
        .from("students")
        .select("id, class_level, class_room")
        .eq("status", "active"),
      auth.admin
        .from("student_attendance")
        .select("student_id, class_level, class_room, status")
        .eq("attendance_date", date),
      auth.admin
        .from("smart_area_books")
        .select(
          `
            id,
            subject,
            received_date,
            status,
            updated_at,
            is_active,
            smart_area_tasks (
              assignee_id,
              assignee_name_snapshot,
              status,
              assignment_opened_at,
              assignment_acknowledged_at,
              is_active
            )
          `,
        )
        .eq("is_active", true)
        .order("received_date", { ascending: false, nullsFirst: false })
        .limit(100),
      canViewAllOrders
        ? orderRecipientsQuery
        : orderRecipientsQuery.eq("profile_id", auth.profile.id),
      auth.admin
        .from("work_calendar_days")
        .select("work_date, day_type")
        .eq("work_date", date)
        .maybeSingle(),
    ]);

    const firstError =
      profilesResult.error ||
      attendanceResult.error ||
      leaveResult.error ||
      officialDutyResult.error ||
      studentsResult.error ||
      studentAttendanceResult.error ||
      booksResult.error ||
      orderRecipientsResult.error ||
      workCalendarResult.error;

    if (firstError) {
      console.error("Daily dashboard load error:", firstError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถโหลดข้อมูล Dashboard ได้" },
        { status: 500 },
      );
    }

    const profiles = (profilesResult.data ?? []) as StaffProfile[];
    const attendance = (attendanceResult.data ?? []) as AttendanceRecord[];
    const leaves = (leaveResult.data ?? []) as LeaveRequest[];
    const officialDuties =
      (officialDutyResult.data ?? []) as OfficialDutyRequest[];
    const students = (studentsResult.data ?? []) as StudentRow[];
    const studentAttendance =
      (studentAttendanceResult.data ?? []) as StudentAttendanceRow[];
    const books = (booksResult.data ?? []) as SmartAreaBook[];
    const orderRecipients =
      (orderRecipientsResult.data ?? []) as unknown as OrderRecipientRow[];
    const workCalendarDay =
      (workCalendarResult.data ?? null) as WorkCalendarDay | null;
    const workingDay = isWorkingDay(date, workCalendarDay);

    const attendanceByUser = new Map(
      attendance
        .filter((record) => record.user_id)
        .map((record) => [String(record.user_id), record]),
    );
    const leaveByUser = new Map(
      leaves
        .filter((leave) => leave.user_id)
        .map((leave) => [String(leave.user_id), leave]),
    );
    const dutyByUser = new Map(
      officialDuties
        .filter((duty) => duty.user_id)
        .map((duty) => [String(duty.user_id), duty]),
    );

    const leaveOrDutyPeople = profiles
      .filter((profile) => leaveByUser.has(profile.id) || dutyByUser.has(profile.id))
      .slice(0, 5)
      .map((profile) => {
        const name = displayName(profile);
        const leave = leaveByUser.get(profile.id);
        const duty = dutyByUser.get(profile.id);
        return {
          id: profile.id,
          name,
          label: duty ? "ไปราชการ" : leave?.leave_type === "sick" ? "ลาป่วย" : "ลากิจ",
          note: duty?.subject || duty?.reason || leave?.reason || "",
          initials: initials(name),
          imageFileId: profile.profile_image_file_id || "",
        };
      });

    const staffSummary = {
      total: profiles.length,
      checkedIn: profiles.filter((profile) =>
        Boolean(attendanceByUser.get(profile.id)?.check_in_at) ||
        (workingDay && countsAsPresentWithoutCheckIn(profile)),
      ).length,
      late: profiles.filter(
        (profile) => attendanceByUser.get(profile.id)?.check_in_status === "late",
      ).length,
      leave: profiles.filter((profile) => leaveByUser.has(profile.id)).length,
      officialDuty: profiles.filter((profile) => dutyByUser.has(profile.id)).length,
      notCheckedIn: profiles.filter(
        (profile) =>
          workingDay &&
          !attendanceByUser.get(profile.id)?.check_in_at &&
          !leaveByUser.has(profile.id) &&
          !dutyByUser.has(profile.id) &&
          !(workingDay && countsAsPresentWithoutCheckIn(profile)),
      ).length,
      leaveOrDutyPeople,
    };

    const activeClassKeys = new Set<string>();
    const studentClassById = new Map<string, StudentClassInfo>();
    const studentTotals = new Map<string, number>();
    students.forEach((student) => {
      const level = String(student.class_level || "").trim();
      if (!level) return;
      const room = String(student.class_room ?? "").trim();
      const key = classKey(level, room);
      activeClassKeys.add(key);
      studentTotals.set(key, (studentTotals.get(key) ?? 0) + 1);
      studentClassById.set(student.id, { classLevel: level, classRoom: room });
    });

    const recordTotals = new Map<string, number>();
    const studentClassCounts = new Map<
      string,
      { present: number; leave: number; absent: number }
    >();
    let present = 0;
    let leave = 0;
    let absent = 0;

    studentAttendance.forEach((record) => {
      const studentClass = record.student_id
        ? studentClassById.get(String(record.student_id))
        : undefined;
      const level = String(record.class_level || studentClass?.classLevel || "").trim();
      if (!level) return;
      const room =
        String(record.class_room ?? "").trim() || studentClass?.classRoom || "";
      const key = classKey(level, room);
      const status = normalizeStudentStatus(record.status);
      const counts = studentClassCounts.get(key) ?? {
        present: 0,
        leave: 0,
        absent: 0,
      };

      recordTotals.set(key, (recordTotals.get(key) ?? 0) + 1);

      if (status === "absent") {
        absent += 1;
        counts.absent += 1;
      } else if (status === "leave") {
        leave += 1;
        counts.leave += 1;
      } else {
        present += 1;
        counts.present += 1;
      }

      studentClassCounts.set(key, counts);
    });

    const sortedClassKeys = [
      ...STUDENT_CLASS_LEVELS.flatMap((level) =>
        Array.from(activeClassKeys).filter((key) => key.startsWith(`${level}|`)),
      ),
      ...Array.from(activeClassKeys).filter(
        (key) =>
          !STUDENT_CLASS_LEVELS.some((level) => key.startsWith(`${level}|`)),
      ),
    ];
    const classSummaries = sortedClassKeys.map((key) => {
      const [classLevel, classRoom] = key.split("|");
      const counts = studentClassCounts.get(key) ?? {
        present: 0,
        leave: 0,
        absent: 0,
      };
      return {
        classLevel,
        classRoom,
        label: classLevel,
        total: studentTotals.get(key) ?? 0,
        checked: (recordTotals.get(key) ?? 0) > 0,
        ...counts,
      };
    });

    const studentSummary = {
      total: students.length,
      present,
      leave,
      absent,
      checkedClasses: classSummaries.filter((item) => item.checked).length,
      totalClasses: classSummaries.length,
      classSummaries: classSummaries.slice(0, 8),
    };

    const activeTasks = books.flatMap((book) =>
      (book.smart_area_tasks ?? [])
        .filter((task) => task.is_active)
        .map((task) => ({ ...task, book })),
    );
    const unacknowledgedTasks = activeTasks.filter(
      (task) =>
        task.status === "assigned" &&
        !task.assignment_acknowledged_at &&
        !task.assignment_opened_at,
    );
    const overdueBooks = books.filter(
      (book) =>
        book.status !== "done" &&
        String(book.received_date || "").slice(0, 10) <= overdueBefore,
    );
    const documentAssigneeIds = Array.from(
      new Set(
        activeTasks
          .map((task) => String(task.assignee_id || "").trim())
          .filter(Boolean),
      ),
    );
    const { data: documentProfiles, error: documentProfilesError } =
      documentAssigneeIds.length > 0
        ? await auth.admin
            .from("profiles")
            .select("id, full_name, profile_image_file_id")
            .in("id", documentAssigneeIds)
        : { data: [], error: null };

    if (documentProfilesError) {
      console.warn(
        "Daily dashboard document profile image warning:",
        documentProfilesError,
      );
    }

    const documentProfileById = new Map(
      ((documentProfiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        profile_image_file_id: string | null;
      }>).map((profile) => [profile.id, profile]),
    );
    const documentsByAssignee = new Map<
      string,
      {
        name: string;
        unacknowledged: number;
        inProgress: number;
        done: number;
        pending1Day: number;
        pending2Days: number;
        pending3PlusDays: number;
        imageFileId: string;
      }
    >();

    activeTasks.forEach((task) => {
      const assigneeId = String(task.assignee_id || "").trim();
      const key = assigneeId || task.assignee_name_snapshot || "unknown";
      const profile = assigneeId
        ? documentProfileById.get(assigneeId)
        : undefined;
      const name =
        profile?.full_name?.trim() ||
        task.assignee_name_snapshot?.trim() ||
        "ไม่ระบุผู้รับ";
      const current = documentsByAssignee.get(key);
      const receivedDate = String(task.book.received_date || "").slice(0, 10);
      const pendingDays = dayDifference(receivedDate, date);
      const isDone = task.status === "done";
      const isUnacknowledged =
        task.status === "assigned" &&
        !task.assignment_acknowledged_at &&
        !task.assignment_opened_at;
      const isInProgress = !isDone && !isUnacknowledged;

      documentsByAssignee.set(key, {
        name,
        unacknowledged:
          (current?.unacknowledged ?? 0) + (isUnacknowledged ? 1 : 0),
        inProgress:
          (current?.inProgress ?? 0) + (isInProgress ? 1 : 0),
        done: (current?.done ?? 0) + (isDone ? 1 : 0),
        pending1Day:
          (current?.pending1Day ?? 0) +
          (isUnacknowledged && pendingDays === 1 ? 1 : 0),
        pending2Days:
          (current?.pending2Days ?? 0) +
          (isUnacknowledged && pendingDays === 2 ? 1 : 0),
        pending3PlusDays:
          (current?.pending3PlusDays ?? 0) +
          (isUnacknowledged && pendingDays >= 3 ? 1 : 0),
        imageFileId: current?.imageFileId || profile?.profile_image_file_id || "",
      });
    });
    const inProgressTasks = activeTasks.filter(
      (task) =>
        task.status !== "done" &&
        !(
          task.status === "assigned" &&
          !task.assignment_acknowledged_at &&
          !task.assignment_opened_at
        ),
    );
    const pending1Day = unacknowledgedTasks.filter((task) => {
      const receivedDate = String(task.book.received_date || "").slice(0, 10);
      return dayDifference(receivedDate, date) === 1;
    }).length;
    const pending2Days = unacknowledgedTasks.filter((task) => {
      const receivedDate = String(task.book.received_date || "").slice(0, 10);
      return dayDifference(receivedDate, date) === 2;
    }).length;
    const pending3PlusDays = unacknowledgedTasks.filter((task) => {
      const receivedDate = String(task.book.received_date || "").slice(0, 10);
      return dayDifference(receivedDate, date) >= 3;
    }).length;

    const documentSummary = {
      assigned: activeTasks.length,
      acknowledged: activeTasks.filter(
        (task) =>
          task.status === "in_progress" ||
          task.status === "done" ||
          task.assignment_acknowledged_at ||
          task.assignment_opened_at,
      ).length,
      unacknowledged: unacknowledgedTasks.length,
      inProgress: inProgressTasks.length,
      pending1Day,
      pending2Days,
      pending3PlusDays,
      done: activeTasks.filter((task) => task.status === "done").length,
      overdue: overdueBooks.length,
      people: Array.from(documentsByAssignee.values())
        .filter(
          (person) =>
            person.unacknowledged > 0 ||
            person.inProgress > 0,
        )
        .sort(
          (left, right) =>
            right.unacknowledged - left.unacknowledged ||
            right.inProgress - left.inProgress ||
            right.done - left.done ||
            left.name.localeCompare(right.name, "th"),
        )
        .map((person) => ({
          name: person.name,
          note: [
            person.pending1Day > 0
              ? `ค้าง 1 วัน ${person.pending1Day.toLocaleString("th-TH")} เรื่อง`
              : "",
            person.pending2Days > 0
              ? `ค้าง 2 วัน ${person.pending2Days.toLocaleString("th-TH")} เรื่อง`
              : "",
            person.pending3PlusDays > 0
              ? `ค้าง 3 วัน ${person.pending3PlusDays.toLocaleString("th-TH")} เรื่อง`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          count: person.unacknowledged + person.inProgress + person.done,
          statusCounts: {
            unacknowledged: person.unacknowledged,
            inProgress: person.inProgress,
            done: person.done,
          },
          initials: initials(person.name),
          imageFileId: person.imageFileId,
        })),
    };

    const activeOrderRecipients = orderRecipients.filter((recipient) => {
      const order = orderFromRecipient(recipient);
      return order?.status === "APPROVED";
    });
    const orderGroups = new Map<
      string,
      {
        id: string;
        orderNumber: string;
        subject: string;
        orderDate: string;
        assigned: number;
        acknowledged: number;
        pendingNames: string[];
      }
    >();
    const recipientStats = new Map<string, { assigned: number; pending: number }>();

    activeOrderRecipients.forEach((recipient) => {
      const order = orderFromRecipient(recipient);
      const orderId = String(order?.id || recipient.id);
      const acknowledged = Boolean(recipient.acknowledged_at);
      const current = orderGroups.get(orderId) ?? {
        id: orderId,
        orderNumber: String(order?.order_number || "").trim(),
        subject: String(order?.subject || "").trim(),
        orderDate: String(order?.order_date || ""),
        assigned: 0,
        acknowledged: 0,
        pendingNames: [],
      };

      current.assigned += 1;
      current.acknowledged += acknowledged ? 1 : 0;
      if (!acknowledged) {
        current.pendingNames.push(
          String(recipient.recipient_name_snapshot || "").trim() ||
            "ไม่ระบุชื่อ",
        );
      }
      orderGroups.set(orderId, current);

      const recipientId =
        String(recipient.profile_id || "").trim() ||
        String(recipient.recipient_name_snapshot || "").trim();
      if (recipientId) {
        const stats = recipientStats.get(recipientId) ?? {
          assigned: 0,
          pending: 0,
        };
        stats.assigned += 1;
        stats.pending += acknowledged ? 0 : 1;
        recipientStats.set(recipientId, stats);
      }
    });

    const orderItems = Array.from(orderGroups.values()).map((order) => {
      const pending = Math.max(order.assigned - order.acknowledged, 0);
      return {
        ...order,
        pending,
        completed: pending === 0,
      };
    });
    const pendingOrderCount = orderItems.filter((order) => !order.completed)
      .length;
    const completedOrderCount = orderItems.filter((order) => order.completed)
      .length;
    const peopleTotal = recipientStats.size;
    const peopleComplete = Array.from(recipientStats.values()).filter(
      (stats) => stats.assigned > 0 && stats.pending === 0,
    ).length;
    const displayOrders = orderItems
      .sort((left, right) => {
        if (left.completed !== right.completed) {
          return left.completed ? 1 : -1;
        }
        return String(right.orderDate || "").localeCompare(
          String(left.orderDate || ""),
        );
      })
      .slice(0, 5);
    const orderSummary = {
      assigned: orderItems.length,
      unacknowledged: pendingOrderCount,
      acknowledged: completedOrderCount,
      peopleTotal,
      peopleComplete,
      peoplePending: Math.max(peopleTotal - peopleComplete, 0),
      items: displayOrders.map((order) => ({
        id: order.id,
        name: order.orderNumber
          ? `คำสั่งที่ ${order.orderNumber}`
          : order.subject || "คำสั่งที่ต้องรับทราบ",
        label: order.orderDate ? thaiDateShort(order.orderDate) : "",
        note: order.completed
          ? "ครบแล้ว"
          : `ค้าง ${order.pending.toLocaleString("th-TH")} คน`,
        initials: "คส",
        assigned: order.assigned,
        acknowledged: order.acknowledged,
        unacknowledged: order.pending,
        pendingNames: order.pendingNames,
      })),
    };

    const highlights = [
      staffSummary.notCheckedIn > 0
        ? {
            tone: "danger",
            title: "บุคลากรยังไม่ลงเวลา",
            value: `${staffSummary.notCheckedIn.toLocaleString("th-TH")} คน`,
            detail: "ไม่รวมผู้ที่ลาและไปราชการ",
          }
        : null,
      studentSummary.totalClasses > studentSummary.checkedClasses
        ? {
            tone: "warning",
            title: "ชั้นเรียนที่ยังไม่เช็กชื่อ",
            value: `${(
              studentSummary.totalClasses - studentSummary.checkedClasses
            ).toLocaleString("th-TH")} ห้อง`,
            detail: "ติดตามการเช็กชื่อประจำวัน",
          }
        : null,
      documentSummary.unacknowledged > 0
        ? {
            tone: "warning",
            title: "หนังสือที่ยังไม่ได้รับทราบ",
            value: `${documentSummary.unacknowledged.toLocaleString("th-TH")} เรื่อง`,
            detail: "ควรติดตามให้เปิดรับทราบ",
          }
        : null,
      orderSummary.unacknowledged > 0
        ? {
            tone: "warning",
            title: "คำสั่งที่ยังไม่รับทราบ",
            value: `${orderSummary.unacknowledged.toLocaleString("th-TH")} เรื่อง`,
            detail: "เปิดทะเบียนคำสั่งเพื่อกดรับทราบ",
          }
        : null,
    ].filter(Boolean);

    return NextResponse.json({
      ok: true,
      date,
      updatedAt: new Date().toISOString(),
      staff: staffSummary,
      students: studentSummary,
      documents: documentSummary,
      orders: orderSummary,
      highlights,
    });
  } catch (error) {
    console.error("Daily dashboard API error:", error);
    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างโหลด Dashboard" },
      { status: 500 },
    );
  }
}
