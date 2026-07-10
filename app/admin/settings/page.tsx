"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";
import AcademicYearSettingsField from "./AcademicYearSettingsField";
import PositionWorkPolicySection from "./PositionWorkPolicySection";
import DocumentNumberSection from "./DocumentNumberSection";
import WorkCalendarSection from "./WorkCalendarSection";
import NotificationSettingsTab from "./NotificationSettingsTab";

type RoleKey = "director" | "teacher" | "staff" | "janitor";

type AttendanceSettings = {
  gps_enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  director_start_time: string;
  director_end_time: string;
  teacher_start_time: string;
  teacher_end_time: string;
  staff_start_time: string;
  staff_end_time: string;
  janitor_start_time: string;
  janitor_end_time: string;
  active_fiscal_year: number | null;
  fiscal_year_start_date: string | null;
  fiscal_year_end_date: string | null;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  settings?: AttendanceSettings;
};

type ResetMode =
  | "attendance_only"
  | "leave_only"
  | "official_duty_only"
  | "memo_only"
  | "full_day";

type ResetItem = {
  id: string;
  label: string;
  detail: string;
};

type ResetSummary = {
  attendanceCount: number;
  leaveCount: number;
  officialDutyCount: number;
  memoCount: number;
  items?: {
    attendance: ResetItem[];
    leave: ResetItem[];
    officialDuty: ResetItem[];
    memo: ResetItem[];
  };
};

const ROLE_ROWS: Array<{
  key: RoleKey;
  title: string;
  description: string;
}> = [
  {
    key: "director",
    title: "เธเธนเนเธเธฃเธดเธซเธฒเธฃ",
    description: "เธเธณเธซเธเธ”เน€เธงเธฅเธฒเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธเธญเธเธเธนเนเธเธฃเธดเธซเธฒเธฃ",
  },
  {
    key: "teacher",
    title: "เธเธฃเธน",
    description: "เธเธณเธซเธเธ”เน€เธงเธฅเธฒเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธเธญเธเธเธฃเธน",
  },
  {
    key: "staff",
    title: "เน€เธเนเธฒเธซเธเนเธฒเธ—เธตเน",
    description: "เธเธณเธซเธเธ”เน€เธงเธฅเธฒเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธเธญเธเน€เธเนเธฒเธซเธเนเธฒเธ—เธตเน",
  },
  {
    key: "janitor",
    title: "เธ เธฒเธฃเนเธฃเธ",
    description: "เธเธณเธซเธเธ”เน€เธงเธฅเธฒเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธเธญเธเธ เธฒเธฃเนเธฃเธ",
  },
];

const DEFAULT_SETTINGS: AttendanceSettings = {
  gps_enabled: true,
  latitude: null,
  longitude: null,
  allowed_radius_meters: 200,
  director_start_time: "07:50",
  director_end_time: "16:30",
  teacher_start_time: "07:50",
  teacher_end_time: "16:30",
  staff_start_time: "07:50",
  staff_end_time: "16:30",
  janitor_start_time: "06:00",
  janitor_end_time: "18:00",
  active_fiscal_year: null,
  fiscal_year_start_date: null,
  fiscal_year_end_date: null,
};

