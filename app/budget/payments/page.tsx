"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  mapAndSortBudgetProjects,
  sortBudgetProjects,
} from "@/lib/budget/project-list";
import type { BudgetProjectListItem } from "@/lib/budget/types";
import {
  effectiveProjectBudget,
  effectiveProjectRemaining,
  effectiveProjectSpent,
} from "@/lib/budget/project-financials";

type RequesterOption = {
  id: string;
  fullName: string;
  role: string;
  position: string;
  permissions: string[];
};

type Payment = {
  id: string;
  project_id: string;
  activity_id: string | null;
  activity_name: string | null;
  details: string;
  payment_period: string | null;
  amount: number;
  evidence_name: string | null;
  evidence_url: string | null;
  note: string | null;
  status: "active" | "cancelled";
  created_at: string;
  requester_id: string | null;
  requester_name: string;
  created_by_name: string;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
};

type CurrentUser = {
  id: string;
  fullName: string;
  role: string;
  canFinance: boolean;
  canManageAll: boolean;
};

type ProjectApiResponse = {
  ok?: boolean;
  projects?: unknown[];
  message?: string;
};

type PaymentsApiResponse = {
  ok?: boolean;
  payments?: Payment[];
  currentUser?: CurrentUser;
  requesterOptions?: RequesterOption[];
  payment?: Payment;
  autoCompletedProject?: boolean;
  projectStatus?: string | null;
  message?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function thaiDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function isProjectCompleted(project: BudgetProjectListItem) {
  return project.status === "เสร็จสิ้น";
}

function requesterDutyLabel(person: RequesterOption) {
  const labels: string[] = [];

  if (person.permissions.includes("budget.finance")) {
    labels.push("เจ้าหน้าที่การเงิน");
  }

  if (person.permissions.includes("budget.procurement")) {
    labels.push("เจ้าหน้าที่พัสดุ");
  }

  if (person.permissions.includes("budget.requester")) {
    labels.push("ผู้เบิกจ่าย");
  }

  if (person.role === "director") {
    labels.push("ผู้บริหาร");
  } else if (person.role === "admin") {
    labels.push("ผู้ดูแลระบบ");
  }

  return [...new Set(labels)].join(" / ") || person.position || "ผู้ใช้งาน";
}


const BUDGET_PROJECTS_CACHE_KEY = "budget-projects-api-cache-v3";
const BUDGET_PAYMENTS_CACHE_KEY = "budget-payments-page-cache-v3";
const BUDGET_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

type TimedCache<T> = {
  savedAt: number;
  value: T;
};

function readTimedCache<T>(key: string): TimedCache<T> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TimedCache<T>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > BUDGET_CACHE_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function writeTimedCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    const payload: TimedCache<T> = {
      savedAt: Date.now(),
      value,
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

export default function BudgetPaymentsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [projects, setProjects] = useState<BudgetProjectListItem[]>([]);
  const [activeRecordType, setActiveRecordType] =
    useState<"project" | "free_education">("project");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [requesterOptions, setRequesterOptions] = useState<RequesterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortMode, setSortMode] = useState("code");
  const [expandedProjectId, setExpandedProjectId] = useState("");
  const [payingProject, setPayingProject] = useState<BudgetProjectListItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState("");
  const [paymentPeriod, setPaymentPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [requesterId, setRequesterId] = useState("");
  const [activityId, setActivityId] = useState("");
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }

  async function loadData(options?: { background?: boolean }) {
    const background = options?.background === true;

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setMessage("");
    }

    try {
      const accessToken = await getAccessToken();

      const [paymentsResponse, projectsResponse] = await Promise.all([
        fetch("/api/budget/payments", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
        fetch("/api/budget/projects", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
      ]);

      const [paymentsResult, projectsResult] = (await Promise.all([
        paymentsResponse.json(),
        projectsResponse.json(),
      ])) as [PaymentsApiResponse, ProjectApiResponse];

      if (
        !projectsResponse.ok ||
        projectsResult.ok === false ||
        !Array.isArray(projectsResult.projects)
      ) {
        throw new Error(
          projectsResult.message || "ไม่สามารถโหลดข้อมูลโครงการจาก Supabase ได้"
        );
      }

      if (!paymentsResponse.ok || !paymentsResult.ok) {
        throw new Error(
          paymentsResult.message || "ไม่สามารถโหลดประวัติการจ่ายได้"
        );
      }

      const mappedProjects = mapAndSortBudgetProjects(
        projectsResult.projects ?? [],
      );

      const paymentsValue = paymentsResult.payments ?? [];
      const currentUserValue = paymentsResult.currentUser ?? null;
      const requesterOptionsValue = paymentsResult.requesterOptions ?? [];

      setProjects(mappedProjects);
      setPayments(paymentsValue);
      setCurrentUser(currentUserValue);
      setRequesterOptions(requesterOptionsValue);

      writeTimedCache(BUDGET_PROJECTS_CACHE_KEY, projectsResult.projects ?? []);
      writeTimedCache(BUDGET_PAYMENTS_CACHE_KEY, {
        payments: paymentsValue,
        currentUser: currentUserValue,
        requesterOptions: requesterOptionsValue,
      });
    } catch (error) {
      if (!background) {
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล"
        );
      }
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const cachedProjects = readTimedCache<unknown[]>(
      BUDGET_PROJECTS_CACHE_KEY
    );
    const cachedPayments = readTimedCache<{
      payments: Payment[];
      currentUser: CurrentUser | null;
      requesterOptions: RequesterOption[];
    }>(BUDGET_PAYMENTS_CACHE_KEY);

    let hasCache = false;

    if (cachedProjects?.value) {
      const mappedProjects = mapAndSortBudgetProjects(
        cachedProjects.value,
      );
      setProjects(mappedProjects);
      hasCache = mappedProjects.length > 0;
    }

    if (cachedPayments?.value) {
      setPayments(cachedPayments.value.payments ?? []);
      setCurrentUser(cachedPayments.value.currentUser ?? null);
      setRequesterOptions(cachedPayments.value.requesterOptions ?? []);
      hasCache = true;
    }

    if (hasCache) {
      setLoading(false);
      void loadData({ background: true });
    } else {
      void loadData();
    }
  }, []);

  const activePayments = useMemo(
    () => payments.filter((payment) => payment.status === "active"),
    [payments]
  );

  const paymentSummaryByProject = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        count: number;
        latest: string;
      }
    >();

    for (const payment of activePayments) {
      const project = projects.find((item) => item.id === payment.project_id);
      if (project?.activities.length && !payment.activity_id) continue;

      const current = map.get(payment.project_id) ?? {
        total: 0,
        count: 0,
        latest: "",
      };

      current.total += Number(payment.amount) || 0;
      current.count += 1;

      if (
        !current.latest ||
        new Date(payment.created_at).getTime() >
          new Date(current.latest).getTime()
      ) {
        current.latest = payment.created_at;
      }

      map.set(payment.project_id, current);
    }

    return map;
  }, [activePayments, projects]);

  const paymentSummaryByActivity = useMemo(() => {
    const map = new Map<string, number>();

    for (const payment of activePayments) {
      if (!payment.activity_id) continue;
      map.set(
        payment.activity_id,
        (map.get(payment.activity_id) ?? 0) +
          (Number(payment.amount) || 0),
      );
    }

    return map;
  }, [activePayments]);

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      if (project.recordType !== activeRecordType) return false;
      const budget = effectiveProjectBudget(project);
      const spent = paymentSummaryByProject.get(project.id)?.total ?? 0;
      const remaining = budget - spent;
      const matchesKeyword =
        !keyword ||
        project.name.toLowerCase().includes(keyword) ||
        project.code.toLowerCase().includes(keyword) ||
        project.owner.toLowerCase().includes(keyword) ||
        project.lead.toLowerCase().includes(keyword) ||
        project.legacyId.toLowerCase().includes(keyword) ||
        project.activities.some((activity) =>
          activity.name.toLowerCase().includes(keyword),
        );
      const matchesStatus =
        statusFilter === "all" || project.status === statusFilter;
      const matchesPayment =
        paymentFilter === "all" ||
        (paymentFilter === "unpaid" && spent <= 0) ||
        (paymentFilter === "paid" && spent > 0 && remaining >= 0) ||
        (paymentFilter === "over" && remaining < 0);

      return matchesKeyword && matchesStatus && matchesPayment;
    });

    if (sortMode === "code") return sortBudgetProjects(filtered);

    return [...filtered].sort((a, b) => {
      const aBudget = effectiveProjectBudget(a);
      const bBudget = effectiveProjectBudget(b);
      const aSpent = paymentSummaryByProject.get(a.id)?.total ?? 0;
      const bSpent = paymentSummaryByProject.get(b.id)?.total ?? 0;
      const aRemaining = aBudget - aSpent;
      const bRemaining = bBudget - bSpent;
      const aLatest = paymentSummaryByProject.get(a.id)?.latest || "";
      const bLatest = paymentSummaryByProject.get(b.id)?.latest || "";

      if (sortMode === "name") return a.name.localeCompare(b.name, "th");
      if (sortMode === "budget-desc") return bBudget - aBudget;
      if (sortMode === "budget-asc") return aBudget - bBudget;
      if (sortMode === "spent-desc") return bSpent - aSpent;
      if (sortMode === "spent-asc") return aSpent - bSpent;
      if (sortMode === "remaining-asc") return aRemaining - bRemaining;
      if (sortMode === "remaining-desc") return bRemaining - aRemaining;
      if (sortMode === "latest-desc") return new Date(bLatest || 0).getTime() - new Date(aLatest || 0).getTime();
      if (sortMode === "latest-asc") return new Date(aLatest || 0).getTime() - new Date(bLatest || 0).getTime();
      return 0;
    });
  }, [projects, query, statusFilter, paymentFilter, sortMode, paymentSummaryByProject, activeRecordType]);

  const totals = useMemo(() => {
    const visibleProjects = projects.filter(
      (project) => project.recordType === activeRecordType,
    );
    const budget = visibleProjects.reduce(
      (sum, project) => sum + effectiveProjectBudget(project),
      0,
    );
    const paid = visibleProjects.reduce(
      (sum, project) =>
        sum + (paymentSummaryByProject.get(project.id)?.total ?? 0),
      0,
    );

    return {
      projectCount: visibleProjects.length,
      activityCount: visibleProjects.reduce(
        (sum, project) => sum + project.activities.length,
        0,
      ),
      budget,
      paid,
      remaining: budget - paid,
    };
  }, [projects, paymentSummaryByProject, activeRecordType]);

  function openPayment(project: BudgetProjectListItem) {
    if (isProjectCompleted(project)) {
      setMessageType("error");
      setMessage("รายการนี้เสร็จสิ้นแล้ว ไม่สามารถเบิกจ่ายเพิ่มได้");
      return;
    }

    const existingActivePayments = payments.filter(
      (payment) =>
        payment.project_id === project.id &&
        payment.status === "active"
    );
    const nextInstallment = existingActivePayments.length + 1;

    setPayingProject(project);
    setDetails("");
    setPaymentPeriod("");
    setAmount("");
    setNote("");
    setEvidence(null);
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = "";
    }
    setRequesterId("");
    setActivityId(project.activities.length === 1 ? project.activities[0].id : "");
    setMessage("");
  }

  function closePayment() {
    if (saving) return;
    setPayingProject(null);
  }

  async function savePayment() {
    if (!payingProject || saving) return;

    const numericAmount = Number(amount);

    if (!paymentPeriod.trim()) {
      setMessageType("error");
      setMessage("กรุณาระบุงวดที่จ่าย");
      return;
    }

    if (!requesterId) {
      setMessageType("error");
      setMessage("กรุณาเลือกผู้เบิกจ่าย");
      return;
    }

    if (payingProject.activities.length > 0 && !activityId) {
      setMessageType("error");
      setMessage("กรุณาเลือกกิจกรรมของโครงการ");
      return;
    }

    if (!details.trim()) {
      setMessageType("error");
      setMessage("กรุณากรอกรายละเอียดการจ่าย");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessageType("error");
      setMessage("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }

    const selectedActivity = payingProject.activities.find((activity) => activity.id === activityId);
    const currentBudget = selectedActivity
      ? Number(selectedActivity.budget) || 0
      : effectiveProjectBudget(payingProject);
    const currentSpent = selectedActivity
      ? Number(selectedActivity.spent) || 0
      : effectiveProjectSpent(payingProject);
    const nextRemaining = currentBudget - currentSpent - numericAmount;

    if (
      nextRemaining < 0 &&
      !window.confirm(
        `รายการนี้จะทำให้โครงการเกินงบ ${money(
          Math.abs(nextRemaining)
        )} บาท\nยืนยันบันทึกหรือไม่`
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      const form = new FormData();

      form.set("projectId", payingProject.id);
      form.set("projectName", payingProject.name);
      form.set("activityId", activityId);
      form.set("details", details.trim());
      form.set("paymentPeriod", paymentPeriod.trim());
      form.set("amount", String(numericAmount));
      form.set("note", note.trim());
      form.set("requesterId", requesterId);

      if (evidence) form.set("evidence", evidence);

      const response = await fetch("/api/budget/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const result = (await response.json()) as PaymentsApiResponse;

      if (!response.ok || !result.ok || !result.payment) {
        throw new Error(result.message || "ไม่สามารถบันทึกรายการจ่ายได้");
      }

      const savedProjectId = payingProject.id;
      setMessageType("success");
      setMessage(
        result.autoCompletedProject
          ? "บันทึกรายการจ่ายแล้ว และโครงการเสร็จสิ้นอัตโนมัติ"
          : "บันทึกรายการจ่ายเรียบร้อยแล้ว"
      );
      setExpandedProjectId(savedProjectId);
      setPayingProject(null);
      window.sessionStorage.removeItem(BUDGET_PROJECTS_CACHE_KEY);
      window.sessionStorage.removeItem(BUDGET_PAYMENTS_CACHE_KEY);
      await loadData({ background: true });
      setExpandedProjectId(savedProjectId);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างบันทึกรายการ"
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelPayment(payment: Payment) {
    if (
      !window.confirm(
        `ยืนยันยกเลิกรายการ "${payment.details}" จำนวน ${money(
          payment.amount
        )} บาทหรือไม่`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/budget/payments", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          paymentId: payment.id,
        }),
      });

      const result = (await response.json()) as PaymentsApiResponse;

      if (!response.ok || !result.ok || !result.payment) {
        throw new Error(result.message || "ไม่สามารถยกเลิกรายการได้");
      }

      setMessageType("success");
      setMessage("ยกเลิกรายการจ่ายเรียบร้อยแล้ว");
      window.sessionStorage.removeItem(BUDGET_PROJECTS_CACHE_KEY);
      window.sessionStorage.removeItem(BUDGET_PAYMENTS_CACHE_KEY);
      await loadData({ background: true });
      setExpandedProjectId(payment.project_id);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างยกเลิกรายการ"
      );
    }
  }

  async function completeProject(project: BudgetProjectListItem) {
    if (
      !window.confirm(
        `ยืนยันกำหนดโครงการ "${project.name}" เป็นเสร็จสิ้นหรือไม่`
      )
    ) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/budget/payments", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "completeProject",
          projectId: project.id,
        }),
      });

      const result = (await response.json()) as PaymentsApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถปิดโครงการได้");
      }

      setMessageType("success");
      setMessage("เสร็จสิ้นเรียบร้อยแล้ว");
      setPayingProject(null);
      window.sessionStorage.removeItem(BUDGET_PROJECTS_CACHE_KEY);
      window.sessionStorage.removeItem(BUDGET_PAYMENTS_CACHE_KEY);
      await loadData({ background: true });
      setExpandedProjectId(project.id);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างปิดโครงการ"
      );
    } finally {
      setSaving(false);
    }
  }

  const payingProjectPayments = payingProject
    ? payments
        .filter((payment) => payment.project_id === payingProject.id)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        )
    : [];

  const payingPaid = payingProject
    ? paymentSummaryByProject.get(payingProject.id)?.total ?? 0
    : 0;
  const payingAmount = Number(amount);
  const selectedPayingActivity = payingProject?.activities.find((activity) => activity.id === activityId);
  const payingBudget = selectedPayingActivity
    ? Number(selectedPayingActivity.budget) || 0
    : payingProject
      ? effectiveProjectBudget(payingProject)
      : 0;
  const payingCurrentSpent = selectedPayingActivity
    ? paymentSummaryByActivity.get(selectedPayingActivity.id) ?? 0
    : payingProject
      ? paymentSummaryByProject.get(payingProject.id)?.total ?? 0
      : 0;
  const payingNextPaid = payingCurrentSpent + (Number.isFinite(payingAmount) ? payingAmount : 0);
  const payingNextRemaining = payingBudget - payingNextPaid;
  const canManuallyCompletePayingProject = Boolean(
    payingProject &&
      payingPaid > 0 &&
      payingProject.status !== "เสร็จสิ้น" &&
      (payingBudget <= 0 || payingPaid < payingBudget)
  );
  const canPay = Boolean(
    currentUser?.canFinance || currentUser?.canManageAll
  );


  if (loading) {
    return <main className="stateBox">กำลังโหลดข้อมูลเบิกจ่าย...</main>;
  }

  return (
    <main
      className={
        activeRecordType === "free_education"
          ? "paymentsPage freeEducationTheme"
          : "paymentsPage"
      }
    >

      <section className="pageHeader">
        <div>
          <h1>การเบิกจ่าย</h1>
          <p>บันทึกรายการจ่ายและดูประวัติของแต่ละโครงการ</p>
        </div>
        <div className="reloadArea">
          {refreshing ? <small>กำลังอัปเดตเบื้องหลัง…</small> : null}
          <button
            type="button"
            className="reloadButton"
            onClick={() => void loadData({ background: true })}
          >
            โหลดใหม่
          </button>
        </div>
      </section>

      <section className="budgetTypeTabs" aria-label="ประเภทการเบิกจ่าย">
        <button
          type="button"
          className={activeRecordType === "project" ? "active" : ""}
          onClick={() => setActiveRecordType("project")}
        >
          โครงการ / กิจกรรม
        </button>
        <button
          type="button"
          className={activeRecordType === "free_education" ? "active" : ""}
          onClick={() => setActiveRecordType("free_education")}
        >
          เรียนฟรี 15 ปี
        </button>
      </section>

      {message && (
        <div
          className={
            messageType === "success"
              ? "messageBox successMessage"
              : "messageBox errorMessage"
          }
        >
          {message}
        </div>
      )}


      <section className="summaryGrid">
        <article>
          <span>โครงการ</span>
          <strong>{totals.projectCount}</strong>
          <small>รายการทั้งหมด</small>
        </article>
        <article>
          <span>กิจกรรม</span>
          <strong>{totals.activityCount}</strong>
          <small>กิจกรรมภายใต้โครงการ</small>
        </article>
        <article>
          <span>ใช้จริง</span>
          <strong>{money(totals.paid)}</strong>
          <small>บาท</small>
        </article>
        <article>
          <span>งบประมาณคงเหลือ</span>
          <strong className={totals.remaining < 0 ? "negative" : ""}>
            {money(totals.remaining)}
          </strong>
          <small>บาท</small>
        </article>
      </section>

      <section className="projectPanel">
        <div className="panelTop">
          <div>
            <h2>รายการโครงการทั้งหมด</h2>
            <p>กดเบิกจ่ายที่โครงการที่ต้องการ หรือเปิดดูประวัติย้อนหลัง</p>
          </div>
          <div className="filterBar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาโครงการ กิจกรรม รหัส หรือผู้รับผิดชอบ..."
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">ทุกสถานะ</option>
              <option value="ยังไม่เริ่ม">ยังไม่เริ่ม</option>
              <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
              <option value="ดำเนินการ">ดำเนินการ</option>
              <option value="เบิกจ่าย">เบิกจ่าย</option>
              <option value="เสร็จสิ้น">เสร็จสิ้น</option>
            </select>
            <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
              <option value="all">ทุกสถานะการจ่าย</option>
              <option value="unpaid">ยังไม่จ่าย</option>
              <option value="paid">มีการจ่ายแล้ว</option>
              <option value="over">เกินงบ</option>
            </select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="code">ลำดับเดียวกับหน้าโครงการ</option>
              <option value="name">ชื่อโครงการ ก-ฮ</option>
              <option value="budget-desc">งบมากไปน้อย</option>
              <option value="budget-asc">งบน้อยไปมาก</option>
              <option value="spent-desc">จ่ายมากไปน้อย</option>
              <option value="spent-asc">จ่ายน้อยไปมาก</option>
              <option value="remaining-asc">คงเหลือน้อยไปมาก</option>
              <option value="remaining-desc">คงเหลือมากไปน้อย</option>
              <option value="latest-desc">จ่ายล่าสุดก่อน</option>
              <option value="latest-asc">จ่ายเก่าสุดก่อน</option>
            </select>
          </div>
        </div>

        <div className="tableHeader">
          <div>#</div>
          <div>ชื่อโครงการ</div>
          <div>งบจัดสรร</div>
          <div>จ่ายสะสม</div>
          <div>คงเหลือ</div>
          <div>จำนวนครั้ง</div>
          <div>จ่ายล่าสุด</div>
          <div>จัดการ</div>
        </div>

        <div className="projectList">
          {filteredProjects.map((project, index) => {
            const summary = paymentSummaryByProject.get(project.id) ?? {
              total: 0,
              count: 0,
              latest: "",
            };
            const effectiveBudget = effectiveProjectBudget(project);
            const effectiveSpent = summary.total;
            const remaining = effectiveBudget - effectiveSpent;
            const projectPayments = payments.filter(
              (payment) => payment.project_id === project.id
            );
            const expanded = expandedProjectId === project.id;
            const canPay =
              (currentUser?.canFinance || currentUser?.canManageAll) &&
              !isProjectCompleted(project);

            return (
              <article
                className={
                  expanded
                    ? "projectCard projectCardHighlighted"
                    : "projectCard"
                }
                key={project.id}
                id={`payment-project-${project.id}`}
              >
                <div className="projectRow">
                  <div className="indexCell">{index + 1}</div>
                  <div className="projectName">
                    <strong>{project.name}</strong>
                    <small>
                      {project.owner}
                      {project.lead !== "-" ? ` · ${project.lead}` : ""}
                    </small>
                  </div>
                  <div className="amountCell">
                    <strong>{money(effectiveBudget)}</strong>
                  </div>
                  <div className="amountCell">
                    <strong>{money(effectiveSpent)}</strong>
                  </div>
                  <div className="amountCell">
                    <strong className={remaining < 0 ? "negative" : "positive"}>
                      {money(remaining)}
                    </strong>
                    {remaining < 0 && <em>เกินงบ</em>}
                  </div>
                  <div className="countCell"><strong>{summary.count}</strong></div>
                  <div className="latestCell">
                    {summary.latest ? thaiDateTime(summary.latest) : "-"}
                  </div>
                  <div className="actionCell">
                    {canPay && (
                      <button
                        type="button"
                        className="payButton"
                        onClick={() => openPayment(project)}
                      >
                        เบิกจ่าย
                      </button>
                    )}
                    <button
                      type="button"
                      className="historyButton"
                      onClick={() => {
                        setExpandedProjectId(expanded ? "" : project.id);
                        if (!expanded) {
                          window.setTimeout(() => {
                            document
                              .getElementById(`payment-project-${project.id}`)
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }, 50);
                        }
                      }}
                    >
                      {expanded ? "ปิดประวัติ" : "ดูประวัติ"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="historyPanel">
                    <div className="historyHeader">
                      <div>
                        <h3>ประวัติการจ่าย</h3>
                        <p>{project.name}</p>
                      </div>
                      <span>{projectPayments.length} รายการ</span>
                    </div>

                    {projectPayments.length === 0 ? (
                      <div className="emptyHistory">
                        ยังไม่มีประวัติการจ่ายในโครงการนี้
                      </div>
                    ) : (
                      <div className="historyList">
                        {projectPayments.map((payment, paymentIndex) => (
                          <div
                            className={
                              payment.status === "cancelled"
                                ? "historyItem cancelledItem"
                                : "historyItem"
                            }
                            key={payment.id}
                          >
                            <div className="historyNumber">
                              {projectPayments.length - paymentIndex}
                            </div>
                            <div className="historyDate">
                              <strong>{thaiDateTime(payment.created_at)}</strong>
                              <small>
                                ผู้เบิกจ่าย {payment.requester_name || "-"}
                              </small>
                              <small>บันทึกโดย {payment.created_by_name}</small>
                            </div>
                            <div className="historyDetails">
                              <strong>{payment.activity_name ? `${payment.activity_name} · ${payment.details}` : payment.details}</strong>
                              <small>
                                งวดที่จ่าย: {payment.payment_period || "-"}
                              </small>
                              {payment.note && (
                                <small>หมายเหตุ: {payment.note}</small>
                              )}
                            </div>
                            <div className="historyAmount">
                              <strong>{money(payment.amount)} บาท</strong>
                              <small>
                                จ่ายสะสม{" "}
                                {money(
                                  projectPayments
                                    .slice(0, paymentIndex + 1)
                                    .filter((item) => item.status === "active")
                                    .reduce(
                                      (sum, item) =>
                                        sum + (Number(item.amount) || 0),
                                      0,
                                    ),
                                )}{" "}
                                บาท
                              </small>
                              {payment.status === "cancelled" && (
                                <span>ยกเลิกแล้ว</span>
                              )}
                            </div>
                            <div className="historyEvidence">
                              {payment.evidence_url ? (
                                <a
                                  href={payment.evidence_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  ดูหลักฐาน
                                </a>
                              ) : (
                                <span>-</span>
                              )}
                            </div>
                            <div className="historyAction">
                              {payment.status === "active" &&
                                (currentUser?.canFinance ||
                                  currentUser?.canManageAll) && (
                                  <button
                                    type="button"
                                    onClick={() => void cancelPayment(payment)}
                                  >
                                    ยกเลิก
                                  </button>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {payingProject && (
        <div className="modalBackdrop">
          <section
            className="paymentModal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>บันทึกการเบิกจ่าย</h2>
                <p>{payingProject.name}</p>
              </div>
              <button type="button" onClick={closePayment} aria-label="ปิด">
                ×
              </button>
            </header>

            <div className="paymentModalBody">
            <div className="paymentPreview">
              <article>
                <span>งบจัดสรร</span>
                <strong>{money(payingBudget)}</strong>
              </article>
              <article>
                <span>จ่ายแล้ว</span>
                <strong>{money(payingPaid)}</strong>
              </article>
              <article>
                <span>จ่ายครั้งนี้</span>
                <strong>{money(Number.isFinite(payingAmount) ? payingAmount : 0)}</strong>
              </article>
              <article>
                <span>คงเหลือหลังบันทึก</span>
                <strong
                  className={payingNextRemaining < 0 ? "negative" : "positive"}
                >
                  {money(payingNextRemaining)}
                </strong>
                {payingNextRemaining < 0 ? <small>เกินงบ</small> : null}
              </article>
            </div>

            <section className="installmentHistory">
              <div className="installmentHistoryHeader">
                <div>
                  <h3>ประวัติงวดการจ่าย</h3>
                </div>
                <strong>
                  {payingProjectPayments.filter(
                    (payment) => payment.status === "active"
                  ).length} งวด
                </strong>
              </div>

              {payingProjectPayments.length === 0 ? (
                <div className="emptyInstallment">
                  ยังไม่มีการจ่ายเงิน งวดแรกจะเริ่มเป็น “งวดที่ 1”
                </div>
              ) : (
                <div className="installmentList">
                  {payingProjectPayments.map((payment, index) => (
                    <article
                      key={payment.id}
                      className={
                        payment.status === "cancelled"
                          ? "installmentItem installmentCancelled"
                          : "installmentItem"
                      }
                    >
                      <span className="installmentNumber">
                        {index + 1}
                      </span>
                      <div>
                        <strong>
                          {payment.payment_period || `งวดที่ ${index + 1}`}
                        </strong>
                        <small>{payment.activity_name ? `${payment.activity_name} · ` : ""}{payment.details}</small>
                      </div>
                      <div className="installmentAmount">
                        <strong>{money(payment.amount)}</strong>
                        <small>
                          {payment.status === "cancelled"
                            ? "ยกเลิกแล้ว"
                            : thaiDateTime(payment.created_at)}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="formGrid">
              {payingProject.activities.length > 0 && (
                <label className="fullField">
                  <span>กิจกรรมที่เบิกจ่าย <b className="requiredMark">*</b></span>
                  <select value={activityId} onChange={(event) => setActivityId(event.target.value)}>
                    <option value="">เลือกกิจกรรม</option>
                    {payingProject.activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.name} · งบ {money(activity.budget)} · คงเหลือ {money(
                          activity.budget -
                            (paymentSummaryByActivity.get(activity.id) ?? 0)
                        )}
                      </option>
                    ))}
                  </select>
                  <small>โครงการนี้มีกิจกรรมย่อย จึงต้องระบุกิจกรรมก่อนบันทึก</small>
                </label>
              )}
              <label className="fullField">
                <span>ผู้เบิกจ่าย <b className="requiredMark">*</b></span>
                <select
                  value={requesterId}
                  onChange={(event) => setRequesterId(event.target.value)}
                >
                  <option value="">เลือกผู้เบิกจ่าย</option>
                  {requesterOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} · {requesterDutyLabel(person)}
                    </option>
                  ))}
                </select>

              </label>

              <label className="fullField">
                <span>รายละเอียด <b className="requiredMark">*</b></span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="ระบุรายละเอียดรายการจ่าย"
                  rows={2}
                />
              </label>

              <label>
                <span>งวดที่จ่าย/ครั้งที่จ่าย <b className="requiredMark">*</b></span>
                <input
                  value={paymentPeriod}
                  onChange={(event) => setPaymentPeriod(event.target.value)}
                  placeholder="งวดที่ 1 หรือ ครั้งที่ 1"
                />

              </label>

              <label>
                <span>จำนวนเงิน (บาท) <b className="requiredMark">*</b></span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label>
                <span>หลักฐาน</span>
                <div className="evidenceField">
                  <input
                    ref={evidenceInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(event) =>
                      setEvidence(event.target.files?.[0] ?? null)
                    }
                  />
                  {evidence && (
                    <button
                      type="button"
                      className="removeEvidenceButton"
                      aria-label="ลบไฟล์หลักฐาน"
                      title="ลบไฟล์หลักฐาน"
                      onClick={() => {
                        setEvidence(null);
                        if (evidenceInputRef.current) {
                          evidenceInputRef.current.value = "";
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {evidence ? (
                  <small className="selectedEvidenceName">
                    เลือกแล้ว: {evidence.name}
                  </small>
                ) : (
                  <small>ไม่บังคับ ขนาดไม่เกิน 10 MB</small>
                )}
              </label>

              <label className="fullField">
                <span>หมายเหตุ</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="ไม่บังคับ"
                  rows={2}
                />
              </label>
            </div>

            </div>

            <footer>
              <div className="footerLeft">
                {canPay &&
                  canManuallyCompletePayingProject && (
                    <button
                      type="button"
                      className="completeButton"
                      onClick={() => void completeProject(payingProject)}
                      disabled={saving}
                    >
                      สั่งเสร็จสิ้น
                    </button>
                  )}
              </div>

              <button
                type="button"
                className="cancelButton"
                onClick={closePayment}
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="saveButton"
                onClick={() => void savePayment()}
                disabled={saving}
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </footer>
          </section>
        </div>
      )}

      <style jsx>{`
        .paymentsPage {
          min-height: 100vh;
          padding: 20px;
          background: #f4f6fb;
          color: #172033;
        }

        .pageHeader,
        .panelTop,
        .historyHeader,
        .paymentModal header,
        .paymentModal footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        h1,
        h2,
        h3,
        p {
          margin: 0;
        }

        .pageHeader {
          padding: 16px 18px;
          border: 1px solid #7c3aed;
          border-radius: 16px;
          color: #fff;
          background:
            radial-gradient(circle at top right, rgba(255, 255, 255, 0.22), transparent 34%),
            linear-gradient(135deg, #6d28d9, #9333ea 58%, #a855f7);
          box-shadow: 0 10px 26px rgba(109, 40, 217, 0.2);
        }

        .pageHeader h1 {
          color: #fff;
          font-size: 28px;
        }

        .pageHeader p {
          color: rgba(255, 255, 255, 0.88) !important;
        }

        .pageHeader .reloadArea small {
          color: rgba(255, 255, 255, 0.9);
        }

        .pageHeader .reloadButton {
          color: #6d28d9;
          background: #fff;
          box-shadow: 0 5px 14px rgba(46, 16, 101, 0.2);
        }

        .pageHeader p,
        .panelTop p,
        .historyHeader p,
        .paymentModal header p {
          margin-top: 4px;
          color: #667085;
          font-size: 13px;
        }

        .reloadButton,
        .payButton,
        .saveButton,
        .completeButton {
          border: 0;
          border-radius: 9px;
          color: #fff;
          background: linear-gradient(135deg, #7c3aed, #9333ea);
          font-weight: 800;
          cursor: pointer;
        }

        .reloadButton {
          height: 38px;
          padding: 0 14px;
        }

        .completeButton {
          min-height: 34px;
          padding: 0 12px;
          background: linear-gradient(135deg, #059669, #16a34a);
        }

        .countCell {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .countCell small {
          width: fit-content;
          padding: 3px 7px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .statusPending {
          color: #475569;
          background: #e2e8f0;
        }

        .statusProgress {
          color: #92400e;
          background: #fef3c7;
        }

        .statusDone {
          color: #166534;
          background: #dcfce7;
        }

        .paymentPreview {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          padding: 14px 18px 0;
        }

        .paymentPreview article {
          padding: 11px 12px;
          border: 1px solid #ddd6fe;
          border-radius: 11px;
          background: #faf7ff;
        }

        .paymentPreview span,
        .paymentPreview small {
          display: block;
          color: #6b7280;
          font-size: 11px;
        }

        .paymentPreview strong {
          display: block;
          margin-top: 5px;
          font-size: 17px;
        }

        .messageBox {
          margin-top: 14px;
          padding: 11px 13px;
          border-radius: 10px;
          font-weight: 800;
        }

        .successMessage {
          border: 1px solid #86efac;
          color: #166534;
          background: #dcfce7;
        }

        .errorMessage {
          border: 1px solid #fca5a5;
          color: #991b1b;
          background: #fee2e2;
        }

        .summaryGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .summaryGrid article {
          padding: 15px;
          border: 1px solid #dcfce7;
          border-radius: 15px;
          background: linear-gradient(180deg, #fff, #f8fffb);
          box-shadow: 0 4px 14px rgba(30, 41, 59, 0.04);
        }

        .summaryGrid span,
        .summaryGrid small {
          display: block;
          color: #6b7280;
          font-size: 11px;
        }

        .summaryGrid strong {
          display: block;
          margin-top: 7px;
          color: #166534;
          font-size: 21px;
        }

        .summaryGrid small {
          margin-top: 5px;
        }

        .requiredMark {
          color: #dc2626;
          font: inherit;
          font-weight: 900;
        }

        .evidenceField {
          position: relative;
        }

        .evidenceField input[type="file"] {
          padding-right: 42px;
        }

        .removeEvidenceButton {
          position: absolute;
          top: 50%;
          right: 7px;
          width: 26px;
          height: 26px;
          transform: translateY(-50%);
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: #dc2626;
          font-size: 19px;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
        }

        .removeEvidenceButton:hover {
          background: #b91c1c;
        }

        .selectedEvidenceName {
          color: #166534 !important;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .projectPanel {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid #dfe4ec;
          border-radius: 15px;
          background: #fff;
        }

        .panelTop {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
        }

        .panelTop > div:first-child {
          flex: 0 0 auto;
        }

        .filterBar {
          display: grid;
          grid-template-columns:
            minmax(280px, 1fr)
            minmax(135px, 165px)
            minmax(155px, 190px)
            minmax(170px, 210px);
          gap: 8px;
          width: min(100%, 930px);
          min-width: 0;
        }

        .filterBar input,
        .filterBar select {
          min-width: 0;
          width: 100%;
          height: 36px;
          padding: 0 9px;
          border: 1px solid #cfd6e2;
          border-radius: 8px;
          background: #fff;
          font-family: "Sarabun", "Noto Sans Thai", Tahoma, sans-serif;
          font-size: 12px;
          outline: none;
        }

        .tableHeader,
        .projectRow {
          display: grid;
          grid-template-columns:
            36px
            minmax(380px, 2.8fr)
            minmax(90px, 0.62fr)
            minmax(90px, 0.62fr)
            minmax(94px, 0.66fr)
            64px
            128px
            142px;
          gap: 6px;
          align-items: center;
          font-family: "Sarabun", "Noto Sans Thai", Tahoma, sans-serif;
        }

        .tableHeader {
          margin-top: 12px;
          padding: 7px 8px;
          border-radius: 8px;
          color: #475467;
          background: #f2f4f7;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .projectList {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }

        .projectCard {
          border: 1px solid #e1e6ee;
          border-radius: 12px;
          overflow: hidden;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background 160ms ease;
        }

        .projectCardHighlighted {
          border: 2px solid #7c3aed;
          background: #faf7ff;
          box-shadow:
            0 0 0 4px rgba(124, 58, 237, 0.12),
            0 10px 24px rgba(76, 29, 149, 0.12);
        }

        .projectCardHighlighted .projectRow {
          background: linear-gradient(90deg, #f3e8ff 0%, #ffffff 68%);
        }

        .projectRow {
          padding: 11px 10px;
        }

        .indexCell {
          text-align: center;
          color: #667085;
          font-weight: 800;
        }

        .projectRow {
          padding: 6px 8px;
          font-size: 12px;
          line-height: 1.3;
        }

        .tableHeader > div:not(:nth-child(2)),
        .projectRow > div:not(.projectName):not(.actionCell) {
          white-space: nowrap;
        }

        .projectName {
          min-width: 0;
        }

        .projectName strong {
          display: block;
          overflow: hidden;
          color: #172033;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 700;
        }

        .projectName small {
          display: block;
          overflow: hidden;
          margin-top: 1px;
          color: #667085;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
        }

        .amountCell span {
          display: block;
          margin-top: 2px;
          color: #98a2b3;
          font-size: 10px;
        }

        .amountCell strong,
        .countCell,
        .latestCell {
          font-size: 12px;
          white-space: nowrap;
        }

        .latestCell {
          line-height: 1.25;
        }

        .amountCell em {
          display: inline-block;
          margin-top: 3px;
          padding: 2px 6px;
          border-radius: 999px;
          color: #b91c1c;
          background: #fee2e2;
          font-size: 10px;
          font-style: normal;
          font-weight: 800;
        }

        .positive {
          color: #15803d;
        }

        .negative {
          color: #dc2626 !important;
        }

        .actionCell {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }

        .payButton,
        .historyButton {
          height: 30px;
          padding: 0 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
        }

        .historyButton {
          border: 1px solid #d7dce5;
          color: #475467;
          background: #fff;
          cursor: pointer;
        }

        .historyPanel {
          padding: 12px;
          border-top: 1px solid #e1e6ee;
          background: #f8fafc;
        }

        .historyHeader span {
          padding: 4px 8px;
          border-radius: 999px;
          color: #6d28d9;
          background: #f3e8ff;
          font-size: 11px;
          font-weight: 800;
        }

        .emptyHistory {
          margin-top: 10px;
          padding: 22px;
          border: 1px dashed #cfd6e2;
          border-radius: 10px;
          color: #667085;
          text-align: center;
        }

        .historyList {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }

        .historyItem {
          display: grid;
          grid-template-columns: 34px 170px minmax(220px, 1fr) 140px 100px 70px;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border: 1px solid #e1e6ee;
          border-radius: 10px;
          background: #fff;
        }

        .cancelledItem {
          opacity: 0.62;
          background: #f3f4f6;
        }

        .historyNumber {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: #16a34a;
          font-size: 11px;
          font-weight: 900;
        }

        .historyDate strong,
        .historyDetails strong,
        .historyAmount strong {
          display: block;
          font-size: 12px;
        }

        .historyDate small,
        .historyDetails small {
          display: block;
          margin-top: 3px;
          color: #667085;
          font-size: 10px;
        }

        .historyAmount {
          text-align: right;
          color: #15803d;
        }

        .historyAmount span {
          display: inline-block;
          margin-top: 4px;
          padding: 2px 6px;
          border-radius: 999px;
          color: #991b1b;
          background: #fee2e2;
          font-size: 10px;
          font-weight: 800;
        }

        .historyEvidence a {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
        }

        .historyAction button {
          height: 30px;
          padding: 0 8px;
          border: 1px solid #fca5a5;
          border-radius: 7px;
          color: #b91c1c;
          background: #fff1f2;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .historyAmount small {
          display: block;
          margin-top: 3px;
          color: #667085;
          font-size: 10px;
          font-weight: 700;
        }

        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 12px;
          background: rgba(15, 23, 42, 0.62);
          overscroll-behavior: contain;
        }

        .paymentModal {
          width: min(640px, 100%);
          max-height: calc(100dvh - 24px);
          display: flex;
          flex-direction: column;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.32);
          overflow: hidden;
        }

        .paymentModal header {
          flex: 0 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid #e1e6ee;
          background: #faf7ff;
        }

        .paymentModal header h2 {
          margin: 0;
          font-size: 17px;
          line-height: 1.25;
        }

        .paymentModal header p {
          margin: 3px 0 0;
          color: #667085;
          font-size: 12px;
          line-height: 1.35;
        }

        .paymentModal header button {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: #dc2626;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
        }

        .paymentModalBody {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 10px;
          padding: 0 12px 12px;
        }

        .formGrid label span {
          display: block;
          margin-bottom: 4px;
          color: #344054;
          font-size: 11px;
          font-weight: 800;
        }

        .formGrid input,
        .formGrid textarea,
        .formGrid select {
          width: 100%;
          padding: 7px 9px;
          border: 1px solid #cfd6e2;
          border-radius: 8px;
          color: #172033;
          background: #fff;
          outline: none;
          box-sizing: border-box;
          font-size: 13px;
        }

        .formGrid input,
        .formGrid select {
          height: 36px;
        }

        .formGrid textarea {
          min-height: 52px;
          resize: vertical;
        }

        .formGrid input:disabled {
          color: #667085;
          background: #eef1f5;
        }

        .formGrid small {
          display: block;
          margin-top: 3px;
          color: #98a2b3;
          font-size: 9px;
          line-height: 1.3;
        }

        .fullField {
          grid-column: 1 / -1;
        }

        .paymentModal footer {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-top: 1px solid #e1e6ee;
          background: #fff;
          box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.05);
        }

        .cancelButton,
        .saveButton {
          min-width: 96px;
          height: 36px;
          border-radius: 8px;
          font-weight: 800;
          cursor: pointer;
        }

        .cancelButton {
          margin-left: auto;
          border: 1px solid #d7dce5;
          color: #475467;
          background: #fff;
        }

        .saveButton {
          border: 0;
        }

        .stateBox {
          min-height: 50vh;
          display: grid;
          place-items: center;
          color: #667085;
        }

        @media (max-width: 1180px) {
          .tableHeader {
            display: none;
          }

          .projectRow {
            grid-template-columns: 40px minmax(220px, 1fr) repeat(3, 120px);
          }

          .countCell,
          .latestCell {
            display: none;
          }

          .actionCell {
            grid-column: 2 / -1;
          }

          .historyItem {
            grid-template-columns: 34px 150px minmax(180px, 1fr) 120px;
          }

          .historyEvidence,
          .historyAction {
            grid-column: auto;
          }
        }

        @media (max-width: 760px) {
          .paymentsPage {
            padding: 12px 10px 24px;
          }

          .summaryGrid,
          .paymentPreview {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .panelTop,
          .pageHeader {
            align-items: stretch;
            flex-direction: column;
          }

          .panelTop {
            display: grid;
            align-items: stretch;
          }

          .filterBar {
            grid-template-columns: 1fr;
            width: 100%;
          }

          .panelTop input {
            width: 100%;
          }

          .projectRow {
            grid-template-columns: 34px 1fr;
          }

          .amountCell,
          .countCell,
          .latestCell {
            display: block;
            grid-column: 2;
          }

          .actionCell {
            grid-column: 2;
            justify-content: flex-start;
          }

          .historyItem {
            grid-template-columns: 30px 1fr;
          }

          .historyDate,
          .historyDetails,
          .historyAmount,
          .historyEvidence,
          .historyAction {
            grid-column: 2;
            text-align: left;
          }

          .formGrid {
            grid-template-columns: 1fr;
          }

          .fullField {
            grid-column: auto;
          }
        }

        :global(body) {
          background:
            radial-gradient(circle at top right, rgba(212, 175, 55, 0.12), transparent 34%),
            #fbf8f2;
        }

        .panelTop h2,
        .historyHeader h3,
        .paymentModal h2 {
          color: #5b3a16;
        }

        .pageHeader h1 {
          color: #ffffff !important;
          text-shadow: 0 1px 2px rgba(46, 16, 101, 0.34);
        }

        .pageHeader p {
          color: #f5f3ff !important;
          text-shadow: 0 1px 1px rgba(46, 16, 101, 0.22);
        }

        .pageHeader .reloadArea small {
          color: #ede9fe !important;
        }

        .reloadButton,
        .payButton,
        .saveButton {
          background: linear-gradient(135deg, #8b5e2f, #c28a2c);
          box-shadow: 0 6px 14px rgba(139, 94, 47, 0.2);
        }

        .reloadButton:hover,
        .payButton:hover,
        .saveButton:hover {
          filter: brightness(1.04);
        }

        .completeButton {
          background: linear-gradient(135deg, #6f4e21, #b8860b);
          box-shadow: 0 5px 12px rgba(111, 78, 33, 0.2);
        }

        .projectCardHighlighted {
          border-color: #b8860b;
          background: #fffaf0;
          box-shadow:
            0 0 0 4px rgba(184, 134, 11, 0.12),
            0 10px 24px rgba(92, 61, 16, 0.12);
        }

        .projectCardHighlighted .projectRow {
          background: linear-gradient(90deg, #fff4cf 0%, #ffffff 70%);
        }

        .paymentPreview {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
          padding: 10px 12px 0;
        }

        .paymentPreview article {
          min-height: 58px;
          padding: 8px;
          border-color: #ead7a1;
          background: linear-gradient(180deg, #fffaf0, #fff7df);
        }

        .paymentPreview span {
          font-size: 10px;
        }

        .paymentPreview strong {
          font-size: 15px;
        }

        .paymentPreview strong {
          color: #6f4e21;
        }

        .installmentHistory {
          margin: 8px 12px 10px;
          padding: 9px;
          border: 1px solid #ead7a1;
          border-radius: 10px;
          background: linear-gradient(180deg, #fffdf7, #fff8e8);
        }

        .installmentHistoryHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 6px;
        }

        .installmentHistoryHeader h3 {
          margin: 0;
          color: #5b3a16;
          font-size: 13px;
        }

        .installmentHistoryHeader p {
          margin: 4px 0 0;
          color: #8a6a42;
          font-size: 12px;
        }

        .installmentHistoryHeader > strong {
          flex: 0 0 auto;
          padding: 4px 8px;
          border-radius: 999px;
          color: #6f4e21;
          background: #f5df9c;
          font-size: 12px;
        }

        .installmentList {
          display: grid;
          gap: 6px;
          max-height: 120px;
          overflow-y: auto;
        }

        .installmentItem {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          padding: 7px 8px;
          border: 1px solid #ead7a1;
          border-radius: 10px;
          background: #ffffff;
        }

        .installmentCancelled {
          opacity: 0.58;
          background: #f8f3ea;
        }

        .installmentNumber {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          color: #ffffff;
          background: linear-gradient(135deg, #8b5e2f, #c28a2c);
          font-weight: 900;
          font-size: 12px;
        }

        .installmentItem strong,
        .installmentItem small {
          display: block;
        }

        .installmentItem small {
          margin-top: 2px;
          color: #7a6a55;
          font-size: 11px;
        }

        .installmentAmount {
          text-align: right;
        }

        .installmentAmount strong {
          color: #6f4e21;
        }

        .emptyInstallment {
          padding: 9px;
          border: 1px dashed #d7b75f;
          border-radius: 10px;
          color: #8a6a42;
          background: #fffdf7;
          text-align: center;
          font-size: 12px;
        }

        .footerLeft {
          margin-right: auto;
        }

        @media (max-width: 760px) {
          .modalBackdrop {
            padding: 6px;
            align-items: center;
          }

          .paymentModal {
            width: 100%;
            max-height: calc(100dvh - 12px);
            border-radius: 12px;
          }

          .paymentPreview {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .formGrid {
            grid-template-columns: 1fr;
          }

          .fullField {
            grid-column: auto;
          }

          .installmentItem {
            grid-template-columns: 24px minmax(0, 1fr);
          }

          .installmentAmount {
            grid-column: 2;
            text-align: left;
          }

          .paymentModal footer {
            flex-wrap: nowrap;
          }

          .footerLeft {
            margin-right: auto;
          }

          .footerLeft .completeButton {
            min-width: 0;
            padding: 0 10px;
          }

          .cancelButton,
          .saveButton {
            min-width: 82px;
          }
        }


      


/* PAYMENTS_NEO_GREEN_STEP6_START */
.paymentsPage {
  --neo-950: #052e2b;
  --neo-900: #064e45;
  --neo-800: #065f53;
  --neo-700: #047857;
  --neo-600: #059669;
  --neo-500: #10b981;
  --neo-400: #34d399;
  --neo-300: #6ee7b7;
  --neo-200: #a7f3d0;
  --neo-100: #d1fae5;
  --neo-50: #ecfdf5;

  min-height: 100%;
  color: var(--neo-950);
  background:
    radial-gradient(circle at top right, rgba(52, 211, 153, 0.18), transparent 34rem),
    linear-gradient(180deg, #f8fffc 0%, var(--neo-50) 44%, #e6fff5 100%);
}

.paymentsPage .pageHeader {
  color: #f0fdf9;
  border: 1px solid rgba(167, 243, 208, 0.55);
  background:
    linear-gradient(135deg, #043f37 0%, var(--neo-800) 52%, var(--neo-500) 100%);
  box-shadow: 0 14px 34px rgba(6, 78, 69, 0.18);
}

.paymentsPage .pageHeader h1,
.paymentsPage .pageHeader p,
.paymentsPage .pageHeader small {
  color: inherit;
}

.paymentsPage .reloadButton,
.paymentsPage .payButton,
.paymentsPage .paymentModal footer button[type="submit"] {
  color: #f0fdf9;
  border-color: var(--neo-700);
  background: linear-gradient(135deg, var(--neo-700), var(--neo-500));
  box-shadow: 0 8px 18px rgba(6, 78, 69, 0.18);
}

.paymentsPage .reloadButton:hover,
.paymentsPage .payButton:hover,
.paymentsPage .paymentModal footer button[type="submit"]:hover {
  background: linear-gradient(135deg, var(--neo-800), var(--neo-600));
}

.paymentsPage .summaryGrid article,
.paymentsPage .projectPanel,
.paymentsPage .projectCard,
.paymentsPage .historyPanel,
.paymentsPage .paymentModal,
.paymentsPage .paymentPreview article,
.paymentsPage .installmentHistory,
.paymentsPage .historyItem,
.paymentsPage .installmentItem {
  border-color: var(--neo-200);
  background: rgba(248, 255, 252, 0.97);
  box-shadow: 0 10px 26px rgba(6, 78, 69, 0.08);
}

.paymentsPage .summaryGrid article {
  background: linear-gradient(180deg, #fbfffd 0%, var(--neo-100) 100%);
}

.paymentsPage .summaryGrid span,
.paymentsPage .summaryGrid small,
.paymentsPage .panelTop p,
.paymentsPage .projectName small,
.paymentsPage .historyDate small,
.paymentsPage .historyDetails small,
.paymentsPage .historyAmount small {
  color: var(--neo-700);
}

.paymentsPage .summaryGrid strong,
.paymentsPage .panelTop h2,
.paymentsPage .projectName strong,
.paymentsPage .historyHeader h3,
.paymentsPage .paymentModal h2,
.paymentsPage .installmentHistoryHeader h3 {
  color: var(--neo-950);
}

.paymentsPage .filterBar input,
.paymentsPage .filterBar select,
.paymentsPage .formGrid input,
.paymentsPage .formGrid select,
.paymentsPage .formGrid textarea,
.paymentsPage .evidenceField {
  color: var(--neo-950);
  border-color: var(--neo-300);
  background: #fbfffd;
}

.paymentsPage .filterBar input:focus,
.paymentsPage .filterBar select:focus,
.paymentsPage .formGrid input:focus,
.paymentsPage .formGrid select:focus,
.paymentsPage .formGrid textarea:focus {
  border-color: var(--neo-500);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);
  outline: none;
}

.paymentsPage .tableHeader,
.paymentsPage .historyHeader,
.paymentsPage .installmentHistoryHeader,
.paymentsPage .paymentModal > header {
  color: var(--neo-950);
  border-color: var(--neo-200);
  background: linear-gradient(180deg, var(--neo-100), #c6f7df);
}

.paymentsPage .projectCard:hover {
  border-color: var(--neo-400);
  box-shadow: 0 14px 30px rgba(6, 78, 69, 0.12);
}

.paymentsPage .projectCardHighlighted {
  border-color: var(--neo-500);
  background: linear-gradient(180deg, #fbfffd 0%, #e7fbf3 100%);
  box-shadow:
    0 0 0 2px rgba(16, 185, 129, 0.14),
    0 16px 34px rgba(6, 78, 69, 0.14);
}

.paymentsPage .historyButton {
  color: var(--neo-800);
  border-color: var(--neo-300);
  background: var(--neo-100);
}

.paymentsPage .historyButton:hover {
  border-color: var(--neo-500);
  background: var(--neo-200);
}

.paymentsPage .modalBackdrop {
  background: rgba(3, 43, 38, 0.58);
  backdrop-filter: blur(5px);
}

.paymentsPage .paymentModal > header {
  border-bottom-color: var(--neo-300);
}

.paymentsPage .paymentModal > header button {
  color: var(--neo-800);
  border-color: var(--neo-300);
  background: var(--neo-100);
}

.paymentsPage .paymentPreview article {
  background: linear-gradient(180deg, #fbfffd, var(--neo-100));
}

.paymentsPage .requiredMark {
  color: #b42318;
}

.paymentsPage .successMessage,
.paymentsPage .positive {
  color: #166534;
}

.paymentsPage .errorMessage,
.paymentsPage .negative,
.paymentsPage .cancelledItem {
  color: #b42318;
}
/* PAYMENTS_NEO_GREEN_STEP6_END */

/* BUDGET_TYPE_TABS_STEP8_FIXED_START */
.budgetTypeTabs {
  display: flex;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 16px;
  padding: 6px;
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 14px;
  background: rgba(236, 253, 245, 0.9);
}
.budgetTypeTabs button {
  border: 0;
  border-radius: 10px;
  padding: 10px 16px;
  color: #065f53;
  background: transparent;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.budgetTypeTabs button.active {
  color: #fff;
  background: linear-gradient(135deg, #047857, #10b981);
  box-shadow: 0 7px 16px rgba(4, 120, 87, 0.2);
}
@media (max-width: 640px) {
  .budgetTypeTabs { width: 100%; }
  .budgetTypeTabs button { flex: 1; padding-inline: 8px; }
}
/* BUDGET_TYPE_TABS_STEP8_FIXED_END */

/* BUDGET_PAYMENTS_MOBILE_COMPACT_V1_START */
@media (max-width: 760px) {
  .paymentsPage {
    padding: 10px;
  }

  .budgetTypeTabs {
    gap: 5px;
    margin-bottom: 8px;
    padding: 4px;
    border-radius: 10px;
  }

  .budgetTypeTabs button {
    min-height: 34px;
    padding: 7px 8px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.15;
  }

  .pageHeader {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
  }

  .pageHeader h1 {
    font-size: 21px;
    line-height: 1.15;
  }

  .pageHeader p {
    margin-top: 3px;
    font-size: 11px;
    line-height: 1.3;
  }

  .pageHeader .reloadArea {
    display: grid;
    justify-items: end;
    gap: 4px;
  }

  .pageHeader .reloadArea small {
    max-width: 96px;
    font-size: 9px;
    line-height: 1.2;
    text-align: right;
  }

  .reloadButton {
    height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 11px;
  }

  .summaryGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-auto-rows: 1fr;
    gap: 8px;
    margin-top: 9px;
  }

  .summaryGrid article {
    display: grid;
    align-content: space-between;
    min-height: 82px;
    padding: 10px 11px;
    border-radius: 11px;
  }

  .summaryGrid span,
  .summaryGrid small {
    font-size: 9px;
    line-height: 1.25;
  }

  .summaryGrid strong {
    margin-top: 4px;
    font-size: 17px;
    line-height: 1.05;
  }

  .summaryGrid small {
    margin-top: 3px;
  }

  .projectPanel {
    margin-top: 9px;
    padding: 9px;
    border-radius: 11px;
  }

  .panelTop {
    gap: 8px;
  }

  .panelTop h2 {
    font-size: 18px;
    line-height: 1.15;
  }

  .panelTop p {
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.3;
  }

  .filterBar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    width: 100%;
  }

  .filterBar input,
  .filterBar select {
    min-width: 0;
    height: 34px;
    padding-inline: 8px;
    border-radius: 8px;
    font-size: 11px;
  }

  .tableHeader {
    display: none;
  }

  .projectList {
    gap: 7px;
    margin-top: 8px;
  }

  .projectCard {
    border-radius: 11px;
  }

  .projectRow {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 6px;
    align-items: start;
    padding: 8px;
    font-size: 11px;
    line-height: 1.18;
  }

  .indexCell {
    padding-top: 1px;
    font-size: 11px;
  }

  .projectName {
    grid-column: 2 / 3;
  }

  .projectName strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: 11.5px;
    line-height: 1.22;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .projectName small {
    margin-top: 2px;
    font-size: 9px;
    line-height: 1.2;
  }

  .amountCell,
  .countCell,
  .latestCell {
    display: none;
  }

  .actionCell {
    grid-column: 3 / 4;
    grid-row: 1 / span 2;
    display: grid;
    gap: 5px;
    justify-content: end;
  }

  .payButton,
  .historyButton {
    min-width: 68px;
    height: 28px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 11px;
  }

  .historyPanel {
    padding: 9px;
  }

  .historyHeader {
    gap: 7px;
  }

  .historyHeader h3 {
    font-size: 14px;
  }

  .historyHeader p {
    font-size: 10px;
    line-height: 1.25;
  }

  .historyHeader span {
    padding: 3px 7px;
    font-size: 10px;
  }

  .historyItem {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 6px 8px;
    padding: 8px;
    border-radius: 9px;
  }

  .historyNumber {
    width: 23px;
    height: 23px;
    font-size: 10px;
  }

  .historyDate,
  .historyDetails,
  .historyAmount,
  .historyEvidence,
  .historyAction {
    grid-column: 2;
    text-align: left;
  }

  .historyDate strong,
  .historyDetails strong,
  .historyAmount strong {
    font-size: 11px;
    line-height: 1.25;
  }

  .historyDate small,
  .historyDetails small,
  .historyAmount small {
    margin-top: 2px;
    font-size: 9px;
    line-height: 1.25;
  }

  .paymentPreview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    padding: 10px 10px 0;
  }

  .paymentPreview article {
    padding: 9px;
    border-radius: 9px;
  }

  .paymentPreview strong {
    margin-top: 3px;
    font-size: 15px;
  }
}

@media (min-width: 761px) and (max-width: 1180px) {
  .paymentsPage {
    overflow-x: clip;
  }

  .pageHeader {
    padding: 13px 15px;
  }

  .pageHeader,
  .panelTop,
  .projectPanel,
  .projectCard,
  .historyPanel,
  .paymentModal {
    min-width: 0;
  }

  .summaryGrid article {
    padding: 12px;
  }

  .projectPanel {
    padding: 12px;
  }

  .filterBar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .tableHeader,
  .projectRow {
    grid-template-columns:
      34px
      minmax(0, 1fr)
      minmax(82px, 96px)
      minmax(82px, 96px)
      minmax(86px, 100px)
      minmax(126px, auto);
    gap: 6px;
  }

  .tableHeader > div:nth-child(6),
  .tableHeader > div:nth-child(7),
  .countCell,
  .latestCell {
    display: none;
  }

  .actionCell {
    grid-column: auto;
    min-width: 0;
    justify-content: end;
  }

  .payButton,
  .historyButton {
    min-width: 58px;
    padding-inline: 9px;
    white-space: nowrap;
  }

  .projectName strong,
  .projectName small {
    min-width: 0;
  }

  .historyItem {
    grid-template-columns: 28px minmax(120px, 0.8fr) minmax(0, 1fr) minmax(96px, auto);
    gap: 8px;
  }

  .historyEvidence,
  .historyAction {
    min-width: 0;
  }

  .modalBackdrop {
    padding: 12px;
  }

  .paymentModal {
    width: min(700px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow: hidden;
  }

  .paymentModalBody {
    overflow-y: auto;
  }
}

@media (min-width: 761px) and (max-width: 900px) {
  .paymentsPage {
    padding-inline: 12px;
  }

  .pageHeader {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .summaryGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .tableHeader {
    display: none;
  }

  .projectRow {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 7px;
    align-items: start;
    padding: 9px;
  }

  .projectName {
    grid-column: 2 / 3;
  }

  .projectName strong {
    white-space: normal;
  }

  .amountCell,
  .countCell,
  .latestCell {
    display: none;
  }

  .actionCell {
    grid-column: 3 / 4;
    grid-row: 1 / span 2;
    display: grid;
    gap: 5px;
  }

  .payButton,
  .historyButton {
    min-width: 72px;
    height: 30px;
    font-size: 11px;
  }

  .historyItem {
    grid-template-columns: 26px minmax(0, 1fr);
  }

  .historyDate,
  .historyDetails,
  .historyAmount,
  .historyEvidence,
  .historyAction {
    grid-column: 2;
    text-align: left;
  }
}
/* BUDGET_PAYMENTS_MOBILE_COMPACT_V1_END */

/* FREE_EDUCATION_DARK_GREEN_THEME_STEP10_START */
.freeEducationTheme {
  --f15-green-950: #052e2b;
  --f15-green-900: #064e3b;
  --f15-green-800: #065f46;
  --f15-green-700: #047857;
  --f15-green-600: #059669;
  --f15-green-100: #d1fae5;
  --f15-green-50: #ecfdf5;
  background:
    radial-gradient(circle at top right, rgba(16, 185, 129, 0.13), transparent 30%),
    linear-gradient(180deg, #f4fbf7 0%, #e8f7ef 100%);
}

.freeEducationTheme .pageTop,
.freeEducationTheme .pageHeader {
  border-color: rgba(6, 78, 59, 0.28);
  background:
    linear-gradient(135deg, rgba(5, 46, 43, 0.98), rgba(6, 95, 70, 0.94));
  box-shadow: 0 16px 34px rgba(5, 46, 43, 0.18);
}

.freeEducationTheme .pageTop h2,
.freeEducationTheme .pageTop p,
.freeEducationTheme .pageHeader h1,
.freeEducationTheme .pageHeader p,
.freeEducationTheme .pageHeader small {
  color: #ffffff;
}

.freeEducationTheme .lastLoadedAt {
  color: rgba(255, 255, 255, 0.8);
}

.freeEducationTheme .createProjectButton,
.freeEducationTheme .reloadButton,
.freeEducationTheme .refreshButton,
.freeEducationTheme .payButton,
.freeEducationTheme .editProjectButton,
.freeEducationTheme .saveButton {
  border-color: #064e3b;
  color: #ffffff;
  background: linear-gradient(135deg, #064e3b, #047857);
  box-shadow: 0 8px 18px rgba(6, 78, 59, 0.23);
}

.freeEducationTheme .createProjectButton:hover,
.freeEducationTheme .reloadButton:hover,
.freeEducationTheme .refreshButton:hover,
.freeEducationTheme .payButton:hover,
.freeEducationTheme .editProjectButton:hover,
.freeEducationTheme .saveButton:hover {
  background: linear-gradient(135deg, #052e2b, #065f46);
}

.freeEducationTheme .summaryGrid article {
  border-color: rgba(6, 78, 59, 0.22);
  background: linear-gradient(160deg, #ffffff, #ecfdf5);
  box-shadow: 0 10px 24px rgba(6, 78, 59, 0.09);
}

.freeEducationTheme .summaryGrid article span,
.freeEducationTheme .summaryGrid article small {
  color: #065f46;
}

.freeEducationTheme .summaryGrid article strong {
  color: #052e2b;
}

.freeEducationTheme .filterCard,
.freeEducationTheme .dataCard,
.freeEducationTheme .projectCard,
.freeEducationTheme .paymentCard,
.freeEducationTheme .projectEditor,
.freeEducationTheme .paymentModal,
.freeEducationTheme .modalCard {
  border-color: rgba(6, 78, 59, 0.2);
  box-shadow: 0 12px 28px rgba(6, 78, 59, 0.1);
}

.freeEducationTheme .columnHeader {
  color: #ffffff;
  background: linear-gradient(135deg, #064e3b, #065f46);
}

.freeEducationTheme .projectCard.expandedCard,
.freeEducationTheme .projectCard:hover,
.freeEducationTheme .paymentCard:hover {
  border-color: #059669;
  box-shadow: 0 14px 30px rgba(6, 78, 59, 0.16);
}

.freeEducationTheme .projectMain b,
.freeEducationTheme .projectText b,
.freeEducationTheme .ownerCell b,
.freeEducationTheme .leadCell b,
.freeEducationTheme .amountCell b,
.freeEducationTheme .activityTitle b {
  color: #052e2b;
}

.freeEducationTheme .activityPanelTitle,
.freeEducationTheme .projectDetailNotice,
.freeEducationTheme .paymentSourceNotice {
  border-color: rgba(6, 78, 59, 0.2);
  background: #ecfdf5;
  color: #065f46;
}

.freeEducationTheme .editorHeader {
  background: linear-gradient(135deg, #052e2b, #065f46);
}

.freeEducationTheme .editorHeader h2,
.freeEducationTheme .editorHeader p,
.freeEducationTheme .editorClose {
  color: #ffffff;
}

.freeEducationTheme input:focus,
.freeEducationTheme select:focus,
.freeEducationTheme textarea:focus {
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.14);
}

.freeEducationTheme .budgetTypeTabs {
  border-color: rgba(6, 78, 59, 0.34);
  background: #d1fae5;
}

.freeEducationTheme .budgetTypeTabs button {
  color: #064e3b;
}

.freeEducationTheme .budgetTypeTabs button.active {
  background: linear-gradient(135deg, #052e2b, #047857);
  box-shadow: 0 8px 18px rgba(5, 46, 43, 0.26);
}

.freeEducationTheme .statusBadge.active,
.freeEducationTheme .statusBadge.payment,
.freeEducationTheme .budgetActive,
.freeEducationTheme .budgetComplete {
  color: #ffffff;
  background: #047857;
}

.freeEducationTheme .progressFill,
.freeEducationTheme .activityProgressFill,
.freeEducationTheme .timelineConnectorFlow {
  background: linear-gradient(90deg, #065f46, #10b981);
}


/* PAYMENTS_HEADER_HARMONIZED_THEME_START */
.paymentsPage .pageHeader {
  color: #f0fdf9;
  border-color: rgba(167, 243, 208, 0.55);
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
    linear-gradient(135deg, var(--neo-950) 0%, var(--neo-800) 54%, var(--neo-500) 100%);
  box-shadow: 0 14px 34px rgba(6, 78, 69, 0.18);
}

.paymentsPage .pageHeader h1,
.paymentsPage .pageHeader p,
.paymentsPage .pageHeader small {
  color: inherit;
}

.paymentsPage .pageHeader p,
.paymentsPage .pageHeader small {
  opacity: 0.9;
}

.paymentsPage .budgetTypeTabs {
  border-color: rgba(6, 78, 69, 0.24);
  background: var(--neo-50);
}

.paymentsPage .budgetTypeTabs button {
  color: var(--neo-800);
}

.paymentsPage .budgetTypeTabs button.active {
  background: linear-gradient(135deg, var(--neo-900), var(--neo-700));
  box-shadow: 0 8px 18px rgba(6, 78, 69, 0.22);
}

.freeEducationTheme .pageTop,
.freeEducationTheme .pageHeader {
  border-color: rgba(167, 243, 208, 0.48);
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.16), transparent 34%),
    linear-gradient(135deg, #052e2b 0%, #064e3b 56%, #047857 100%);
  box-shadow: 0 16px 34px rgba(5, 46, 43, 0.2);
}
/* PAYMENTS_HEADER_HARMONIZED_THEME_END */

/* BUDGET_PAYMENTS_AMBER_THEME_START */
.paymentsPage,
.paymentsPage.freeEducationTheme {
  --neo-950: #431407;
  --neo-900: #7c2d12;
  --neo-800: #9a3412;
  --neo-700: #c2410c;
  --neo-600: #ea580c;
  --neo-500: #f97316;
  --neo-400: #fb923c;
  --neo-300: #fdba74;
  --neo-200: #fed7aa;
  --neo-100: #ffedd5;
  --neo-50: #fff7ed;

  color: #1f2937;
  background:
    radial-gradient(circle at top right, rgba(251, 146, 60, 0.2), transparent 34rem),
    linear-gradient(180deg, #fffaf2 0%, #fff7ed 48%, #ffedd5 100%);
}

.paymentsPage .pageHeader,
.paymentsPage.freeEducationTheme .pageHeader,
.paymentsPage.freeEducationTheme .pageTop {
  color: #ffffff;
  border-color: rgba(253, 186, 116, 0.62);
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.22), transparent 34%),
    linear-gradient(135deg, #7c2d12 0%, #c2410c 56%, #f59e0b 100%);
  box-shadow: 0 16px 36px rgba(194, 65, 12, 0.2);
}

.paymentsPage .pageHeader h1,
.paymentsPage .pageHeader p,
.paymentsPage .pageHeader small,
.paymentsPage.freeEducationTheme .pageHeader h1,
.paymentsPage.freeEducationTheme .pageHeader p,
.paymentsPage.freeEducationTheme .pageHeader small {
  color: inherit;
}

.paymentsPage .reloadButton,
.paymentsPage .payButton,
.paymentsPage .paymentModal footer button[type="submit"],
.paymentsPage.freeEducationTheme .reloadButton,
.paymentsPage.freeEducationTheme .payButton,
.paymentsPage.freeEducationTheme .paymentModal footer button[type="submit"] {
  color: #ffffff;
  border-color: var(--neo-700);
  background: linear-gradient(135deg, var(--neo-700), #f59e0b);
  box-shadow: 0 8px 18px rgba(194, 65, 12, 0.22);
}

.paymentsPage .reloadButton:hover,
.paymentsPage .payButton:hover,
.paymentsPage .paymentModal footer button[type="submit"]:hover,
.paymentsPage.freeEducationTheme .reloadButton:hover,
.paymentsPage.freeEducationTheme .payButton:hover,
.paymentsPage.freeEducationTheme .paymentModal footer button[type="submit"]:hover {
  background: linear-gradient(135deg, var(--neo-900), var(--neo-600));
}

.paymentsPage .budgetTypeTabs,
.paymentsPage.freeEducationTheme .budgetTypeTabs {
  border-color: rgba(234, 88, 12, 0.24);
  background: #ffedd5;
}

.paymentsPage .budgetTypeTabs button,
.paymentsPage.freeEducationTheme .budgetTypeTabs button {
  color: var(--neo-900);
}

.paymentsPage .budgetTypeTabs button.active,
.paymentsPage.freeEducationTheme .budgetTypeTabs button.active {
  color: #ffffff;
  background: linear-gradient(135deg, var(--neo-900), var(--neo-600));
  box-shadow: 0 8px 18px rgba(194, 65, 12, 0.24);
}

.paymentsPage .summaryGrid article,
.paymentsPage .projectPanel,
.paymentsPage .projectCard,
.paymentsPage .historyPanel,
.paymentsPage .paymentModal,
.paymentsPage .paymentPreview article,
.paymentsPage .installmentHistory,
.paymentsPage .historyItem,
.paymentsPage .installmentItem,
.paymentsPage.freeEducationTheme .summaryGrid article,
.paymentsPage.freeEducationTheme .projectPanel,
.paymentsPage.freeEducationTheme .projectCard,
.paymentsPage.freeEducationTheme .historyPanel,
.paymentsPage.freeEducationTheme .paymentModal,
.paymentsPage.freeEducationTheme .paymentPreview article,
.paymentsPage.freeEducationTheme .installmentHistory,
.paymentsPage.freeEducationTheme .historyItem,
.paymentsPage.freeEducationTheme .installmentItem {
  border-color: rgba(234, 88, 12, 0.18);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(154, 52, 18, 0.09);
}

.paymentsPage .summaryGrid article,
.paymentsPage .paymentPreview article,
.paymentsPage.freeEducationTheme .summaryGrid article,
.paymentsPage.freeEducationTheme .paymentPreview article {
  background: linear-gradient(180deg, #ffffff 0%, #fff7ed 100%);
}

.paymentsPage .summaryGrid span,
.paymentsPage .summaryGrid small,
.paymentsPage .panelTop p,
.paymentsPage .projectName small,
.paymentsPage .historyDate small,
.paymentsPage .historyDetails small,
.paymentsPage .historyAmount small,
.paymentsPage.freeEducationTheme .summaryGrid span,
.paymentsPage.freeEducationTheme .summaryGrid small,
.paymentsPage.freeEducationTheme .panelTop p,
.paymentsPage.freeEducationTheme .projectName small,
.paymentsPage.freeEducationTheme .historyDate small,
.paymentsPage.freeEducationTheme .historyDetails small,
.paymentsPage.freeEducationTheme .historyAmount small {
  color: var(--neo-800);
}

.paymentsPage .summaryGrid strong,
.paymentsPage .panelTop h2,
.paymentsPage .projectName strong,
.paymentsPage .historyHeader h3,
.paymentsPage .paymentModal h2,
.paymentsPage .installmentHistoryHeader h3,
.paymentsPage.freeEducationTheme .summaryGrid strong,
.paymentsPage.freeEducationTheme .panelTop h2,
.paymentsPage.freeEducationTheme .projectName strong,
.paymentsPage.freeEducationTheme .historyHeader h3,
.paymentsPage.freeEducationTheme .paymentModal h2,
.paymentsPage.freeEducationTheme .installmentHistoryHeader h3 {
  color: #431407;
}

.paymentsPage .filterBar input,
.paymentsPage .filterBar select,
.paymentsPage .formGrid input,
.paymentsPage .formGrid select,
.paymentsPage .formGrid textarea,
.paymentsPage .evidenceField,
.paymentsPage.freeEducationTheme .filterBar input,
.paymentsPage.freeEducationTheme .filterBar select,
.paymentsPage.freeEducationTheme .formGrid input,
.paymentsPage.freeEducationTheme .formGrid select,
.paymentsPage.freeEducationTheme .formGrid textarea,
.paymentsPage.freeEducationTheme .evidenceField {
  color: #431407;
  border-color: var(--neo-300);
  background: #fffaf2;
}

.paymentsPage .filterBar input:focus,
.paymentsPage .filterBar select:focus,
.paymentsPage .formGrid input:focus,
.paymentsPage .formGrid select:focus,
.paymentsPage .formGrid textarea:focus,
.paymentsPage.freeEducationTheme .filterBar input:focus,
.paymentsPage.freeEducationTheme .filterBar select:focus,
.paymentsPage.freeEducationTheme .formGrid input:focus,
.paymentsPage.freeEducationTheme .formGrid select:focus,
.paymentsPage.freeEducationTheme .formGrid textarea:focus {
  border-color: var(--neo-500);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
  outline: none;
}

.paymentsPage .tableHeader,
.paymentsPage .historyHeader,
.paymentsPage .installmentHistoryHeader,
.paymentsPage .paymentModal > header,
.paymentsPage.freeEducationTheme .tableHeader,
.paymentsPage.freeEducationTheme .historyHeader,
.paymentsPage.freeEducationTheme .installmentHistoryHeader,
.paymentsPage.freeEducationTheme .paymentModal > header {
  color: #431407;
  border-color: var(--neo-200);
  background: linear-gradient(180deg, #ffedd5, #fed7aa);
}

.paymentsPage .projectCard:hover,
.paymentsPage.freeEducationTheme .projectCard:hover {
  border-color: var(--neo-400);
  box-shadow: 0 14px 30px rgba(154, 52, 18, 0.14);
}

.paymentsPage .projectCardHighlighted,
.paymentsPage.freeEducationTheme .projectCardHighlighted {
  border-color: var(--neo-500);
  background: linear-gradient(180deg, #fffaf2 0%, #ffedd5 100%);
  box-shadow:
    0 0 0 2px rgba(249, 115, 22, 0.16),
    0 16px 34px rgba(154, 52, 18, 0.14);
}

.paymentsPage .historyButton,
.paymentsPage .paymentModal > header button,
.paymentsPage.freeEducationTheme .historyButton,
.paymentsPage.freeEducationTheme .paymentModal > header button {
  color: var(--neo-900);
  border-color: var(--neo-300);
  background: #ffedd5;
}

.paymentsPage .historyButton:hover,
.paymentsPage .paymentModal > header button:hover,
.paymentsPage.freeEducationTheme .historyButton:hover,
.paymentsPage.freeEducationTheme .paymentModal > header button:hover {
  border-color: var(--neo-500);
  background: #fed7aa;
}

.paymentsPage .modalBackdrop,
.paymentsPage.freeEducationTheme .modalBackdrop {
  background: rgba(67, 20, 7, 0.58);
  backdrop-filter: blur(5px);
}

.paymentsPage .progressFill,
.paymentsPage .activityProgressFill,
.paymentsPage .timelineConnectorFlow,
.paymentsPage.freeEducationTheme .progressFill,
.paymentsPage.freeEducationTheme .activityProgressFill,
.paymentsPage.freeEducationTheme .timelineConnectorFlow {
  background: linear-gradient(90deg, var(--neo-700), #f59e0b);
}
/* BUDGET_PAYMENTS_AMBER_THEME_END */

/* BUDGET_PAYMENTS_FLUID_VIEWPORT_FIX_START */
.paymentsPage,
.paymentsPage *,
.paymentsPage *::before,
.paymentsPage *::after {
  box-sizing: border-box;
}

.paymentsPage,
.paymentsPage.freeEducationTheme {
  width: 100%;
  min-width: 0;
  overflow-x: clip;
  padding-inline: clamp(10px, 1.6vw, 20px);
}

.paymentsPage .pageHeader,
.paymentsPage .pageHeader > div,
.paymentsPage .reloadArea,
.paymentsPage .summaryGrid article,
.paymentsPage .projectPanel,
.paymentsPage .panelTop,
.paymentsPage .filterBar,
.paymentsPage .projectCard,
.paymentsPage .projectRow,
.paymentsPage .tableHeader,
.paymentsPage .historyPanel {
  min-width: 0;
}

.paymentsPage .pageHeader,
.paymentsPage .panelTop {
  flex-wrap: wrap;
}

.paymentsPage .pageHeader > div:first-child,
.paymentsPage .panelTop > div:first-child {
  flex: 1 1 320px;
}

.paymentsPage .reloadArea {
  flex: 0 1 auto;
  max-width: 100%;
}

.paymentsPage .filterBar {
  width: 100%;
  max-width: none;
  grid-template-columns:
    minmax(220px, 1.6fr)
    minmax(118px, 0.7fr)
    minmax(130px, 0.75fr)
    minmax(130px, 0.75fr);
}

.paymentsPage .tableHeader,
.paymentsPage .projectRow {
  width: 100%;
  max-width: 100%;
  grid-template-columns:
    32px
    minmax(260px, 2.35fr)
    minmax(80px, 0.56fr)
    minmax(80px, 0.56fr)
    minmax(84px, 0.6fr)
    minmax(52px, 0.36fr)
    minmax(86px, 0.55fr)
    minmax(112px, 0.78fr);
  gap: 6px;
}

.paymentsPage .tableHeader > div,
.paymentsPage .projectRow > div,
.paymentsPage .projectName,
.paymentsPage .actionCell {
  min-width: 0;
}

.paymentsPage .projectName strong {
  white-space: normal;
  overflow-wrap: anywhere;
}

.paymentsPage .projectName small {
  max-width: 100%;
}

.paymentsPage .actionCell {
  flex-wrap: wrap;
  align-items: center;
}

.paymentsPage .payButton,
.paymentsPage .historyButton {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
  line-height: 1.15;
}

@media (min-width: 1181px) and (max-width: 1360px) {
  .paymentsPage .tableHeader,
  .paymentsPage .projectRow {
    grid-template-columns:
      30px
      minmax(230px, 2.15fr)
      minmax(72px, 0.48fr)
      minmax(72px, 0.48fr)
      minmax(76px, 0.5fr)
      minmax(44px, 0.3fr)
      minmax(78px, 0.48fr)
      minmax(100px, 0.68fr);
  }

  .paymentsPage .projectRow,
  .paymentsPage .projectName strong,
  .paymentsPage .amountCell strong,
  .paymentsPage .countCell,
  .paymentsPage .latestCell,
  .paymentsPage .payButton,
  .paymentsPage .historyButton {
    font-size: 11.5px;
  }

  .paymentsPage .amountCell span,
  .paymentsPage .projectName small {
    font-size: 9.5px;
  }
}

@media (min-width: 761px) and (max-width: 1180px) {
  .paymentsPage .filterBar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .paymentsPage .tableHeader,
  .paymentsPage .projectRow {
    grid-template-columns:
      28px
      minmax(220px, 2fr)
      minmax(74px, 0.55fr)
      minmax(74px, 0.55fr)
      minmax(86px, 0.62fr)
      minmax(108px, 0.76fr);
  }

  .paymentsPage .tableHeader > div:nth-child(6),
  .paymentsPage .tableHeader > div:nth-child(7),
  .paymentsPage .projectRow > .countCell,
  .paymentsPage .projectRow > .latestCell {
    display: none;
  }

  .paymentsPage .projectRow,
  .paymentsPage .projectName strong,
  .paymentsPage .amountCell strong,
  .paymentsPage .payButton,
  .paymentsPage .historyButton {
    font-size: 11.5px;
  }

  .paymentsPage .actionCell {
    justify-content: end;
  }
}

@media (max-width: 760px) {
  .paymentsPage,
  .paymentsPage.freeEducationTheme {
    overflow-x: clip;
  }

  .paymentsPage .filterBar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .paymentsPage .projectRow {
    grid-template-columns: 24px minmax(0, 1fr) auto;
  }

  .paymentsPage .projectName strong {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
/* BUDGET_PAYMENTS_FLUID_VIEWPORT_FIX_END */

/* BUDGET_PAYMENTS_TABLE_REGULAR_TEXT_START */
.paymentsPage .projectRow .projectName strong,
.paymentsPage .projectRow .amountCell strong,
.paymentsPage .projectRow .countCell,
.paymentsPage .projectRow .latestCell,
.paymentsPage.freeEducationTheme .projectRow .projectName strong,
.paymentsPage.freeEducationTheme .projectRow .amountCell strong,
.paymentsPage.freeEducationTheme .projectRow .countCell,
.paymentsPage.freeEducationTheme .projectRow .latestCell {
  font-weight: 400;
}
/* BUDGET_PAYMENTS_TABLE_REGULAR_TEXT_END */

/* FREE_EDUCATION_DARK_GREEN_THEME_STEP10_END */
`}

</style>
    </main>
  );
}







