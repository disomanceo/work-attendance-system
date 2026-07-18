"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import type {
  TrainingReport,
  TrainingReportSourceTask,
} from "@/lib/training-reports/types";
import styles from "./dashboard.module.css";

type PersonPreview = {
  id?: string;
  name: string;
  label?: string;
  note?: string;
  initials: string;
  imageFileId?: string;
  count?: number;
  trainingHours?: number;
  statusCounts?: {
    unacknowledged: number;
    inProgress: number;
    done: number;
  };
};

type ClassSummary = {
  label: string;
  total: number;
  checked: boolean;
  present: number;
  leave: number;
  absent: number;
};

type Highlight = {
  tone: "danger" | "warning" | "success" | string;
  title: string;
  value: string;
  detail: string;
};

type DailyOverview = {
  ok: boolean;
  message?: string;
  date: string;
  updatedAt: string;
  staff: {
    total: number;
    checkedIn: number;
    late: number;
    leave: number;
    officialDuty: number;
    notCheckedIn: number;
    leaveOrDutyPeople: PersonPreview[];
  };
  students: {
    total: number;
    present: number;
    leave: number;
    absent: number;
    checkedClasses: number;
    totalClasses: number;
    classSummaries: ClassSummary[];
  };
  documents: {
    assigned: number;
    acknowledged: number;
    unacknowledged: number;
    inProgress: number;
    pending1Day: number;
    pending2Days: number;
    pending3PlusDays: number;
    done: number;
    overdue: number;
    people: PersonPreview[];
  };
  orders: {
    assigned: number;
    acknowledged: number;
    unacknowledged: number;
    items: PersonPreview[];
  };
  highlights: Highlight[];
};

type TrainingDashboard = {
  topics: number;
  assigned: number;
  pending: number;
  submitted: number;
  hours: number;
  people: PersonPreview[];
};

type TrainingReportsResponse = {
  ok: boolean;
  reports?: TrainingReport[];
};

type TrainingTasksResponse = {
  ok: boolean;
  tasks?: TrainingReportSourceTask[];
};

type DashboardTab = "staff" | "students" | "documents" | "orders" | "training";