const RESET_MODE_OPTIONS: Array<{
  value: ResetMode;
  title: string;
  description: string;
}> = [
  {
    value: "attendance_only",
    title: "เธฃเธตเน€เธเนเธ•เน€เธเธเธฒเธฐเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒ",
    description: "เธฅเธเน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเน€เธเนเธเธญเธดเธ/เน€เธเนเธเน€เธญเธฒเธ—เนเธเธญเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธ",
  },
  {
    value: "leave_only",
    title: "เธฃเธตเน€เธเนเธ•เธเธฒเธฃเธฅเธฒ",
    description: "เธฅเธเนเธเธฅเธฒเธ—เธตเนเธเธฃเธญเธเธเธฅเธธเธกเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธ เธเธฃเนเธญเธกเน€เธเธฅเธตเธขเธฃเนเน€เธฅเธเน€เธญเธเธชเธฒเธฃ",
  },
  {
    value: "official_duty_only",
    title: "เธฃเธตเน€เธเนเธ•เธเธฒเธฃเนเธเธฃเธฒเธเธเธฒเธฃ",
    description: "เธฅเธเนเธเนเธเธฃเธฒเธเธเธฒเธฃเธ—เธตเนเธเธฃเธญเธเธเธฅเธธเธกเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธเนเธฅเธฐเธฃเธฒเธขเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเนเธเธฃเธฒเธเธเธฒเธฃ",
  },
  {
    value: "memo_only",
    title: "เธฃเธตเน€เธเนเธ•เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก",
    description: "เธฅเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเธ—เธตเนเธขเธทเนเธเนเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธ เธเธฃเนเธญเธกเนเธเธฅเนเนเธเธเนเธเธฃเธฐเธเธ",
  },
  {
    value: "full_day",
    title: "เธฃเธตเน€เธเนเธ•เธ—เธฑเนเธเธงเธฑเธ",
    description: "เธฅเธเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒ เนเธเธฅเธฒ เนเธเธฃเธฒเธเธเธฒเธฃ เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก เนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธตเนเน€เธเธตเนเธขเธงเธเนเธญเธ",
  },
];

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function getResetTotal(summary: ResetSummary | null, mode: ResetMode) {
  if (!summary) return 0;
  if (mode === "attendance_only") return summary.attendanceCount;
  if (mode === "leave_only") return summary.leaveCount;
  if (mode === "official_duty_only") return summary.officialDutyCount;
  if (mode === "memo_only") return summary.memoCount;

  return (
    summary.attendanceCount +
    summary.leaveCount +
    summary.officialDutyCount +
    summary.memoCount
  );
}

function getResetModeTitle(mode: ResetMode) {
  return (
    RESET_MODE_OPTIONS.find((option) => option.value === mode)?.title ||
    "เธฃเธตเน€เธเนเธ•เธเนเธญเธกเธนเธฅ"
  );
}

function getPreviewItems(summary: ResetSummary | null, mode: ResetMode) {
  if (!summary?.items) return [];
  if (mode === "attendance_only") return summary.items.attendance;
  if (mode === "leave_only") return summary.items.leave;
  if (mode === "official_duty_only") return summary.items.officialDuty;
  if (mode === "memo_only") return summary.items.memo;

  return [
    ...summary.items.attendance,
    ...summary.items.leave,
    ...summary.items.officialDuty,
    ...summary.items.memo,
  ];
}

