import Link from "next/link";
import type { BudgetProject } from "@/lib/budget/mock-projects";

function money(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function percent(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export default function BudgetProjectDetail({
  project,
}: {
  project: BudgetProject;
}) {
  const remaining = project.budget - project.spent;
  const usedPercent = percent(project.spent, project.budget);

  return (
    <div className="detailRoot">
      <div className="detailActions">
        <Link href="/budget/projects">← กลับรายการโครงการ</Link>
        <button type="button" disabled>
          แก้ไขโครงการ
        </button>
      </div>

      <section className="heroCard">
        <div>
          <span className="projectCode">{project.id}</span>
          <h2>{project.name}</h2>
          <p>{project.objective}</p>
        </div>
        <span className="status">{project.status}</span>
      </section>

      <section className="infoGrid">
        <article>
          <span>ผู้รับผิดชอบ</span>
          <b>{project.owner}</b>
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
          <span>ระยะเวลาดำเนินงาน</span>
          <b>{project.period}</b>
        </article>
      </section>

      <section className="financeGrid">
        <article>
          <span>งบประมาณทั้งหมด</span>
          <strong>{money(project.budget)} บาท</strong>
        </article>
        <article>
          <span>เบิกจ่ายแล้ว</span>
          <strong>{money(project.spent)} บาท</strong>
        </article>
        <article>
          <span>คงเหลือ</span>
          <strong>{money(remaining)} บาท</strong>
        </article>
        <article>
          <span>ใช้ไป</span>
          <strong>{usedPercent}%</strong>
        </article>
      </section>

      <section className="progressCard">
        <div>
          <span>ความคืบหน้าการใช้งบประมาณ</span>
          <b>{usedPercent}%</b>
        </div>
        <div className="track">
          <span style={{ width: `${usedPercent}%` }} />
        </div>
      </section>

      <section className="activityCard">
        <header>
          <div>
            <h3>กิจกรรมภายใต้โครงการ</h3>
            <p>{project.activities.length} กิจกรรม</p>
          </div>
          <button type="button" disabled>
            + เพิ่มกิจกรรม
          </button>
        </header>

        <div className="activityList">
          {project.activities.map((activity, index) => {
            const activityPercent = percent(activity.spent, activity.budget);
            return (
              <article key={activity.id}>
                <div className="number">{index + 1}</div>
                <div className="activityMain">
                  <span>{activity.id}</span>
                  <h4>{activity.name}</h4>
                  <p>
                    {activity.responsible} • {activity.period}
                  </p>
                </div>
                <div className="activityMoney">
                  <span>งบประมาณ</span>
                  <b>{money(activity.budget)} บาท</b>
                </div>
                <div className="activityMoney">
                  <span>ใช้ไป</span>
                  <b>{money(activity.spent)} บาท</b>
                </div>
                <div className="activityStatus">
                  <span>{activity.status}</span>
                  <small>{activityPercent}%</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="notice">
        หน้านี้เป็นข้อมูลจำลองแบบอ่านอย่างเดียว ยังไม่มีการเชื่อมต่อหรือแก้ไขข้อมูลจริง
      </section>

      <style>{`
        .detailRoot {
          display: grid;
          gap: 16px;
        }

        .detailActions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .detailActions a {
          color: #166534;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .detailActions button,
        .activityCard button {
          min-height: 38px;
          padding: 7px 13px;
          border: 0;
          border-radius: 10px;
          color: #ffffff;
          background: #16a34a;
          font: inherit;
          font-weight: 800;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .heroCard {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 24px;
          border: 1px solid #bbf7d0;
          border-radius: 20px;
          background: linear-gradient(135deg, #f0fdf4, #ffffff);
        }

        .projectCode {
          display: inline-flex;
          padding: 5px 10px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          font-size: 11px;
          font-weight: 900;
        }

        .heroCard h2 {
          margin: 10px 0 0;
          color: #14532d;
          font-size: 26px;
        }

        .heroCard p {
          max-width: 850px;
          margin: 10px 0 0;
          color: #4b5563;
          line-height: 1.7;
        }

        .status {
          display: inline-flex;
          padding: 7px 12px;
          border-radius: 999px;
          color: #1d4ed8;
          background: #dbeafe;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .infoGrid,
        .financeGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .infoGrid article,
        .financeGrid article,
        .progressCard,
        .activityCard {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #ffffff;
        }

        .infoGrid article,
        .financeGrid article {
          padding: 16px;
        }

        .infoGrid span,
        .financeGrid span,
        .activityMoney span {
          display: block;
          color: #6b7280;
          font-size: 11px;
        }

        .infoGrid b {
          display: block;
          margin-top: 6px;
          color: #1f2937;
          font-size: 13px;
        }

        .financeGrid strong {
          display: block;
          margin-top: 7px;
          color: #166534;
          font-size: 20px;
        }

        .progressCard {
          padding: 18px;
        }

        .progressCard > div:first-child {
          display: flex;
          justify-content: space-between;
          color: #6b7280;
          font-size: 12px;
        }

        .progressCard b {
          color: #166534;
        }

        .track {
          height: 10px;
          margin-top: 9px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e7eb;
        }

        .track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22c55e, #16a34a);
        }

        .activityCard {
          overflow: hidden;
        }

        .activityCard > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .activityCard h3 {
          margin: 0;
          color: #1f2937;
          font-size: 18px;
        }

        .activityCard header p {
          margin: 5px 0 0;
          color: #6b7280;
          font-size: 12px;
        }

        .activityList article {
          display: grid;
          grid-template-columns: 34px minmax(220px, 1fr) 140px 140px 120px;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid #f3f4f6;
        }

        .activityList article:last-child {
          border-bottom: 0;
        }

        .number {
          display: grid;
          width: 30px;
          height: 30px;
          place-items: center;
          border-radius: 10px;
          color: #166534;
          background: #dcfce7;
          font-size: 12px;
          font-weight: 900;
        }

        .activityMain span {
          color: #16a34a;
          font-size: 10px;
          font-weight: 800;
        }

        .activityMain h4 {
          margin: 4px 0 0;
          color: #1f2937;
          font-size: 14px;
        }

        .activityMain p {
          margin: 5px 0 0;
          color: #6b7280;
          font-size: 11px;
        }

        .activityMoney b {
          display: block;
          margin-top: 5px;
          color: #1f2937;
          font-size: 13px;
        }

        .activityStatus {
          text-align: right;
        }

        .activityStatus span,
        .activityStatus small {
          display: block;
        }

        .activityStatus span {
          color: #374151;
          font-size: 11px;
          font-weight: 800;
        }

        .activityStatus small {
          margin-top: 4px;
          color: #16a34a;
        }

        .notice {
          padding: 13px 16px;
          border: 1px dashed #86efac;
          border-radius: 14px;
          color: #166534;
          background: #f0fdf4;
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 980px) {
          .infoGrid,
          .financeGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .activityList article {
            grid-template-columns: 34px minmax(180px, 1fr) 110px;
          }

          .activityMoney:first-of-type {
            display: none;
          }

          .activityStatus {
            display: none;
          }
        }

        @media (max-width: 680px) {
          .detailActions,
          .heroCard,
          .activityCard > header {
            align-items: stretch;
            flex-direction: column;
          }

          .infoGrid,
          .financeGrid {
            grid-template-columns: 1fr;
          }

          .activityList article {
            grid-template-columns: 30px minmax(0, 1fr);
          }

          .activityMoney {
            grid-column: 2;
          }
        }
      `}</style>
    </div>
  );
}
