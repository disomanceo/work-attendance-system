"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import styles from "./dashboard.module.css";

type PersonPreview = {
  id?: string;
  name: string;
  label?: string;
  note?: string;
  initials: string;
  imageFileId?: string;
  count?: number;
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
  highlights: Highlight[];
};

type DashboardTab = "staff" | "students" | "documents";

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
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function numberText(value: number) {
  return value.toLocaleString("th-TH");
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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
    [router, selectedDate, supabase],
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
              { id: "staff", label: "การลงเวลาครู" },
              { id: "students", label: "สถิตินักเรียนวันนี้" },
              { id: "documents", label: "หนังสือราชการ" },
            ].map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeTab === tab.id ? styles.sectionTabActive : ""}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
              >
                {tab.label}
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
  variant?: "default" | "document";
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
                ) : (
                  <small>{person.label || person.note || "รอดำเนินการ"}</small>
                )}
                {variant !== "document" && person.note && (
                  <small className={styles.personDetail}>{person.note}</small>
                )}
              </div>
              {variant !== "document" && (
                <i />
              )}
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
