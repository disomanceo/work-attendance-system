"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AttendanceReportRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  check_in_status: string;
  check_out_status: string | null;
  note: string | null;
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

type AttendanceSummary = {
  total: number;
  complete: number;
  late: number;
  early: number;
  incomplete: number;
};

type AttendanceApiResponse = {
  ok: boolean;
  message?: string;
  startDate?: string;
  endDate?: string;
  summary?: AttendanceSummary;
  records?: AttendanceReportRecord[];
};

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMonthStart() {
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

  return `${month}-01`;
}

function formatThaiDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatThaiTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatThaiPhone(phone: string) {
  if (phone.startsWith("66") && phone.length === 11) {
    return `0${phone.slice(2)}`;
  }

  return phone || "-";
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role ?? "-";
}

function getStatusLabel(status: string | null) {
  const labels: Record<string, string> = {
    normal: "ปกติ",
    late: "มาสาย",
    early: "ออกก่อนเวลา",
    outside_area: "อยู่นอกพื้นที่",
    pending: "รอตรวจสอบ",
    auto: "ออกอัตโนมัติ",
  };

  return status ? labels[status] ?? status : "-";
}

function getStatusStyle(status: string | null) {
  if (status === "normal") {
    return {
      color: "#146c2e",
      background: "#eaf9ef",
      border: "1px solid #b8e3c5",
    };
  }

  if (status === "late" || status === "early") {
    return {
      color: "#a04b00",
      background: "#fff7e8",
      border: "1px solid #f3d29c",
    };
  }

  if (status === "outside_area") {
    return {
      color: "#c81e1e",
      background: "#fff1f1",
      border: "1px solid #f2b8b8",
    };
  }

  return {
    color: "#475467",
    background: "#f2f4f7",
    border: "1px solid #d0d5dd",
  };
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [records, setRecords] = useState<
    AttendanceReportRecord[]
  >([]);

  const [summary, setSummary] =
    useState<AttendanceSummary>({
      total: 0,
      complete: 0,
      late: 0,
      early: 0,
      incomplete: 0,
    });

  const [startDate, setStartDate] = useState(
    getMonthStart()
  );

  const [endDate, setEndDate] = useState(getToday());

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("success");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      if (!startDate || !endDate) {
        throw new Error(
          "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด"
        );
      }

      if (startDate > endDate) {
        throw new Error(
          "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด"
        );
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !session?.access_token
      ) {
        router.replace("/login");
        return;
      }

      const query = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(
        `/api/admin/attendance?${query.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as AttendanceApiResponse;

      if (!response.ok || !result.ok) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          if (response.status === 401) {
            await supabase.auth.signOut();
            router.replace("/login");
            return;
          }

          router.replace("/dashboard");
          return;
        }

        throw new Error(
          result.message ||
            "ไม่สามารถโหลดรายงานการลงเวลาได้"
        );
      }

      setRecords(result.records ?? []);

      setSummary(
        result.summary ?? {
          total: 0,
          complete: 0,
          late: 0,
          early: 0,
          incomplete: 0,
        }
      );
    } catch (error) {
      console.error(
        "Load admin attendance report error:",
        error
      );

      setRecords([]);

      setSummary({
        total: 0,
        complete: 0,
        late: 0,
        early: 0,
        incomplete: 0,
      });

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดรายงานการลงเวลาได้"
      );
    } finally {
      setLoading(false);
    }
  }, [
    endDate,
    router,
    startDate,
    supabase,
  ]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const filteredRecords = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    return records.filter((record) => {
      const matchesSearch =
        !keyword ||
        record.full_name
          .toLowerCase()
          .includes(keyword) ||
        record.phone
          .toLowerCase()
          .includes(keyword) ||
        (record.position ?? "")
          .toLowerCase()
          .includes(keyword);

      let matchesStatus = true;

      if (statusFilter === "complete") {
        matchesStatus = Boolean(
          record.check_in_at &&
            record.check_out_at
        );
      }

      if (statusFilter === "incomplete") {
        matchesStatus = Boolean(
          record.check_in_at &&
            !record.check_out_at
        );
      }

      if (statusFilter === "late") {
        matchesStatus =
          record.check_in_status === "late";
      }

      if (statusFilter === "early") {
        matchesStatus =
          record.check_out_status === "early";
      }

      return matchesSearch && matchesStatus;
    });
  }, [records, searchText, statusFilter]);

  function exportCsv() {
    if (filteredRecords.length === 0) {
      setMessageType("error");
      setMessage("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    const headers = [
      "วันที่",
      "ชื่อ-สกุล",
      "เบอร์โทรศัพท์",
      "ตำแหน่ง",
      "บทบาท",
      "เวลาเข้า",
      "สถานะเวลาเข้า",
      "ระยะห่างเวลาเข้า(เมตร)",
      "เวลาออก",
      "สถานะเวลาออก",
      "ระยะห่างเวลาออก(เมตร)",
      "หมายเหตุ",
    ];

    const rows = filteredRecords.map(
      (record) => [
        record.work_date,
        record.full_name,
        formatThaiPhone(record.phone),
        record.position ?? "",
        getRoleLabel(record.role),
        formatThaiTime(record.check_in_at),
        getStatusLabel(record.check_in_status),
        record.check_in_distance_meters ?? "",
        formatThaiTime(record.check_out_at),
        getStatusLabel(record.check_out_status),
        record.check_out_distance_meters ?? "",
        record.note ?? "",
      ]
    );

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const text = String(value).replace(
              /"/g,
              '""'
            );

            return `"${text}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob(
      [`\uFEFF${csv}`],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `attendance-report-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setMessageType("success");
    setMessage("ส่งออกรายงาน CSV เรียบร้อยแล้ว");
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>ADMIN ATTENDANCE</p>
          <h1>รายงานการลงเวลา</h1>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() =>
              router.push("/admin/members")
            }
          >
            จัดการสมาชิก
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
          >
            กลับ Dashboard
          </button>
        </div>
      </header>

      <section
        style={{
          marginTop: 28,
          padding: 22,
          border: "1px solid #d8e2ed",
          borderRadius: 22,
          background: "#ffffff",
          boxShadow:
            "0 16px 40px rgba(28, 60, 93, 0.08)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <label>
            <span
              style={{
                display: "block",
                marginBottom: 7,
                color: "#344054",
                fontWeight: 700,
              }}
            >
              วันที่เริ่มต้น
            </span>

            <input
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
              style={{
                width: "100%",
                height: 46,
                padding: "0 12px",
                border: "1px solid #d8e2ed",
                borderRadius: 12,
                background: "#ffffff",
              }}
            />
          </label>

          <label>
            <span
              style={{
                display: "block",
                marginBottom: 7,
                color: "#344054",
                fontWeight: 700,
              }}
            >
              วันที่สิ้นสุด
            </span>

            <input
              type="date"
              value={endDate}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
              style={{
                width: "100%",
                height: 46,
                padding: "0 12px",
                border: "1px solid #d8e2ed",
                borderRadius: 12,
                background: "#ffffff",
              }}
            />
          </label>

          <button
            type="button"
            onClick={() =>
              void loadReport()
            }
            disabled={loading}
            style={{
              alignSelf: "end",
              height: 46,
              border: 0,
              borderRadius: 12,
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #1877f2, #3799ff)",
              fontWeight: 800,
              cursor: loading
                ? "wait"
                : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? "กำลังโหลด..."
              : "แสดงรายงาน"}
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={loading}
            style={{
              alignSelf: "end",
              height: 46,
              border: 0,
              borderRadius: 12,
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #15803d, #22c55e)",
              fontWeight: 800,
              cursor: loading
                ? "not-allowed"
                : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            ส่งออก CSV
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginTop: 16,
          }}
        >
          <label>
            <span
              style={{
                display: "block",
                marginBottom: 7,
                color: "#344054",
                fontWeight: 700,
              }}
            >
              ค้นหาบุคลากร
            </span>

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="ชื่อ เบอร์โทร หรือตำแหน่ง"
              style={{
                width: "100%",
                height: 46,
                padding: "0 12px",
                border: "1px solid #d8e2ed",
                borderRadius: 12,
                background: "#ffffff",
              }}
            />
          </label>

          <label>
            <span
              style={{
                display: "block",
                marginBottom: 7,
                color: "#344054",
                fontWeight: 700,
              }}
            >
              กรองสถานะ
            </span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
              style={{
                width: "100%",
                height: 46,
                padding: "0 12px",
                border: "1px solid #d8e2ed",
                borderRadius: 12,
                background: "#ffffff",
              }}
            >
              <option value="all">
                ทั้งหมด
              </option>
              <option value="complete">
                ลงเวลาครบ
              </option>
              <option value="incomplete">
                ยังไม่ลงเวลาออก
              </option>
              <option value="late">
                มาสาย
              </option>
              <option value="early">
                ออกก่อนเวลา
              </option>
            </select>
          </label>
        </div>
      </section>

      {message && (
        <div
          role="alert"
          style={{
            marginTop: 18,
            padding: "14px 16px",
            borderRadius: 14,
            border:
              messageType === "success"
                ? "1px solid #a7e3ba"
                : "1px solid #f2b8b8",
            color:
              messageType === "success"
                ? "#146c2e"
                : "#c81e1e",
            background:
              messageType === "success"
                ? "#f1fff5"
                : "#fff5f5",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <article
          style={{
            padding: 18,
            border: "1px solid #d8e2ed",
            borderRadius: 18,
            background: "#ffffff",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#667085",
            }}
          >
            รายการทั้งหมด
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#071d32",
            }}
          >
            {summary.total}
          </h2>
        </article>

        <article
          style={{
            padding: 18,
            border: "1px solid #b8e3c5",
            borderRadius: 18,
            background: "#f1fff5",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#667085",
            }}
          >
            ลงเวลาครบ
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#146c2e",
            }}
          >
            {summary.complete}
          </h2>
        </article>

        <article
          style={{
            padding: 18,
            border: "1px solid #f3d29c",
            borderRadius: 18,
            background: "#fffaf0",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#667085",
            }}
          >
            มาสาย
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#a04b00",
            }}
          >
            {summary.late}
          </h2>
        </article>

        <article
          style={{
            padding: 18,
            border: "1px solid #f3d29c",
            borderRadius: 18,
            background: "#fffaf0",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#667085",
            }}
          >
            ออกก่อนเวลา
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#a04b00",
            }}
          >
            {summary.early}
          </h2>
        </article>

        <article
          style={{
            padding: 18,
            border: "1px solid #f2b8b8",
            borderRadius: 18,
            background: "#fff5f5",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#667085",
            }}
          >
            ยังไม่ลงเวลาออก
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#c81e1e",
            }}
          >
            {summary.incomplete}
          </h2>
        </article>
      </section>

      <section
        style={{
          marginTop: 20,
          padding: 22,
          border: "1px solid #d8e2ed",
          borderRadius: 22,
          background: "#ffffff",
          boxShadow:
            "0 16px 40px rgba(28, 60, 93, 0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#071d32",
              fontSize: 22,
            }}
          >
            รายการลงเวลาบุคลากร
          </h2>

          <span
            style={{
              color: "#667085",
              fontWeight: 700,
            }}
          >
            แสดง {filteredRecords.length} รายการ
          </span>
        </div>

        {loading ? (
          <div
            style={{
              padding: 42,
              textAlign: "center",
              color: "#667085",
            }}
          >
            กำลังโหลดข้อมูล...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div
            style={{
              padding: 42,
              textAlign: "center",
              color: "#667085",
            }}
          >
            ไม่พบข้อมูลตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {filteredRecords.map(
              (record) => (
                <article
                  key={record.id}
                  style={{
                    padding: 18,
                    border:
                      "1px solid #d8e2ed",
                    borderRadius: 18,
                    background: "#fbfdff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(220px, 1.4fr) repeat(2, minmax(150px, 1fr))",
                      gap: 18,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        {formatThaiDate(
                          record.work_date
                        )}
                      </p>

                      <h3
                        style={{
                          margin:
                            "6px 0 0",
                          color: "#071d32",
                          fontSize: 18,
                        }}
                      >
                        {record.full_name}
                      </h3>

                      <p
                        style={{
                          margin:
                            "6px 0 0",
                          color: "#475467",
                        }}
                      >
                        {record.position ||
                          "ยังไม่ได้กำหนดตำแหน่ง"}
                      </p>

                      <p
                        style={{
                          margin:
                            "5px 0 0",
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        {formatThaiPhone(
                          record.phone
                        )}{" "}
                        ·{" "}
                        {getRoleLabel(
                          record.role
                        )}
                      </p>

                      {record.note && (
                        <p
                          style={{
                            margin:
                              "8px 0 0",
                            color: "#667085",
                            fontSize: 13,
                          }}
                        >
                          หมายเหตุ:{" "}
                          {record.note}
                        </p>
                      )}
                    </div>

                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        เวลาเข้า
                      </p>

                      <strong
                        style={{
                          display:
                            "block",
                          marginTop: 5,
                          color: "#071d32",
                          fontSize: 17,
                        }}
                      >
                        {formatThaiTime(
                          record.check_in_at
                        )}
                      </strong>

                      <span
                        style={{
                          display:
                            "inline-block",
                          marginTop: 8,
                          padding:
                            "4px 9px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          ...getStatusStyle(
                            record.check_in_status
                          ),
                        }}
                      >
                        {getStatusLabel(
                          record.check_in_status
                        )}
                      </span>

                      {record.check_in_distance_meters !==
                        null && (
                        <p
                          style={{
                            margin:
                              "7px 0 0",
                            color: "#98a2b3",
                            fontSize: 12,
                          }}
                        >
                          ห่างโรงเรียน{" "}
                          {Math.round(
                            record.check_in_distance_meters
                          ).toLocaleString(
                            "th-TH"
                          )}{" "}
                          เมตร
                        </p>
                      )}
                    </div>

                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        เวลาออก
                      </p>

                      <strong
                        style={{
                          display:
                            "block",
                          marginTop: 5,
                          color: "#071d32",
                          fontSize: 17,
                        }}
                      >
                        {formatThaiTime(
                          record.check_out_at
                        )}
                      </strong>

                      <span
                        style={{
                          display:
                            "inline-block",
                          marginTop: 8,
                          padding:
                            "4px 9px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          ...getStatusStyle(
                            record.check_out_status
                          ),
                        }}
                      >
                        {getStatusLabel(
                          record.check_out_status
                        )}
                      </span>

                      {record.check_out_distance_meters !==
                        null && (
                        <p
                          style={{
                            margin:
                              "7px 0 0",
                            color: "#98a2b3",
                            fontSize: 12,
                          }}
                        >
                          ห่างโรงเรียน{" "}
                          {Math.round(
                            record.check_out_distance_meters
                          ).toLocaleString(
                            "th-TH"
                          )}{" "}
                          เมตร
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}