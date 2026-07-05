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
  }, [projects, query, statusFilter, paymentFilter, sortMode, paymentSummaryByProject]);

  const totals = useMemo(() => {
    const budget = projects.reduce(
      (sum, project) => sum + effectiveProjectBudget(project),
      0,
    );
    const paid = projects.reduce(
      (sum, project) =>
        sum + (paymentSummaryByProject.get(project.id)?.total ?? 0),
      0,
    );

    return {
      projectCount: projects.length,
      activityCount: projects.reduce(
        (sum, project) => sum + project.activities.length,
        0,
      ),
      budget,
      paid,
      remaining: budget - paid,
    };
  }, [projects, paymentSummaryByProject]);

  function openPayment(project: BudgetProjectListItem) {
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
      setMessage("บันทึกรายการจ่ายเรียบร้อยแล้ว");
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
      setMessage("กำหนดโครงการเป็นเสร็จสิ้นแล้ว");
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
  const canPay = Boolean(
    currentUser?.canFinance || currentUser?.canManageAll
  );


  if (loading) {
    return <main className="stateBox">กำลังโหลดข้อมูลเบิกจ่าย...</main>;
  }

  return (
    <main className="paymentsPage">
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
              currentUser?.canFinance || currentUser?.canManageAll;

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
                  payingPaid > 0 &&
                  payingProject.status !== "เสร็จสิ้น" && (
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
`}

</style>
    </main>
  );
}







