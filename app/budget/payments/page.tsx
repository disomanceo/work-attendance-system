"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Project = {
  id: string;
  legacyId: string;
  code: string;
  name: string;
  budget: number;
  spent: number;
  status: string;
  department: string;
  owner: string;
  lead: string;
};

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

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const id =
    readText(item.SupabaseID) ||
    readText(item.supabaseId) ||
    readText(item.supabase_id) ||
    readText(item.ID) ||
    readText(item.id) ||
    readText(item.ProjectID) ||
    readText(item.projectId) ||
    readText(item.project_id) ||
    readText(item.Code) ||
    readText(item.code) ||
    readText(item["รหัสโครงการ"]);

  const name =
    readText(item.ProjectName) ||
    readText(item.projectName) ||
    readText(item.project_name) ||
    readText(item.Name) ||
    readText(item.name) ||
    readText(item.Title) ||
    readText(item.title) ||
    readText(item["ชื่อโครงการ"]);

  if (!id || !name) return null;

  return {
    id,
    legacyId:
      readText(item.ID) ||
      readText(item.legacy_project_id) ||
      id,
    code:
      readText(item.ProjectCode) ||
      readText(item.projectCode) ||
      readText(item.project_code) ||
      readText(item.ID) ||
      id,
    name,
    status:
      readText(item.Status) ||
      readText(item.status) ||
      "ยังไม่เริ่ม",
    spent:
      readNumber(item.SpentBudget) ||
      readNumber(item.spentBudget),
    department:
      readText(item.Department) ||
      readText(item.department) ||
      readText(item.PlanName) ||
      readText(item.planName) ||
      readText(item["แผนงาน"]) ||
      readText(item["หน่วยงาน"]) ||
      "-",
    owner:
      readText(item.Department) ||
      readText(item.department) ||
      "-",
    lead:
      readText(item.OwnerName) ||
      readText(item.ownerName) ||
      readText(item.owner) ||
      "-",
    budget:
      readNumber(item.ApprovedBudget) ||
      readNumber(item.approvedBudget),
  };
}

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

  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [requesterOptions, setRequesterOptions] = useState<RequesterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [query, setQuery] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState("");
  const [payingProject, setPayingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState("");
  const [paymentPeriod, setPaymentPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [requesterId, setRequesterId] = useState("");

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

      const mappedProjects = (projectsResult.projects ?? [])
        .map(mapProject)
        .filter((project): project is Project => Boolean(project))
        .sort((a, b) =>
          a.code.localeCompare(b.code, "th", {
            numeric: true,
            sensitivity: "base",
          })
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
      const mappedProjects = cachedProjects.value
        .map(mapProject)
        .filter((project): project is Project => Boolean(project))
        .sort((a, b) =>
          a.code.localeCompare(b.code, "th", {
            numeric: true,
            sensitivity: "base",
          })
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
  }, [activePayments]);

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return projects
      .filter(
        (project) =>
          !keyword ||
          project.name.toLowerCase().includes(keyword) ||
          project.code.toLowerCase().includes(keyword) ||
          project.department.toLowerCase().includes(keyword) ||
          project.owner.toLowerCase().includes(keyword) ||
          project.lead.toLowerCase().includes(keyword) ||
          project.legacyId.toLowerCase().includes(keyword)
      )
      .sort((a, b) =>
        a.code.localeCompare(b.code, "th", {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [projects, query]);

  const totals = useMemo(() => {
    const budget = projects.reduce((sum, project) => sum + project.budget, 0);
    const paid = activePayments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0
    );
    const overBudgetProjects = projects.filter((project) => {
      const summary = paymentSummaryByProject.get(project.id);
      return project.budget - (summary?.total ?? 0) < 0;
    }).length;

    return {
      projectCount: projects.length,
      budget,
      paid,
      remaining: budget - paid,
      overBudgetProjects,
    };
  }, [projects, activePayments, paymentSummaryByProject]);

  function openPayment(project: Project) {
    const existingActivePayments = payments.filter(
      (payment) =>
        payment.project_id === project.id &&
        payment.status === "active"
    );
    const nextInstallment = existingActivePayments.length + 1;

    setPayingProject(project);
    setDetails("");
    setPaymentPeriod(`งวดที่ ${nextInstallment}`);
    setAmount("");
    setNote("");
    setEvidence(null);
    setRequesterId("");
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

    const currentSummary = paymentSummaryByProject.get(payingProject.id);
    const nextRemaining =
      payingProject.budget - (currentSummary?.total ?? 0) - numericAmount;

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

  async function completeProject(project: Project) {
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

  const payingSummary = payingProject
    ? paymentSummaryByProject.get(payingProject.id)
    : null;
  const payingPaid = payingSummary?.total ?? 0;
  const payingAmount = Number(amount);
  const payingNextPaid =
    payingPaid + (Number.isFinite(payingAmount) ? payingAmount : 0);
  const payingNextRemaining = payingProject
    ? payingProject.budget - payingNextPaid
    : 0;
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
          <h1>เบิกจ่าย</h1>
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
          <span>จำนวนโครงการ</span>
          <strong>{totals.projectCount}</strong>
          <small>โครงการ</small>
        </article>
        <article>
          <span>จ่ายสะสม</span>
          <strong>{money(totals.paid)}</strong>
          <small>บาท</small>
        </article>
        <article>
          <span>คงเหลือรวม</span>
          <strong className={totals.remaining < 0 ? "negative" : ""}>
            {money(totals.remaining)}
          </strong>
          <small>บาท</small>
        </article>
        <article>
          <span>โครงการเกินงบ</span>
          <strong className={totals.overBudgetProjects > 0 ? "negative" : ""}>
            {totals.overBudgetProjects}
          </strong>
          <small>โครงการ</small>
        </article>
      </section>

      <section className="projectPanel">
        <div className="panelTop">
          <div>
            <h2>รายการโครงการทั้งหมด</h2>
            <p>กดเบิกจ่ายที่โครงการที่ต้องการ หรือเปิดดูประวัติย้อนหลัง</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาโครงการ รหัส หรือแผนงาน..."
          />
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
            const remaining = project.budget - summary.total;
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
                      เลขทะเบียน {project.code} · {project.owner}
                      {project.lead !== "-" ? ` · ${project.lead}` : ""}
                    </small>
                  </div>
                  <div className="amountCell">
                    <span>งบจัดสรร</span>
                    <strong>{money(project.budget)}</strong>
                  </div>
                  <div className="amountCell">
                    <span>จ่ายสะสม</span>
                    <strong>{money(summary.total)}</strong>
                  </div>
                  <div className="amountCell">
                    <span>คงเหลือ</span>
                    <strong className={remaining < 0 ? "negative" : "positive"}>
                      {money(remaining)}
                    </strong>
                    {remaining < 0 && <em>เกินงบ</em>}
                  </div>
                  <div className="countCell">
                    <span>{summary.count} ครั้ง</span>
                    <small
                      className={
                        project.status === "เสร็จสิ้น"
                          ? "statusDone"
                          : summary.total > 0
                            ? "statusProgress"
                            : "statusPending"
                      }
                    >
                      {project.status === "เสร็จสิ้น"
                        ? "เสร็จสิ้น"
                        : summary.total > 0
                          ? "กำลังดำเนินการ"
                          : "ยังไม่เริ่ม"}
                    </small>
                  </div>
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
                              <strong>{payment.details}</strong>
                              <small>
                                งวดที่จ่าย: {payment.payment_period || "-"}
                              </small>
                              {payment.note && (
                                <small>หมายเหตุ: {payment.note}</small>
                              )}
                            </div>
                            <div className="historyAmount">
                              <strong>{money(payment.amount)} บาท</strong>
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
        <div className="modalBackdrop" onClick={closePayment}>
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

            <div className="paymentPreview">
              <article>
                <span>งบจัดสรร</span>
                <strong>{money(payingProject.budget)}</strong>
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
                  <h3>งวดการจ่ายของโครงการนี้</h3>
                  <p>
                    ใช้ข้อมูลเดิมเป็นหลักฐานอ้างอิงก่อนเพิ่มงวดใหม่
                  </p>
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
                        <small>{payment.details}</small>
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
              <label className="fullField">
                <span>ผู้เบิกจ่าย *</span>
                <select
                  value={requesterId}
                  onChange={(event) => setRequesterId(event.target.value)}
                >
                  <option value="">เลือกผู้เบิกจ่าย</option>
                  {requesterOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                      {person.position ? ` · ${person.position}` : ""}
                    </option>
                  ))}
                </select>
                <small>
                  แสดงเฉพาะบุคลากรที่มีสิทธิ์งานพัสดุ การเงิน ผู้เบิกจ่าย
                  ผอ. หรือ Admin
                </small>
              </label>

              <label className="fullField">
                <span>รายละเอียด *</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="ระบุรายละเอียดรายการจ่าย"
                  rows={3}
                />
              </label>

              <label>
                <span>งวดที่จ่าย *</span>
                <input
                  value={paymentPeriod}
                  onChange={(event) => setPaymentPeriod(event.target.value)}
                  placeholder="เช่น งวดที่ 2"
                />
                <small>
                  ระบบกำหนดงวดถัดไปจากจำนวนรายการเดิมให้อัตโนมัติ
                </small>
              </label>

              <label>
                <span>จำนวนเงิน (บาท) *</span>
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
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(event) =>
                    setEvidence(event.target.files?.[0] ?? null)
                  }
                />
                <small>ไม่บังคับ ขนาดไม่เกิน 10 MB</small>
              </label>

              <label>
                <span>วันที่และเวลา</span>
                <input value="ระบบประทับเวลา ณ วันที่บันทึก" disabled />
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

        .pageHeader h1 {
          font-size: 28px;
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
          padding: 16px;
          border: 1px solid #dfe4ec;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 4px 14px rgba(30, 41, 59, 0.05);
        }

        .summaryGrid span,
        .summaryGrid small {
          color: #667085;
          font-size: 12px;
        }

        .summaryGrid strong {
          display: block;
          margin: 7px 0 2px;
          font-size: 23px;
        }

        .projectPanel {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid #dfe4ec;
          border-radius: 15px;
          background: #fff;
        }

        .panelTop input {
          width: min(360px, 100%);
          height: 38px;
          padding: 0 11px;
          border: 1px solid #cfd6e2;
          border-radius: 9px;
          outline: none;
        }

        .tableHeader,
        .projectRow {
          display: grid;
          grid-template-columns:
            44px minmax(250px, 1.6fr) repeat(3, minmax(120px, 0.75fr))
            95px minmax(150px, 0.9fr) 170px;
          gap: 8px;
          align-items: center;
        }

        .tableHeader {
          margin-top: 14px;
          padding: 9px 10px;
          border-radius: 9px;
          color: #475467;
          background: #f2f4f7;
          font-size: 11px;
          font-weight: 800;
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

        .projectName {
          min-width: 0;
        }

        .projectName strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .projectName small,
        .amountCell span {
          display: block;
          margin-top: 3px;
          color: #98a2b3;
          font-size: 10px;
        }

        .amountCell strong,
        .countCell,
        .latestCell {
          font-size: 13px;
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
          height: 34px;
          padding: 0 10px;
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
          padding: 5px 9px;
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

        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.6);
        }

        .paymentModal {
          width: min(720px, 100%);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3);
          overflow: hidden;
        }

        .paymentModal header {
          padding: 14px 16px;
          border-bottom: 1px solid #e1e6ee;
          background: #faf7ff;
        }

        .paymentModal header button {
          width: 32px;
          height: 32px;
          border: 2px solid #dc2626;
          border-radius: 50%;
          color: #fff;
          background: #dc2626;
          font-size: 19px;
          font-weight: 900;
          cursor: pointer;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 16px;
        }

        .formGrid label span {
          display: block;
          margin-bottom: 5px;
          color: #344054;
          font-size: 12px;
          font-weight: 800;
        }

        .formGrid input,
        .formGrid textarea,
        .formGrid select {
          width: 100%;
          padding: 9px 10px;
          border: 1px solid #cfd6e2;
          border-radius: 9px;
          color: #172033;
          background: #fff;
          outline: none;
          box-sizing: border-box;
        }

        .formGrid input {
          height: 39px;
        }

        .formGrid input:disabled {
          color: #667085;
          background: #eef1f5;
        }

        .formGrid small {
          display: block;
          margin-top: 4px;
          color: #98a2b3;
          font-size: 10px;
        }

        .fullField {
          grid-column: 1 / -1;
        }

        .paymentModal footer {
          padding: 12px 16px;
          border-top: 1px solid #e1e6ee;
        }

        .cancelButton,
        .saveButton {
          min-width: 120px;
          height: 38px;
          border-radius: 9px;
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

        .pageHeader h1,
        .panelTop h2,
        .historyHeader h3,
        .paymentModal h2 {
          color: #5b3a16;
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

        .paymentPreview article {
          border-color: #ead7a1;
          background: linear-gradient(180deg, #fffaf0, #fff7df);
        }

        .paymentPreview strong {
          color: #6f4e21;
        }

        .installmentHistory {
          margin: 14px 18px 0;
          padding: 14px;
          border: 1px solid #ead7a1;
          border-radius: 12px;
          background: linear-gradient(180deg, #fffdf7, #fff8e8);
        }

        .installmentHistoryHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .installmentHistoryHeader h3 {
          margin: 0;
          color: #5b3a16;
          font-size: 15px;
        }

        .installmentHistoryHeader p {
          margin: 4px 0 0;
          color: #8a6a42;
          font-size: 12px;
        }

        .installmentHistoryHeader > strong {
          flex: 0 0 auto;
          padding: 5px 9px;
          border-radius: 999px;
          color: #6f4e21;
          background: #f5df9c;
          font-size: 12px;
        }

        .installmentList {
          display: grid;
          gap: 8px;
          max-height: 210px;
          overflow-y: auto;
        }

        .installmentItem {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 9px 10px;
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
          width: 28px;
          height: 28px;
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
          padding: 13px;
          border: 1px dashed #d7b75f;
          border-radius: 10px;
          color: #8a6a42;
          background: #fffdf7;
          text-align: center;
          font-size: 12px;
        }

        .paymentModal footer {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .footerLeft {
          margin-right: auto;

          .installmentItem {
            grid-template-columns: 28px minmax(0, 1fr);
          }

          .installmentAmount {
            grid-column: 2;
            text-align: left;
          }

          .paymentModal footer {
            flex-wrap: wrap;
          }

          .footerLeft {
            width: 100%;
            margin-right: 0;
          }

          .footerLeft .completeButton {
            width: 100%;
          }

        }

      `}</style>
    </main>
  );
}







