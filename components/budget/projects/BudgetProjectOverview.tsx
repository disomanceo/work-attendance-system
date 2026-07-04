import Link from "next/link";
import { mockBudgetProjects as projects } from "@/lib/budget/mock-projects";

function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

function statusClass(status: string) {
  if (status === "เสร็จแล้ว") return "statusComplete";
  if (status === "กำลังดำเนินการ") return "statusProgress";
  if (status === "เตรียมดำเนินการ") return "statusPreparing";
  return "statusPending";
}

export default function BudgetProjectOverview() {
  const totalBudget = projects.reduce((sum, project) => sum + project.budget, 0);
  const totalSpent = projects.reduce((sum, project) => sum + project.spent, 0);

  return (
    <div className="budgetProjectsRoot">
      <section className="summaryGrid">
        <article className="summaryCard">
          <span>โครงการทั้งหมด</span>
          <strong>{projects.length}</strong>
          <small>โครงการ</small>
        </article>
        <article className="summaryCard">
          <span>กิจกรรมทั้งหมด</span>
          <strong>
            {projects.reduce(
              (sum, project) => sum + project.activities.length,
              0
            )}
          </strong>
          <small>กิจกรรม</small>
        </article>
        <article className="summaryCard">
          <span>งบประมาณรวม</span>
          <strong>{money(totalBudget)}</strong>
          <small>บาท</small>
        </article>
        <article className="summaryCard">
          <span>เบิกจ่ายแล้ว</span>
          <strong>{money(totalSpent)}</strong>
          <small>{percent(totalSpent, totalBudget)}% ของงบทั้งหมด</small>
        </article>
      </section>

      <section className="toolbar">
        <div>
          <h2>รายการโครงการ</h2>
          <p>ข้อมูลจำลองสำหรับออกแบบหน้าจอ ยังไม่มีการเขียนข้อมูลจริง</p>
        </div>

        <div className="toolbarActions">
          <label>
            <span>ค้นหา</span>
            <input
              type="search"
              placeholder="ค้นหาชื่อโครงการหรือผู้รับผิดชอบ"
              disabled
            />
          </label>

          <button type="button" disabled>
            + เพิ่มโครงการ
          </button>
        </div>
      </section>

      <section className="projectList">
        {projects.map((project) => {
          const usedPercent = percent(project.spent, project.budget);

          return (
            <article className="projectCard" key={project.id}>
              <header className="projectHeader">
                <div className="projectTitle">
                  <span className="projectCode">{project.id}</span>
                  <h3>{project.name}</h3>
                  <p>
                    ผู้รับผิดชอบ: <b>{project.owner}</b>
                  </p>
                </div>

                <span className={`statusBadge ${statusClass(project.status)}`}>
                  {project.status}
                </span>
              </header>

              <div className="projectMeta">
                <div>
                  <span>ระยะเวลาดำเนินงาน</span>
                  <b>{project.period}</b>
                </div>
                <div>
                  <span>งบประมาณ</span>
                  <b>{money(project.budget)} บาท</b>
                </div>
                <div>
                  <span>เบิกจ่ายแล้ว</span>
                  <b>{money(project.spent)} บาท</b>
                </div>
                <div>
                  <span>คงเหลือ</span>
                  <b>{money(project.budget - project.spent)} บาท</b>
                </div>
              </div>

              <div className="progressBlock">
                <div className="progressLabel">
                  <span>การใช้งบประมาณ</span>
                  <b>{usedPercent}%</b>
                </div>
                <div className="progressTrack">
                  <span style={{ width: `${usedPercent}%` }} />
                </div>
              </div>

              <div className="activitySection">
                <div className="activityHeader">
                  <h4>กิจกรรมภายใต้โครงการ</h4>
                  <span>{project.activities.length} กิจกรรม</span>
                </div>

                <div className="activityList">
                  {project.activities.map((activity, index) => (
                    <div className="activityRow" key={activity.id}>
                      <div className="activityNumber">{index + 1}</div>

                      <div className="activityName">
                        <b>{activity.name}</b>
                        <small>{activity.id}</small>
                      </div>

                      <div className="activityBudget">
                        <span>งบประมาณ</span>
                        <b>{money(activity.budget)} บาท</b>
                      </div>

                      <div className="activityBudget">
                        <span>ใช้ไป</span>
                        <b>{money(activity.spent)} บาท</b>
                      </div>

                      <span
                        className={`statusBadge ${statusClass(
                          activity.status
                        )}`}
                      >
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <footer className="projectFooter">
                <span>โหมดอ่านอย่างเดียว</span>
                <Link href={`/budget/projects/${project.id}`}>
                  ดูรายละเอียด
                </Link>
              </footer>
            </article>
          );
        })}
      </section>

      <style>{`
        .budgetProjectsRoot {
          display: grid;
          gap: 18px;
        }

        .summaryGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .summaryCard {
          min-height: 122px;
          padding: 18px;
          border: 1px solid #dcfce7;
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(20, 83, 45, 0.06);
        }

        .summaryCard span,
        .summaryCard small {
          display: block;
          color: #6b7280;
        }

        .summaryCard strong {
          display: block;
          margin-top: 10px;
          color: #166534;
          font-size: 26px;
        }

        .summaryCard small {
          margin-top: 8px;
          font-size: 12px;
        }

        .toolbar {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          background: #ffffff;
        }

        .toolbar h2 {
          margin: 0;
          color: #1f2937;
          font-size: 20px;
        }

        .toolbar p {
          margin: 6px 0 0;
          color: #6b7280;
          font-size: 13px;
        }

        .toolbarActions {
          display: flex;
          align-items: end;
          gap: 10px;
        }

        .toolbarActions label span {
          display: block;
          margin-bottom: 5px;
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
        }

        .toolbarActions input {
          width: min(320px, 36vw);
          min-height: 40px;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          font: inherit;
        }

        .toolbarActions button {
          min-height: 40px;
          padding: 8px 14px;
          border: 0;
          border-radius: 11px;
          color: #ffffff;
          background: #16a34a;
          font: inherit;
          font-weight: 800;
        }

        button:disabled,
        input:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .projectList {
          display: grid;
          gap: 16px;
        }

        .projectCard {
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
        }

        .projectHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 20px;
          border-bottom: 1px solid #f0fdf4;
          background: linear-gradient(135deg, #f0fdf4, #ffffff);
        }

        .projectCode {
          display: inline-flex;
          padding: 4px 9px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          font-size: 11px;
          font-weight: 800;
        }

        .projectTitle h3 {
          margin: 9px 0 0;
          color: #14532d;
          font-size: 20px;
        }

        .projectTitle p {
          margin: 7px 0 0;
          color: #6b7280;
          font-size: 13px;
        }

        .statusBadge {
          display: inline-flex;
          min-height: 28px;
          align-items: center;
          justify-content: center;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .statusComplete {
          color: #166534;
          background: #dcfce7;
        }

        .statusProgress {
          color: #1d4ed8;
          background: #dbeafe;
        }

        .statusPreparing {
          color: #92400e;
          background: #fef3c7;
        }

        .statusPending {
          color: #6b7280;
          background: #f3f4f6;
        }

        .projectMeta {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          padding: 18px 20px 8px;
        }

        .projectMeta div {
          min-width: 0;
          padding: 12px;
          border-radius: 14px;
          background: #f9fafb;
        }

        .projectMeta span,
        .activityBudget span {
          display: block;
          color: #6b7280;
          font-size: 11px;
        }

        .projectMeta b,
        .activityBudget b {
          display: block;
          margin-top: 5px;
          color: #1f2937;
          font-size: 13px;
        }

        .progressBlock {
          padding: 8px 20px 18px;
        }

        .progressLabel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #6b7280;
          font-size: 12px;
        }

        .progressLabel b {
          color: #166534;
        }

        .progressTrack {
          height: 9px;
          margin-top: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e7eb;
        }

        .progressTrack span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22c55e, #16a34a);
        }

        .activitySection {
          padding: 0 20px 18px;
        }

        .activityHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 9px;
        }

        .activityHeader h4 {
          margin: 0;
          color: #374151;
          font-size: 15px;
        }

        .activityHeader span {
          color: #6b7280;
          font-size: 12px;
        }

        .activityList {
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
        }

        .activityRow {
          display: grid;
          grid-template-columns: 34px minmax(220px, 1fr) 130px 130px auto;
          align-items: center;
          gap: 12px;
          padding: 11px 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        .activityRow:last-child {
          border-bottom: 0;
        }

        .activityNumber {
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 9px;
          color: #166534;
          background: #dcfce7;
          font-size: 12px;
          font-weight: 900;
        }

        .activityName b,
        .activityName small {
          display: block;
        }

        .activityName b {
          color: #1f2937;
          font-size: 13px;
        }

        .activityName small {
          margin-top: 3px;
          color: #9ca3af;
          font-size: 10px;
        }

        .projectFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 20px;
          border-top: 1px solid #f3f4f6;
          background: #fafafa;
        }

        .projectFooter span {
          color: #9ca3af;
          font-size: 11px;
        }

        .projectFooter a {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          padding: 8px 14px;
          border-radius: 11px;
          color: #ffffff;
          background: #16a34a;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        @media (max-width: 980px) {
          .summaryGrid,
          .projectMeta {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .activityRow {
            grid-template-columns: 34px minmax(180px, 1fr) auto;
          }

          .activityBudget {
            display: none;
          }
        }

        @media (max-width: 680px) {
          .summaryGrid,
          .projectMeta {
            grid-template-columns: 1fr;
          }

          .toolbar,
          .projectHeader,
          .projectFooter {
            align-items: stretch;
            flex-direction: column;
          }

          .toolbarActions {
            align-items: stretch;
            flex-direction: column;
          }

          .toolbarActions input {
            width: 100%;
          }

          .activityRow {
            grid-template-columns: 30px minmax(0, 1fr);
          }

          .activityRow > .statusBadge {
            grid-column: 2;
            justify-self: start;
          }

          .projectFooter a {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