function formatThaiDate(value: string) {
  if (!value) return "วันนี้";
  const date = new Date(`${value}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatThaiTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function formatPercent(value: number) {
  if (value === 0) return "-";
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatChartPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function numberText(value: number) {
  if (value === 0) return "-";
  return value.toLocaleString("th-TH");
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

function trainingBookNumber(task: TrainingReportSourceTask) {
  return task.documentNumber || task.registrationNumber || task.bookId || "-";
}

function trainingTopicKey(task: TrainingReportSourceTask) {
  return task.bookId || `${trainingBookNumber(task)}:${task.subject}`;
}

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedDate, setSelectedDate] = useState(todayInputValue);
  const [activeTab, setActiveTab] = useState<DashboardTab>("staff");
  const [accessToken, setAccessToken] = useState("");
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [training, setTraining] = useState<TrainingDashboard>({
    topics: 0,
    assigned: 0,
    pending: 0,
    submitted: 0,
    hours: 0,
    people: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTrainingDashboard = useCallback(async (token: string) => {
    try {
      const [reportsResponse, tasksResponse] = await Promise.all([
        fetch("/api/training-reports", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/training-reports/source-tasks", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const reportsResult = (await reportsResponse.json()) as TrainingReportsResponse;
      const tasksResult = (await tasksResponse.json()) as TrainingTasksResponse;

      if (
        !reportsResponse.ok ||
        !tasksResponse.ok ||
        !reportsResult.ok ||
        !tasksResult.ok
      ) {
        return;
      }

      const reports = reportsResult.reports ?? [];
      const tasks = tasksResult.tasks ?? [];
      const reportByTaskId = new Map<string, TrainingReport>();

      for (const report of reports) {
        if (!report.sourceAssignmentId) continue;
        const current = reportByTaskId.get(report.sourceAssignmentId);
        if (!current || report.updatedAt.localeCompare(current.updatedAt) > 0) {
          reportByTaskId.set(report.sourceAssignmentId, report);
        }
      }

      const topicKeys = new Set(tasks.map(trainingTopicKey));
      const submittedReports = reports.filter((report) => report.status === "submitted");
      const submittedTaskIds = new Set(
        submittedReports.map((report) => report.sourceAssignmentId),
      );
      const peopleMap = new Map<
        string,
        {
          name: string;
          assignedTopics: Set<string>;
          pending: number;
          draft: number;
          submitted: number;
          hours: number;
          imageFileId?: string;
        }
      >();

      for (const task of tasks) {
        const key = task.assigneeId || task.assigneeName;
        if (!key) continue;
        const current =
          peopleMap.get(key) ??
          {
            name: task.assigneeName || "ไม่ระบุชื่อ",
            assignedTopics: new Set<string>(),
            pending: 0,
            draft: 0,
            submitted: 0,
            hours: 0,
            imageFileId: task.assigneeImageFileId,
          };
        current.assignedTopics.add(trainingTopicKey(task));
        if (task.assigneeImageFileId) current.imageFileId = task.assigneeImageFileId;
        const report = reportByTaskId.get(task.taskId);
        if (report?.status === "submitted") {
          current.submitted += 1;
          current.hours += Number(report.hours || 0);
        } else if (report?.status === "draft") {
          current.draft += 1;
        } else if (report?.status !== "not_attended") {
          current.pending += 1;
        }
        peopleMap.set(key, current);
      }

      const people = Array.from(peopleMap.values())
        .map((person) => ({
          name: person.name,
          initials: initials(person.name),
          imageFileId: person.imageFileId,
          trainingHours: person.hours,
          statusCounts: {
            unacknowledged: person.pending,
            inProgress: person.draft,
            done: person.submitted,
          },
          label: `อบรม ${person.assignedTopics.size.toLocaleString(
            "th-TH",
          )} เรื่อง · รายงาน ${person.submitted.toLocaleString(
            "th-TH",
          )} เรื่อง · ${person.hours.toLocaleString("th-TH")} ชม.`,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "th"));

      setTraining({
        topics: topicKeys.size,
        assigned: tasks.length,
        pending: tasks.filter((task) => !submittedTaskIds.has(task.taskId)).length,
        submitted: submittedReports.length,
        hours: submittedReports.reduce(
          (sum, report) => sum + Number(report.hours || 0),
          0,
        ),
        people,
      });
    } catch {
      // Keep the dashboard available even if the optional training summary is unavailable.
    }
  }, []);

  const loadOverview = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        setAccessToken(session.access_token);

        const params = new URLSearchParams({ date: selectedDate });
        const response = await fetch(`/api/dashboard/daily-overview?${params}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });
        const result = (await response.json()) as DailyOverview;

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "โหลดข้อมูล Dashboard ไม่สำเร็จ");
        }

        setOverview(result);
        void loadTrainingDashboard(session.access_token);
      } catch (loadError) {
        console.error("Load daily dashboard error:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "โหลดข้อมูล Dashboard ไม่สำเร็จ",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadTrainingDashboard, router, selectedDate, supabase],
  );

  useEffect(() => {
    void loadOverview("initial");
  }, [loadOverview]);


  const staffPercent = overview
    ? percent(overview.staff.checkedIn, overview.staff.total)
    : 0;
  const studentPercent = overview
    ? percent(overview.students.present, overview.students.total)
    : 0;

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingState}>
          <span className={styles.spinner} />
          <strong>กำลังโหลด Dashboard...</strong>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Dashboard</p>
          <h1>ภาพรวมโรงเรียนวันนี้</h1>
          <div className={styles.metaLine}>
            <span>{formatThaiDate(overview?.date || "")}</span>
            <span>อัปเดตล่าสุด {formatThaiTime(overview?.updatedAt || "")} น.</span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <label className={styles.datePickerButton}>
            <span aria-hidden="true">▣</span>
            <input
              aria-label="เลือกวันที่ Dashboard"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || todayInputValue())}
            />
          </label>

          <button
            type="button"
            className={styles.refreshButton}
            disabled={refreshing}
            onClick={() => void loadOverview("refresh")}
          >
            <span aria-hidden="true">↻</span>
            {refreshing ? "กำลังอัปเดต" : "อัปเดต"}
          </button>
        </div>
      </header>

      {error && <p className={styles.errorMessage}>{error}</p>}

      {overview && (
        <>
          <nav className={styles.sectionTabs} aria-label="เลือกส่วน Dashboard">
            {[
              {
                id: "staff",
                label: "การลงเวลาครู",
                shortLabel: "ครู",
                icon: "◷",
                tone: styles.sectionTabGreen,
              },
              {
                id: "students",
                label: "สถิตินักเรียนวันนี้",
                shortLabel: "นักเรียน",
                icon: "●",
                tone: styles.sectionTabBlue,
              },
              {
                id: "documents",
                label: "หนังสือราชการ",
                shortLabel: "หนังสือ",
                icon: "▣",
                tone: styles.sectionTabPurple,
              },
              {
                id: "orders",
                label: "คำสั่ง",
                shortLabel: "คำสั่ง",
                icon: "!",
                tone: styles.sectionTabOrange,
              },
              {
                id: "training",
                label: "ประชุม/อบรม",
                shortLabel: "อบรม",
                icon: "◇",
                tone: styles.sectionTabCyan,
              },
            ].map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={`${styles.sectionTabButton} ${tab.tone} ${
                  activeTab === tab.id ? styles.sectionTabActive : ""
                }`}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
              >
                <span className={styles.sectionTabIcon} aria-hidden="true">
                  <small>{tab.shortLabel}</small>
                  {tab.icon}
                </span>
                <span className={styles.sectionTabLabel}>{tab.label}</span>
              </button>
            ))}
          </nav>

          <section className={styles.cardGrid} aria-label="ภาพรวมหลัก">
            <article
              className={styles.summaryCard}
              data-active={activeTab === "staff"}
            >
              <CardHeader icon="◷" title="การลงเวลาครู" href="/admin/attendance" />
              <div className={styles.metricGrid}>
                <Metric label="บุคลากรทั้งหมด" value={overview.staff.total} tone="green" suffix="คน" />
                <Metric label="ลงเวลาแล้ว" value={overview.staff.checkedIn} tone="green" suffix="คน" />
                <Metric label="มาสาย" value={overview.staff.late} tone="orange" suffix="ครั้ง" />
                <Metric label="ลา" value={overview.staff.leave} tone="red" suffix="คน" />
                <Metric label="ไปราชการ" value={overview.staff.officialDuty} tone="blue" suffix="คน" />
                <Metric label="ยังไม่ลงเวลา" value={overview.staff.notCheckedIn} tone="gray" suffix="คน" />
              </div>
              <Donut value={staffPercent} label="ลงเวลาแล้ว" />
              <PersonList
                title="ลา / ไปราชการวันนี้"
                emptyText="ไม่มีรายการลา/ไปราชการวันนี้"
                people={overview.staff.leaveOrDutyPeople}
                accessToken={accessToken}
              />
            </article>

            <article
              className={styles.summaryCard}
              data-active={activeTab === "students"}
            >
              <CardHeader icon="●" title="สถิตินักเรียนวันนี้" href="/students/attendance/report" />
              <div className={`${styles.metricGrid} ${styles.metricGridFour}`}>
                <Metric label="มา" value={overview.students.present} tone="green" suffix="คน" />
                <Metric label="ขาด" value={overview.students.absent} tone="red" suffix="คน" />
                <Metric label="ลา" value={overview.students.leave} tone="orange" suffix="คน" />
                <Metric label="ทั้งหมด" value={overview.students.total} tone="blue" suffix="คน" />
              </div>
              <Donut value={studentPercent} label="มาเรียน" />
              <div className={styles.classSummaryHeader}>
                <strong>
                  เช็กชื่อแล้ว {numberText(overview.students.checkedClasses)}/
                  {numberText(overview.students.totalClasses)} ห้อง
                </strong>
              </div>
              <div className={styles.classTable}>
                <div className={`${styles.classRow} ${styles.classHeaderRow}`}>
                  <span>ชั้น</span>
                  <strong className={styles.classPresent}>มา</strong>
                  <strong className={styles.classAbsent}>ขาด</strong>
                  <strong className={styles.classLeave}>ลา</strong>
                  <strong className={styles.classTotal}>ทั้งหมด</strong>
                </div>
                {overview.students.classSummaries.map((item) => (
                  <div className={styles.classRow} key={item.label}>
                    <span>{item.label}</span>
                    <strong className={styles.classPresent}>{numberText(item.present)}</strong>
                    <strong className={styles.classAbsent}>{numberText(item.absent)}</strong>
                    <strong className={styles.classLeave}>{numberText(item.leave)}</strong>
                    <strong className={styles.classTotal}>{numberText(item.total)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article
              className={styles.summaryCard}
              data-active={activeTab === "documents"}
            >
              <CardHeader icon="▣" title="หนังสือราชการ" href="/documents" />
              <div className={`${styles.metricGrid} ${styles.metricGridFour}`}>
                <Metric label="ยังไม่รับทราบ" value={overview.documents.unacknowledged} tone="red" suffix="งาน" />
                <Metric label="กำลังดำเนินการ" value={overview.documents.inProgress} tone="blue" suffix="งาน" />
                <Metric label="เสร็จสิ้น" value={overview.documents.done} tone="green" suffix="งาน" />
                <Metric label="มอบหมายทั้งหมด" value={overview.documents.assigned} tone="gray" suffix="งาน" />
              </div>
              <div className={styles.documentLegend}>
                <span className={styles.legendRed}><i />ยังไม่รับทราบ</span>
                <span className={styles.legendBlue}><i />กำลังดำเนินการ</span>
                <span className={styles.legendGreen}><i />เสร็จสิ้น</span>
              </div>
              <PersonList
                title=""
                emptyText="ไม่มีรายการหนังสือราชการ"
                people={overview.documents.people}
                accessToken={accessToken}
                variant="document"
              />
            </article>

            <article
              className={styles.summaryCard}
              data-active={activeTab === "orders"}
            >
              <CardHeader icon="!" title="คำสั่ง" href="/orders" />
              <div className={`${styles.metricGrid} ${styles.metricGridThree}`}>
                <Metric label="ยังไม่รับทราบ" value={overview.orders.unacknowledged} tone="orange" suffix="เรื่อง" />
                <Metric label="รับทราบแล้ว" value={overview.orders.acknowledged} tone="green" suffix="เรื่อง" />
                <Metric label="แจ้งทั้งหมด" value={overview.orders.assigned} tone="gray" suffix="เรื่อง" />
              </div>
              <OrderStatusDonut counts={overview.orders} />
            </article>

            <article
              className={styles.summaryCard}
              data-active={activeTab === "training"}
            >
              <CardHeader
                icon="◇"
                title="รายการงานประชุม/อบรม"
                href="/documents/training-reports"
              />
              <div className={`${styles.metricGrid} ${styles.metricGridThree}`}>
                <Metric label="เรื่องอบรม" value={training.topics} tone="blue" suffix="เรื่อง" />
                <Metric label="มอบหมาย" value={training.assigned} tone="gray" suffix="คน" />
                <Metric label="รายงานแล้ว" value={training.submitted} tone="green" suffix="เรื่อง" />
              </div>
              <div className={styles.documentLegend}>
                <span className={styles.legendOrange}><i />ยังไม่รายงาน</span>
                <span className={styles.legendBlue}><i />บันทึกร่าง</span>
                <span className={styles.legendGreen}><i />รายงานแล้ว</span>
              </div>
              <PersonList
                title="สรุปครูประชุม/อบรม"
                emptyText="ยังไม่มีรายการประชุม/อบรม"
                people={training.people}
                accessToken={accessToken}
                variant="training"
              />
            </article>
          </section>

          {overview.highlights.length > 0 && (
            <section className={styles.highlights} aria-label="รายการที่ควรทราบวันนี้">
              <h2>รายการที่ควรทราบวันนี้</h2>
              <div className={styles.highlightGrid}>
                {overview.highlights.map((item) => (
                  <article
                    className={`${styles.highlightCard} ${
                      item.tone === "danger" ? styles.highlightDanger : styles.highlightWarning
                    }`}
                    key={item.title}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <span>{item.value}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function CardHeader({
  icon,
  title,
  href,
}: {
  icon: string;
  title: string;
  href: string;
}) {
  const router = useRouter();

  return (
    <div className={styles.cardHeader}>
      <span aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <button type="button" aria-label={`เปิด${title}`} onClick={() => router.push(href)}>
        ›
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: "green" | "orange" | "red" | "blue" | "gray";
}) {
  return (
    <div className={`${styles.metric} ${styles[`metric${tone}`]}`}>
      <small>{label}</small>
      <strong>{numberText(value)}</strong>
      <span>{suffix}</span>
    </div>
  );
}

function Donut({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.donutWrap}>
      <div
        className={styles.donut}
        style={{ "--percent": `${Math.min(Math.max(value, 0), 100)}%` } as CSSProperties}
      >
        <strong>{formatPercent(value)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function OrderStatusDonut({
  counts,
}: {
  counts: DailyOverview["orders"];
}) {
  const total = counts.assigned;
  const orangePercent = percent(counts.unacknowledged, total);
  const greenPercent = percent(counts.acknowledged, total);
  const totalPercent = total > 0 ? 100 : 0;
  const items = [
    {
      label: "ยังไม่รับทราบ",
      count: counts.unacknowledged,
      percent: orangePercent,
      className: styles.orderSliceOrange,
    },
    {
      label: "รับทราบแล้ว",
      count: counts.acknowledged,
      percent: greenPercent,
      className: styles.orderSliceGreen,
    },
    {
      label: "แจ้งทั้งหมด",
      count: total,
      percent: totalPercent,
      className: styles.orderSliceBlack,
    },
  ];

  return (
    <div className={styles.orderDonutPanel}>
      <Donut
        value={greenPercent}
        label="รับทราบ"
      />
      <div className={styles.orderDonutLegend}>
        {items.map((item) => (
          <div className={styles.orderDonutLegendItem} key={item.label}>
            <span className={item.className} aria-hidden="true" />
            <small>{item.label}</small>
            <strong>
              {numberText(item.count)} เรื่อง
              <em>{formatChartPercent(item.percent)}</em>
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonList({
  title,
  emptyText,
  people,
  accessToken,
  variant = "default",
}: {
  title: string;
  emptyText: string;
  people: PersonPreview[];
  accessToken: string;
  variant?: "default" | "document" | "training";
}) {
  return (
    <div className={styles.peopleBlock}>
      {title && <h3>{title}</h3>}
      {people.length === 0 ? (
        <p className={styles.emptyState}>{emptyText}</p>
      ) : (
        <div className={styles.peopleList}>
          {people.map((person, index) => (
            <div className={styles.personRow} key={`${person.name}-${index}`}>
              <ProfileAvatar person={person} accessToken={accessToken} />
              <div>
                <strong>{person.name}</strong>
                {variant === "document" ? (
                  <DocumentStatusLine counts={person.statusCounts} />
                ) : variant === "training" ? (
                  <TrainingStatusLine counts={person.statusCounts} />
                ) : (
                  <small>{person.label || person.note || "รอดำเนินการ"}</small>
                )}
                {variant !== "document" && person.note && (
                  <small className={styles.personDetail}>{person.note}</small>
                )}
              </div>
              {variant === "training" ? (
                <span className={styles.trainingHourBadge}>
                  {numberText(person.trainingHours ?? 0)}
                </span>
              ) : variant !== "document" ? (
                <i />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentStatusLine({
  counts,
}: {
  counts?: {
    unacknowledged: number;
    inProgress: number;
    done: number;
  };
}) {
  const items = [
    {
      label: "ยังไม่รับทราบ",
      value: counts?.unacknowledged ?? 0,
      className: styles.statusBadgeRed,
    },
    {
      label: "กำลังดำเนินการ",
      value: counts?.inProgress ?? 0,
      className: styles.statusBadgeBlue,
    },
    {
      label: "เสร็จสิ้น",
      value: counts?.done ?? 0,
      className: styles.statusBadgeGreen,
    },
  ].filter((item) => item.value > 0);

  if (items.length === 0) {
    return <small>ไม่มีงานที่ได้รับ</small>;
  }

  return (
    <div className={styles.documentStatusLine}>
      {items.map((item) => (
        <span className={item.className} key={item.label}>
          <i />
          {numberText(item.value)}
        </span>
      ))}
    </div>
  );
}

function TrainingStatusLine({
  counts,
}: {
  counts?: {
    unacknowledged: number;
    inProgress: number;
    done: number;
  };
}) {
  const items = [
    {
      label: "ยังไม่รายงาน",
      value: counts?.unacknowledged ?? 0,
      className: styles.statusBadgeOrange,
    },
    {
      label: "บันทึกร่าง",
      value: counts?.inProgress ?? 0,
      className: styles.statusBadgeBlue,
    },
    {
      label: "รายงานแล้ว",
      value: counts?.done ?? 0,
      className: styles.statusBadgeGreen,
    },
  ].filter((item) => item.value > 0);

  if (items.length === 0) {
    return <small>ไม่มีงานค้าง</small>;
  }

  return (
    <div className={styles.documentStatusLine}>
      {items.map((item) => (
        <span className={item.className} key={item.label}>
          <i />
          {numberText(item.value)}
        </span>
      ))}
    </div>
  );
}

function ProfileAvatar({
  person,
  accessToken,
}: {
  person: PersonPreview;
  accessToken: string;
}) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      if (!person.imageFileId) {
        setImageUrl("");
        return;
      }

      const url = await getCachedProfileImageUrl(person.imageFileId, accessToken);
      if (!cancelled) setImageUrl(url);
    }

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [accessToken, person.imageFileId]);

  return (
    <span className={styles.personAvatar}>
      {imageUrl ? (
        <img src={imageUrl} alt="" />
      ) : (
        person.initials || "?"
      )}
    </span>
  );
}