export default function DirectorSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activeSettingsTab, setActiveSettingsTab] =
    useState<"system" | "notifications">("system");
  const [settings, setSettings] =
    useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");
  const [resetDate, setResetDate] = useState("");
  const [resetMode, setResetMode] =
    useState<ResetMode>("attendance_only");
  const [resetSummary, setResetSummary] =
    useState<ResetSummary | null>(null);
  const [checkingReset, setCheckingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        const response = await fetch(
          "/api/admin/attendance-settings",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }
        );

        const result = (await response.json()) as ApiResponse;

        if (!response.ok || !result.ok || !result.settings) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }

          if (response.status === 403) {
            router.replace("/attendance");
            return;
          }

          throw new Error(
            result.message || "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เนเธซเธฅเธ”เธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเนเธ”เน"
          );
        }

        setSettings({
          ...result.settings,
          director_start_time: normalizeTime(
            result.settings.director_start_time
          ),
          director_end_time: normalizeTime(
            result.settings.director_end_time
          ),
          teacher_start_time: normalizeTime(
            result.settings.teacher_start_time
          ),
          teacher_end_time: normalizeTime(
            result.settings.teacher_end_time
          ),
          staff_start_time: normalizeTime(
            result.settings.staff_start_time
          ),
          staff_end_time: normalizeTime(
            result.settings.staff_end_time
          ),
          janitor_start_time: normalizeTime(
            result.settings.janitor_start_time
          ),
          janitor_end_time: normalizeTime(
            result.settings.janitor_end_time
          ),
        });
      } catch (error) {
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เนเธซเธฅเธ”เธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเนเธ”เน"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, [router, supabase]);

  function updateTime(
    role: RoleKey,
    type: "start" | "end",
    value: string
  ) {
    const key = `${role}_${type}_time` as keyof AttendanceSettings;

    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function useCurrentLocation() {
    setMessage("");

    if (!navigator.geolocation) {
      setMessageType("error");
      setMessage("เธญเธธเธเธเธฃเธ“เนเธเธตเนเนเธกเนเธฃเธญเธเธฃเธฑเธเธเธฒเธฃเธฃเธฐเธเธธเธ•เธณเนเธซเธเนเธ");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        }));

        setMessageType("success");
        setMessage("เธเธณเธเธดเธเธฑเธ”เธเธฑเธเธเธธเธเธฑเธเธกเธฒเนเธชเนเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง");
        setLocating(false);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "เธเธฃเธธเธ“เธฒเธญเธเธธเธเธฒเธ•เนเธซเนเน€เธงเนเธเนเธเธ•เนเน€เธเนเธฒเธ–เธถเธเธ•เธณเนเธซเธเนเธ",
          2: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ•เธฃเธงเธเธซเธฒเธ•เธณเนเธซเธเนเธเธเธฑเธเธเธธเธเธฑเธเนเธ”เน",
          3: "เธ•เธฃเธงเธเธซเธฒเธ•เธณเนเธซเธเนเธเธเธฒเธเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน",
        };

        setMessageType("error");
        setMessage(
          messages[error.code] ||
            "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ•เธฃเธงเธเธซเธฒเธ•เธณเนเธซเธเนเธเธเธฑเธเธเธธเธเธฑเธเนเธ”เน"
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function checkResetDate() {
    if (!resetDate) {
      setMessageType("error");
      setMessage("เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธงเธฑเธเธ—เธตเนเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•");
      return;
    }

    setCheckingReset(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        `/api/admin/attendance-reset?date=${encodeURIComponent(
          resetDate
        )}&mode=${encodeURIComponent(
          resetMode
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok: boolean;
        count?: number;
        attendanceCount?: number;
        leaveCount?: number;
        officialDutyCount?: number;
        memoCount?: number;
        items?: ResetSummary["items"];
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅเนเธ”เน"
        );
      }

      const summary = {
        attendanceCount: result.attendanceCount ?? result.count ?? 0,
        leaveCount: result.leaveCount ?? 0,
        officialDutyCount: result.officialDutyCount ?? 0,
        memoCount: result.memoCount ?? 0,
        items: result.items,
      };
      const total = getResetTotal(summary, resetMode);

      setResetSummary(summary);

      if (total === 0) {
        setMessageType("error");
        setMessage("เนเธกเนเธเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธ•เนเธญเธเธฃเธตเน€เธเนเธ•เนเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธ");
        return;
      }

      setResetConfirmation("");
      setShowResetConfirm(true);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅเนเธ”เน"
      );
    } finally {
      setCheckingReset(false);
    }
  }

  async function confirmResetHistory() {
    if (resetConfirmation.trim() !== "เธขเธทเธเธขเธฑเธ") {
      setMessageType("error");
      setMessage('เธเธฃเธธเธ“เธฒเธเธดเธกเธเนเธเธณเธงเนเธฒ "เธขเธทเธเธขเธฑเธ" เนเธซเนเธ•เธฃเธ');
      return;
    }

    setResetting(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/attendance-reset",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: resetDate,
            confirmation: resetConfirmation,
            mode: resetMode,
          }),
        }
      );

      const result = (await response.json()) as {
        ok: boolean;
        deletedCount?: number;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธตเน€เธเนเธ•เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเนเธ”เน"
        );
      }

      setMessageType("success");
      setMessage(
        result.message ||
          "เธฃเธตเน€เธเนเธ•เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง"
      );
      setResetSummary(null);
      setResetConfirmation("");
      setShowResetConfirm(false);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธตเน€เธเนเธ•เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเนเธ”เน"
      );
    } finally {
      setResetting(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/attendance-settings",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธฑเธเธ—เธถเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเนเธ”เน"
        );
      }

      setMessageType("success");
      setMessage(
        result.message || "เธเธฑเธเธ—เธถเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง"
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธฑเธเธ—เธถเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเนเธ”เน"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเธฒเธฃเธ•เธฑเนเธเธเนเธฒ...
      </main>
    );
  }

  const gpsSummary = settings.gps_enabled
    ? `เน€เธเธดเธ”เนเธเนเธเธฒเธ / ${settings.allowed_radius_meters} เน€เธกเธ•เธฃ`
    : "เธเธดเธ”เนเธเนเธเธฒเธ";
  const coordinateSummary =
    settings.latitude !== null && settings.longitude !== null
      ? `${settings.latitude}, ${settings.longitude}`
      : "เธขเธฑเธเนเธกเนเนเธ”เนเธเธณเธซเธเธ”เธเธดเธเธฑเธ”";
  const fiscalSummary = settings.active_fiscal_year
    ? `เธ.เธจ. ${settings.active_fiscal_year}`
    : "เธขเธฑเธเนเธกเนเนเธ”เนเธเธณเธซเธเธ”";
  const fiscalRangeSummary =
    settings.fiscal_year_start_date && settings.fiscal_year_end_date
      ? `${settings.fiscal_year_start_date} - ${settings.fiscal_year_end_date}`
      : "เธขเธฑเธเนเธกเนเนเธ”เนเธเธณเธซเธเธ”เธเนเธงเธเธงเธฑเธเธ—เธตเน";
  const resetTotal = getResetTotal(resetSummary, resetMode);
  const resetPreviewItems = getPreviewItems(resetSummary, resetMode);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>SYSTEM SETTINGS</span>
          <h1>เธ•เธฑเนเธเธเนเธฒเธฃเธฐเธเธ</h1>
          <p>
            เธเธฑเธ”เธเธฅเธธเนเธกเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเธ—เธตเนเธเธณเน€เธเนเธเธเธญเธเธฃเธฐเธเธเธฅเธเน€เธงเธฅเธฒ
            เธชเธดเธ—เธเธดเนเธเธฒเธฃเธฅเธฒ เน€เธฅเธเน€เธญเธเธชเธฒเธฃ เนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธตเนเธกเธตเธเธฅเธเธฑเธเธฃเธฒเธขเธเธฒเธ
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/attendance")}
        >
          เธเธฅเธฑเธเธซเธเนเธฒเธฅเธเน€เธงเธฅเธฒ
        </button>
      </header>

      {message && (
        <div
          role="status"
          className={
            messageType === "success"
              ? `${styles.centerNotice} ${styles.centerNoticeSuccess}`
              : `${styles.centerNotice} ${styles.centerNoticeError}`
          }
        >
          <strong>
            {messageType === "success" ? "เธ”เธณเน€เธเธดเธเธเธฒเธฃเธชเธณเน€เธฃเนเธ" : "เนเธกเนเธชเธณเน€เธฃเนเธ"}
          </strong>
          {message}
        </div>
      )}

      <div
        aria-label="หมวดการตั้งค่า"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 18,
          padding: 6,
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          background: "#ffffff",
          width: "fit-content",
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          aria-pressed={activeSettingsTab === "system"}
          onClick={() => setActiveSettingsTab("system")}
          style={{
            minHeight: 42,
            border: 0,
            borderRadius: 11,
            padding: "0 18px",
            background:
              activeSettingsTab === "system" ? "#0f766e" : "transparent",
            color:
              activeSettingsTab === "system" ? "#ffffff" : "#334155",
            fontWeight: 750,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          ตั้งค่าระบบ
        </button>

        <button
          type="button"
          aria-pressed={activeSettingsTab === "notifications"}
          onClick={() => setActiveSettingsTab("notifications")}
          style={{
            minHeight: 42,
            border: 0,
            borderRadius: 11,
            padding: "0 18px",
            background:
              activeSettingsTab === "notifications"
                ? "#0f766e"
                : "transparent",
            color:
              activeSettingsTab === "notifications"
                ? "#ffffff"
                : "#334155",
            fontWeight: 750,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          ตั้งค่าการแจ้งเตือน
        </button>
      </div>

      {activeSettingsTab === "notifications" && (
        <NotificationSettingsTab />
      )}
      <div hidden={activeSettingsTab !== "system"} className={styles.settingsWorkspace}>
        <div className={styles.primaryColumn}>
          <form className={styles.settingsGrid} onSubmit={saveSettings}>
            <section className={`${styles.card} ${styles.gpsCard}`}>
              <div className={styles.cardHeading}>
                <div>
                  <span className={styles.cardIcon}>โ–</span>
                  <h2>เธ•เธณเนเธซเธเนเธเนเธฅเธฐ GPS</h2>
                  <p>
                    เน€เธเธดเธ”เน€เธเธทเนเธญเธ•เธฃเธงเธเธฃเธฐเธขเธฐเธซเนเธฒเธเธเธฒเธเธเธดเธเธฑเธ”เนเธฃเธเน€เธฃเธตเธขเธเธเนเธญเธเธเธฑเธเธ—เธถเธเน€เธงเธฅเธฒ
                  </p>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.gps_enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        gps_enabled: event.target.checked,
                      }))
                    }
                  />
                  <span />
                </label>
              </div>

              <div
                className={`${styles.gpsSettings} ${
                  !settings.gps_enabled ? styles.disabled : ""
                }`}
              >
                <div className={styles.locationHeading}>
                  <div>
                    <h3>เธเธดเธเธฑเธ”เธชเธ–เธฒเธเธ—เธตเนเธฅเธเน€เธงเธฅเธฒ</h3>
                    <p>
                      เธชเธฒเธกเธฒเธฃเธ–เธเธดเธกเธเนเธเธดเธเธฑเธ”เน€เธญเธเธซเธฃเธทเธญเนเธเนเธ•เธณเนเธซเธเนเธเธเธฑเธเธเธธเธเธฑเธเธเธญเธเธญเธธเธเธเธฃเธ“เน
                    </p>
                  </div>

                  <button
                    type="button"
                    className={styles.locationButton}
                    disabled={!settings.gps_enabled || locating}
                    onClick={useCurrentLocation}
                  >
                    {locating
                      ? "เธเธณเธฅเธฑเธเธเนเธเธซเธฒเธเธดเธเธฑเธ”..."
                      : "เนเธเนเธ•เธณเนเธซเธเนเธเธเธฑเธเธเธธเธเธฑเธ"}
                  </button>
                </div>

                <div className={styles.coordinateGrid}>
                  <label>
                    <span>เธฅเธฐเธ•เธดเธเธนเธ”</span>
                    <input
                      type="number"
                      step="0.0000001"
                      min="-90"
                      max="90"
                      disabled={!settings.gps_enabled}
                      value={settings.latitude ?? ""}
                      placeholder="เน€เธเนเธ 14.3971234"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          latitude:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>เธฅเธญเธเธเธดเธเธนเธ”</span>
                    <input
                      type="number"
                      step="0.0000001"
                      min="-180"
                      max="180"
                      disabled={!settings.gps_enabled}
                      value={settings.longitude ?? ""}
                      placeholder="เน€เธเนเธ 100.1612345"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          longitude:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>เธฃเธฐเธขเธฐเธ—เธตเนเธญเธเธธเธเธฒเธ•</span>
                    <div className={styles.radiusInput}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={!settings.gps_enabled}
                        value={settings.allowed_radius_meters}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            allowed_radius_meters: Number(
                              event.target.value
                            ),
                          }))
                        }
                      />
                      <b>เน€เธกเธ•เธฃ</b>
                    </div>
                  </label>
                </div>
              </div>
            </section>
            <WorkCalendarSection />


            <PositionWorkPolicySection
              roles={ROLE_ROWS}
              getStartTime={(role) =>
                String(
                  settings[
                    `${role}_start_time` as keyof AttendanceSettings
                  ]
                )
              }
              getEndTime={(role) =>
                String(
                  settings[
                    `${role}_end_time` as keyof AttendanceSettings
                  ]
                )
              }
              onTimeChange={updateTime}
            />

        <section className={`${styles.card} ${styles.fiscalCard}`} id="fiscal-year-settings">
          <div className={styles.sectionHeading}>
            <span className={styles.cardIcon}>โ—ท</span>
            <h2>เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“เธญเนเธฒเธเธญเธดเธ</h2>
            <p>
              เธเธณเธซเธเธ”เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“เธ—เธตเนเนเธเนเธเธฑเธเธฃเธฐเธเธเธฅเธฒ เธเธณเธเธงเธเธเธฃเธฑเนเธเธฅเธฒ
              เธฃเธฒเธขเธเธฒเธ เนเธฅเธฐเธเนเธญเธกเธนเธฅเน€เธเธทเนเธญเธเธฒเธฃเธเธฃเธฐเน€เธกเธดเธ
            </p>
          </div>

          <div className={styles.timeGrid}>
            <label>
              <span>เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“ (เธ.เธจ.)</span>
              <input
                type="number"
                min="2500"
                max="2700"
                required
                value={settings.active_fiscal_year ?? ""}
                placeholder="เน€เธเนเธ 2570"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    active_fiscal_year:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              <span>เธงเธฑเธเธ—เธตเนเน€เธฃเธดเนเธกเธเธตเธเธเธเธฃเธฐเธกเธฒเธ“</span>
              <input
                type="date"
                required
                value={settings.fiscal_year_start_date ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    fiscal_year_start_date:
                      event.target.value || null,
                  }))
                }
              />
            </label>

            <label>
              <span>เธงเธฑเธเธ—เธตเนเธชเธดเนเธเธชเธธเธ”เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“</span>
              <input
                type="date"
                required
                min={settings.fiscal_year_start_date ?? undefined}
                value={settings.fiscal_year_end_date ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    fiscal_year_end_date:
                      event.target.value || null,
                  }))
                }
              />
            </label>
          </div>

          <AcademicYearSettingsField />

          <p>
            เธฃเธฐเธเธเน€เธเนเธเธเธตเธเธเธเธฃเธฐเธกเธฒเธ“เน€เธเนเธ เธ.เธจ. เนเธ”เธขเธ•เธฃเธ
            เธเธถเธเนเธกเนเธเธงเธ 543 เธเนเธณเธญเธตเธ
          </p>
        </section>

        <section className={`${styles.card} ${styles.dangerCard}`}>
          <div className={styles.sectionHeading}>
            <span className={styles.dangerEyebrow}>
              DANGER ZONE
            </span>
            <h2>เธฃเธตเน€เธเนเธ•เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒ</h2>
            <p>
              เนเธเนเน€เธกเธทเนเธญเธ•เนเธญเธเธเธฒเธฃเธฅเนเธฒเธเธเนเธญเธกเธนเธฅเธเธญเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธ
              เน€เธฅเธทเธญเธเนเธ”เนเธงเนเธฒเธเธฐเธฃเธตเน€เธเนเธ•เน€เธเธเธฒเธฐเธฅเธเน€เธงเธฅเธฒ เธซเธฃเธทเธญเน€เธเธฅเธตเธขเธฃเนเธ—เธฑเนเธเธงเธฑเธเธเธฃเนเธญเธกเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเน€เธเธตเนเธขเธงเธเนเธญเธ
            </p>
          </div>

          <div className={styles.resetModeGroup}>
            {RESET_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={
                  resetMode === option.value
                    ? styles.resetModeActive
                    : ""
                }
              >
                <input
                  type="radio"
                  name="resetMode"
                  value={option.value}
                  checked={resetMode === option.value}
                  onChange={() => {
                    setResetMode(option.value);
                    setResetSummary(null);
                    setShowResetConfirm(false);
                  }}
                />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>

          <div className={styles.resetRow}>
            <label>
              <span>เธงเธฑเธเธ—เธตเนเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•</span>
              <input
                type="date"
                value={resetDate}
                onChange={(event) => {
                  setResetDate(event.target.value);
                  setResetSummary(null);
                  setShowResetConfirm(false);
                }}
              />
            </label>

            <button
              type="button"
              className={styles.resetCheckButton}
              disabled={checkingReset || !resetDate}
              onClick={() => void checkResetDate()}
            >
              {checkingReset
                ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธ..."
                : "เธ•เธฃเธงเธเธชเธญเธเนเธฅเธฐเธฃเธตเน€เธเนเธ•"}
            </button>
          </div>

          {resetSummary !== null && (
            <div className={styles.resetSummary}>
              <strong>เธเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธเธฐเธฃเธตเน€เธเนเธ• {resetTotal} เธฃเธฒเธขเธเธฒเธฃ</strong>
              <span>เธฅเธเน€เธงเธฅเธฒ {resetSummary.attendanceCount} เธฃเธฒเธขเธเธฒเธฃ</span>
              <span>เนเธเธฅเธฒ {resetSummary.leaveCount} เธฃเธฒเธขเธเธฒเธฃ</span>
              <span>เนเธเธฃเธฒเธเธเธฒเธฃ {resetSummary.officialDutyCount} เธฃเธฒเธขเธเธฒเธฃ</span>
              <span>เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก {resetSummary.memoCount} เธฃเธฒเธขเธเธฒเธฃ</span>
              {resetPreviewItems.length > 0 && (
                <div className={styles.resetPreviewList}>
                  {resetPreviewItems.slice(0, 8).map((item) => (
                    <span key={item.id}>
                      {item.label}: {item.detail}
                    </span>
                  ))}
                  {resetPreviewItems.length > 8 && (
                    <span>เนเธฅเธฐเธญเธตเธ {resetPreviewItems.length - 8} เธฃเธฒเธขเธเธฒเธฃ</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {showResetConfirm && (
          <div className={styles.confirmOverlay}>
            <section
              className={styles.confirmModal}
              role="dialog"
              aria-modal="true"
            >
              <span className={styles.warningIcon}>!</span>

              <h2>เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•เธเนเธญเธกเธนเธฅ</h2>

              <p>
                เธฃเธฐเธเธเธเธฐเธฃเธตเน€เธเนเธ•เธเนเธญเธกเธนเธฅเธงเธฑเธเธ—เธตเน <strong>{resetDate}</strong>{" "}
                เนเธเธ{" "}
                <strong>
                  {getResetModeTitle(resetMode)}
                </strong>{" "}
                เธเธณเธเธงเธ <strong>{resetTotal}</strong> เธฃเธฒเธขเธเธฒเธฃ
              </p>

              {resetSummary && (
                <div className={styles.confirmSummary}>
                  <span>เธฅเธเน€เธงเธฅเธฒ {resetSummary.attendanceCount} เธฃเธฒเธขเธเธฒเธฃ</span>
                  <span>เนเธเธฅเธฒ {resetSummary.leaveCount} เธฃเธฒเธขเธเธฒเธฃ</span>
                  <span>เนเธเธฃเธฒเธเธเธฒเธฃ {resetSummary.officialDutyCount} เธฃเธฒเธขเธเธฒเธฃ</span>
                  <span>เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก {resetSummary.memoCount} เธฃเธฒเธขเธเธฒเธฃ</span>
                  {resetPreviewItems.slice(0, 8).map((item) => (
                    <span key={item.id}>
                      {item.label}: {item.detail}
                    </span>
                  ))}
                  {resetPreviewItems.length > 8 && (
                    <span>เนเธฅเธฐเธญเธตเธ {resetPreviewItems.length - 8} เธฃเธฒเธขเธเธฒเธฃ</span>
                  )}
                </div>
              )}

              <p className={styles.warningText}>
                เธเธฒเธฃเธ”เธณเน€เธเธดเธเธเธฒเธฃเธเธตเนเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธญเธเธเธฅเธฑเธเนเธ”เน
              </p>

              <label>
                <span>
                  เธเธดเธกเธเนเธเธณเธงเนเธฒ <b>เธขเธทเธเธขเธฑเธ</b> เน€เธเธทเนเธญเธขเธทเธเธขเธฑเธ
                </span>
                <input
                  type="text"
                  value={resetConfirmation}
                  placeholder="เธขเธทเธเธขเธฑเธ"
                  onChange={(event) =>
                    setResetConfirmation(event.target.value)
                  }
                />
              </label>

              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelResetButton}
                  disabled={resetting}
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetConfirmation("");
                  }}
                >
                  เธขเธเน€เธฅเธดเธ
                </button>

                <button
                  type="button"
                  className={styles.confirmResetButton}
                  disabled={
                    resetting ||
                    resetConfirmation.trim() !== "เธขเธทเธเธขเธฑเธ"
                  }
                  onClick={() =>
                    void confirmResetHistory()
                  }
                >
                  {resetting
                    ? "เธเธณเธฅเธฑเธเธฃเธตเน€เธเนเธ•..."
                    : "เธขเธทเธเธขเธฑเธเธฃเธตเน€เธเนเธ•เธเนเธญเธกเธนเธฅ"}
                </button>
              </div>
            </section>
          </div>
        )}

        <div className={styles.saveBar}>
          <div>
            <strong>เธเธฑเธเธ—เธถเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเธฃเธงเธก</strong>
            <p>
              เนเธเนเธเธฑเธเธ•เธณเนเธซเธเนเธ GPS เน€เธงเธฅเธฒเธ—เธณเธเธฒเธ เนเธฅเธฐเธเธตเธเธเธเธฃเธฐเธกเธฒเธ“
              เธชเนเธงเธเธชเธดเธ—เธเธดเนเธ•เธฒเธกเธ•เธณเนเธซเธเนเธเธเธฑเธเน€เธฅเธเน€เธญเธเธชเธฒเธฃเธกเธตเธเธธเนเธกเธเธฑเธเธ—เธถเธเนเธขเธ
            </p>
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ..." : "เธเธฑเธเธ—เธถเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเธฃเธงเธก"}
          </button>
        </div>
          </form>

          <DocumentNumberSection />
        </div>

        <aside className={styles.overviewPanel}>
          <div className={styles.overviewHeader}>
            <span>เธ เธฒเธเธฃเธงเธก</span>
            <h2>เธชเธ–เธฒเธเธฐเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒ</h2>
          </div>

          <div className={styles.overviewList}>
            <div>
              <span>GPS</span>
              <strong>{gpsSummary}</strong>
              <small>{coordinateSummary}</small>
            </div>

            <div>
              <span>เน€เธงเธฅเธฒเธเธฃเธน</span>
              <strong>
                {settings.teacher_start_time} - {settings.teacher_end_time}
              </strong>
              <small>เนเธเนเธ•เธฃเธงเธเธเธฒเธฃเธกเธฒเธชเธฒเธขเนเธฅเธฐเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒ</small>
            </div>

            <div>
              <span>เน€เธงเธฅเธฒเธ เธฒเธฃเนเธฃเธ</span>
              <strong>
                {settings.janitor_start_time} - {settings.janitor_end_time}
              </strong>
              <small>เธเธณเธซเธเธ”เนเธขเธเธเธฒเธเธเธฃเธนเนเธฅเธฐเน€เธเนเธฒเธซเธเนเธฒเธ—เธตเน</small>
            </div>

            <div>
              <span>เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“</span>
              <strong>{fiscalSummary}</strong>
              <small>{fiscalRangeSummary}</small>
            </div>

            <div>
              <span>เธเธฒเธฃเธเธฑเธเธ—เธถเธเนเธขเธ</span>
              <strong>เธชเธดเธ—เธเธดเนเธ•เธฒเธกเธ•เธณเนเธซเธเนเธ / เน€เธฅเธเน€เธญเธเธชเธฒเธฃ</strong>
              <small>เธกเธตเธเธธเนเธกเธเธฑเธเธ—เธถเธเธเธญเธเนเธ•เนเธฅเธฐเธซเธกเธงเธ”</small>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

