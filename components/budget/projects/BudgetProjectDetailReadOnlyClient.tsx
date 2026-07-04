"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  mapBudgetProjectDetail,
  type BudgetProjectDetailItem,
} from "@/lib/budget/project-detail-mapper";

type ApiResult = {
  ok?: boolean;
  configured?: boolean;
  project?: unknown;
  message?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatThaiDate(value?: string) {
  const raw = value?.trim();
  if (!raw) return "-";

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = dateOnly
    ? new Date(`${raw}T00:00:00+07:00`)
    : new Date(raw);

  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function percent(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export default function BudgetProjectDetailReadOnlyClient({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] =
    useState<BudgetProjectDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(
          `/api/budget/projects/${encodeURIComponent(projectId)}`,
          { cache: "no-store" }
        );
        const result = (await response.json()) as ApiResult;

        if (!active) return;

        setConfigured(result.configured !== false);

        if (!response.ok || !result.ok || !result.project) {
          setMessage(
            result.message || "ไม่สามารถโหลดรายละเอียดโครงการได้"
          );
          return;
        }

        setProject(mapBudgetProjectDetail(result.project));
      } catch (error) {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดรายละเอียดโครงการได้"
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [projectId]);

  if (loading) {
    return <section className="stateBox">กำลังโหลดรายละเอียดโครงการ...</section>;
  }

  if (message || !project) {
    return (
      <section className="stateBox warningBox">
        <h2>
          {configured
            ? "ไม่สามารถเปิดรายละเอียดโครงการ"
            : "ยังไม่ได้ตั้งค่าการเชื่อมต่อ"}
        </h2>
        <p>{message || "ไม่พบข้อมูลโครงการ"}</p>
        {!configured && <code>BUDGET_GAS_WEB_APP_URL</code>}
        <Link href="/budget/projects">กลับรายการโครงการ</Link>
      </section>
    );
  }

  const remaining = project.budget - project.spent;
  const used = percent(project.spent, project.budget);

  return (
    <div className="detailRoot">
      <div className="topActions">
        <Link href="/budget/projects">← กลับรายการโครงการ</Link>
        <span>โหมดอ่านอย่างเดียว</span>
      </div>

      <section className="hero">
        <div>
          <span className="code">{project.id || "ไม่มีรหัส"}</span>
          <h2>{project.name}</h2>
          <p>{project.objective}</p>
        </div>
        <span className="status">{project.status}</span>
      </section>

      <section className="infoGrid">
        <article>
          <span>หน่วยงาน</span>
          <b>{project.owner}</b>
        </article>
        <article>
          <span>ผู้รับผิดชอบ</span>
          <b>{project.lead}</b>
        </article>
        <article>
          <span>กลุ่มเป้าหมาย</span>
          <b>{project.targetGroup}</b>
        </article>
        <article>
          <span>แหล่งงบประมาณ</span>
          <b>{project.budgetSource}</b>
        </article>
        <article>
          <span>วันเริ่มต้น</span>
          <b>{formatThaiDate(project.startDate)}</b>
        </article>
        <article>
          <span>วันสิ้นสุด</span>
          <b>{formatThaiDate(project.due)}</b>
        </article>
      </section>

      <section className="financeGrid">
        <article>
          <span>งบประมาณ</span>
          <strong>{money(project.budget)} บาท</strong>
        </article>
        <article>
          <span>ใช้ไป</span>
          <strong>{money(project.spent)} บาท</strong>
        </article>
        <article>
          <span>คงเหลือ</span>
          <strong>{money(remaining)} บาท</strong>
        </article>
        <article>
          <span>สัดส่วนการใช้</span>
          <strong>{used}%</strong>
        </article>
      </section>

      <section className="progressCard">
        <div>
          <span>ความคืบหน้าการใช้งบประมาณ</span>
          <b>{used}%</b>
        </div>
        <div className="track">
          <span style={{ width: `${used}%` }} />
        </div>
      </section>

      <section className="activitiesCard">
        <header>
          <div>
            <h3>กิจกรรมภายใต้โครงการ</h3>
            <p>{project.activities.length} กิจกรรม</p>
          </div>
        </header>

        {project.activities.length === 0 ? (
          <div className="empty">ยังไม่พบข้อมูลกิจกรรม</div>
        ) : (
          <div className="activityList">
            {project.activities.map((activity, index) => (
              <article key={activity.id || `${project.id}-${index}`}>
                <div className="number">{index + 1}</div>
                <div className="activityMain">
                  <span>{activity.id || "ไม่มีรหัสกิจกรรม"}</span>
                  <h4>{activity.name}</h4>
                  <p>
                    ผู้รับผิดชอบ: {activity.lead} · แหล่งงบ:{" "}
                    {activity.budgetSource || "-"}
                  </p>
                </div>
                <div>
                  <span>งบประมาณ</span>
                  <b>{money(activity.budget)} บาท</b>
                </div>
                <div>
                  <span>ใช้ไป</span>
                  <b>{money(activity.spent)} บาท</b>
                </div>
                <span className="activityStatus">{activity.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="attachmentsCard">
        <header>
          <h3>เอกสารแนบ</h3>
          <span>{project.attachments.length} ไฟล์</span>
        </header>

        {project.attachments.length === 0 ? (
          <div className="empty">ยังไม่มีเอกสารแนบ</div>
        ) : (
          <div className="fileList">
            {project.attachments.map((file) => (
              <a
                key={file.id || file.url}
                href={file.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>▦</span>
                <div>
                  <b>{file.name}</b>
                  <small>{file.mimeType || "ไฟล์เอกสาร"}</small>
                </div>
                <strong>เปิดไฟล์ ↗</strong>
              </a>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .detailRoot { display: grid; gap: 16px; }
        .stateBox {
          padding: 28px; border: 1px solid #dcfce7; border-radius: 18px;
          background: #fff; color: #4b5563; text-align: center;
        }
        .warningBox { border-color: #fde68a; background: #fffbeb; }
        .warningBox h2 { margin: 0; color: #92400e; }
        .warningBox p, .warningBox code, .warningBox a {
          display: block; margin-top: 10px;
        }
        .warningBox a { color: #166534; font-weight: 800; }
        .topActions {
          display: flex; justify-content: space-between; gap: 12px;
          color: #6b7280; font-size: 12px;
        }
        .topActions a { color: #166534; font-weight: 800; text-decoration: none; }
        .hero {
          display: flex; justify-content: space-between; gap: 18px;
          padding: 24px; border: 1px solid #bbf7d0; border-radius: 20px;
          background: linear-gradient(135deg,#f0fdf4,#fff);
        }
        .code {
          display: inline-flex; padding: 5px 10px; border-radius: 999px;
          color: #166534; background: #dcfce7; font-size: 11px; font-weight: 900;
        }
        .hero h2 { margin: 10px 0 0; color: #14532d; font-size: 26px; }
        .hero p { max-width: 850px; margin: 10px 0 0; color: #4b5563; line-height: 1.7; }
        .status {
          align-self: flex-start; padding: 7px 12px; border-radius: 999px;
          color: #166534; background: #dcfce7; font-size: 12px; font-weight: 900;
          white-space: nowrap;
        }
        .infoGrid, .financeGrid {
          display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px;
        }
        .infoGrid article, .financeGrid article, .progressCard,
        .activitiesCard, .attachmentsCard {
          border: 1px solid #e5e7eb; border-radius: 16px; background: #fff;
        }
        .infoGrid article, .financeGrid article { padding: 16px; }
        .infoGrid span, .financeGrid span, .activityList article > div > span {
          display: block; color: #6b7280; font-size: 11px;
        }
        .infoGrid b, .activityList article > div > b {
          display: block; margin-top: 6px; color: #1f2937; font-size: 13px;
        }
        .financeGrid strong {
          display: block; margin-top: 7px; color: #166534; font-size: 20px;
        }
        .progressCard { padding: 18px; }
        .progressCard > div:first-child {
          display: flex; justify-content: space-between; color: #6b7280; font-size: 12px;
        }
        .progressCard b { color: #166534; }
        .track {
          height: 10px; margin-top: 9px; overflow: hidden; border-radius: 999px;
          background: #e5e7eb;
        }
        .track span {
          display: block; height: 100%; border-radius: inherit;
          background: linear-gradient(90deg,#22c55e,#15803d);
        }
        .activitiesCard, .attachmentsCard { overflow: hidden; }
        .activitiesCard header, .attachmentsCard header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 18px 20px; border-bottom: 1px solid #e5e7eb;
        }
        .activitiesCard h3, .attachmentsCard h3 { margin: 0; color: #1f2937; }
        .activitiesCard header p { margin: 5px 0 0; color: #6b7280; font-size: 12px; }
        .attachmentsCard header span { color: #6b7280; font-size: 12px; }
        .activityList article {
          display: grid;
          grid-template-columns: 34px minmax(220px,1fr) 130px 130px auto;
          align-items: center; gap: 12px; padding: 14px 18px;
          border-bottom: 1px solid #f3f4f6;
        }
        .activityList article:last-child { border-bottom: 0; }
        .number {
          display: grid; width: 30px; height: 30px; place-items: center;
          border-radius: 10px; color: #166534; background: #dcfce7;
          font-size: 12px; font-weight: 900;
        }
        .activityMain > span { color: #16a34a; font-size: 10px; font-weight: 800; }
        .activityMain h4 { margin: 4px 0 0; color: #1f2937; font-size: 14px; }
        .activityMain p { margin: 5px 0 0; color: #6b7280; font-size: 11px; }
        .activityStatus {
          padding: 6px 10px; border-radius: 999px; color: #166534;
          background: #dcfce7; font-size: 11px; font-weight: 800; white-space: nowrap;
        }
        .fileList { display: grid; gap: 8px; padding: 14px; }
        .fileList a {
          display: grid; grid-template-columns: 34px minmax(0,1fr) auto;
          align-items: center; gap: 10px; padding: 12px;
          border: 1px solid #e5e7eb; border-radius: 12px;
          color: inherit; text-decoration: none;
        }
        .fileList a > span { color: #16a34a; font-size: 20px; }
        .fileList b, .fileList small { display: block; }
        .fileList b { color: #1f2937; font-size: 13px; }
        .fileList small { margin-top: 3px; color: #6b7280; font-size: 10px; }
        .fileList strong { color: #166534; font-size: 11px; }
        .empty { padding: 24px; color: #9ca3af; text-align: center; }
        @media (max-width: 980px) {
          .infoGrid, .financeGrid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .activityList article { grid-template-columns: 34px minmax(180px,1fr) auto; }
          .activityList article > div:nth-of-type(3),
          .activityList article > div:nth-of-type(4) { display: none; }
        }
        @media (max-width: 680px) {
          .hero { flex-direction: column; }
          .infoGrid, .financeGrid { grid-template-columns: 1fr; }
          .activityList article { grid-template-columns: 30px minmax(0,1fr); }
          .activityStatus { grid-column: 2; justify-self: start; }
          .fileList a { grid-template-columns: 30px minmax(0,1fr); }
          .fileList strong { grid-column: 2; }
        }
      `}</style>
    </div>
  );
}
