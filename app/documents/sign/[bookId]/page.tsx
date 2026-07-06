"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type ContextResponse = {
  ok: boolean;
  message?: string;
  book?: {
    id: string;
    subject: string;
    directorNote: string;
    tasks: Array<{
      id: string;
      assigneeId: string | null;
      assigneeName: string;
      status: string;
    }>;
  };
  sourceAttachment?: {
    id: string;
    fileName: string;
    mimeType: string;
    openUrl: string;
  };
  signer?: {
    id: string;
    fullName: string;
    position: string;
    signatureFileId: string;
  };
  assignees?: Array<{
    id: string;
    fullName: string;
    position: string;
    role: string;
  }>;
};

type DragTarget = "signature" | "text" | null;

type Position = {
  x: number;
  y: number;
};

export default function DocumentSigningPage() {
  const router = useRouter();
  const params = useParams<{ bookId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const bookId = String(params.bookId || "");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pdfDocumentRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const sourceBytesRef = useRef<ArrayBuffer | null>(null);

  const [context, setContext] = useState<ContextResponse | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [assignmentNote, setAssignmentNote] = useState("มอบหมายให้ดำเนินการ");
  const [instructionText, setInstructionText] = useState("มอบหมายให้ดำเนินการ");
  const [fontSize, setFontSize] = useState(14);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [signaturePosition, setSignaturePosition] = useState<Position>({
    x: 460,
    y: 560,
  });
  const [textPosition, setTextPosition] = useState<Position>({
    x: 90,
    y: 520,
  });
  const [signatureWidth, setSignatureWidth] = useState(100);
  const [showInstructionText, setShowInstructionText] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [popupMessage, setPopupMessage] = useState("");

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return "";
    }

    return session.access_token;
  }, [router, supabase]);

  const renderPage = useCallback(async (targetPage: number) => {
    const pdfDocument = pdfDocumentRef.current;
    const canvas = canvasRef.current;

    if (!pdfDocument || !canvas) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
        await renderTaskRef.current.promise;
      } catch {
        // A cancelled PDF.js render is expected here.
      } finally {
        renderTaskRef.current = null;
      }
    }

    setRendering(true);

    try {
      const page = await pdfDocument.getPage(targetPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(
        320,
        stageRef.current?.clientWidth || 900,
      );
      const scale = Math.min(1.6, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const context2d = canvas.getContext("2d");

      if (!context2d) {
        throw new Error("ไม่สามารถสร้างพื้นที่แสดงเอกสารได้");
      }

      context2d.clearRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvasContext: context2d,
        viewport,
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;

      setSignaturePosition((current) => ({
        x: Math.min(current.x, Math.max(10, viewport.width - 300)),
        y: Math.min(current.y, Math.max(10, viewport.height - 100)),
      }));
      setTextPosition((current) => ({
        x: Math.min(current.x, Math.max(10, viewport.width - 260)),
        y: Math.min(current.y, Math.max(10, viewport.height - 90)),
      }));
    } catch (error) {
      const errorName =
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : "";

      if (errorName !== "RenderingCancelledException") {
        setMessage(
          error instanceof Error ? error.message : "ไม่สามารถแสดง PDF ได้",
        );
      }
    } finally {
      if (renderTaskRef.current) {
        renderTaskRef.current = null;
      }
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    let signatureObjectUrl = "";

    async function load() {
      setLoading(true);
      setMessage("");

      try {
        const accessToken = await token();
        if (!accessToken) return;

        const contextResponse = await fetch(
          `/api/documents/signing/context?bookId=${encodeURIComponent(bookId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          },
        );
        const result = (await contextResponse.json()) as ContextResponse;

        if (
          !contextResponse.ok ||
          !result.ok ||
          !result.book ||
          !result.sourceAttachment
        ) {
          throw new Error(result.message || "ไม่สามารถโหลดข้อมูลลงนามได้");
        }

        setContext(result);
        setSelectedAssigneeIds(
          result.book.tasks
            .map((task) => task.assigneeId)
            .filter(Boolean) as string[],
        );
        setAssignmentNote(
          result.book.directorNote || "มอบหมายให้ดำเนินการ",
        );
        setInstructionText(
          result.book.directorNote || "มอบหมายให้ดำเนินการ",
        );

        const sourceResponse = await fetch(
          `/api/documents/signing/source?attachmentId=${encodeURIComponent(
            result.sourceAttachment.id,
          )}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          },
        );

        if (!sourceResponse.ok) {
          const errorResult = await sourceResponse.json().catch(() => null);
          throw new Error(
            errorResult?.message || "ไม่สามารถเปิดไฟล์ต้นฉบับได้",
          );
        }

        const sourceBytes = await sourceResponse.arrayBuffer();
        sourceBytesRef.current = sourceBytes;

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdfDocument = await pdfjs.getDocument({
          data: new Uint8Array(sourceBytes),
        }).promise;

        pdfDocumentRef.current = pdfDocument;
        setPageCount(pdfDocument.numPages);
        setPageNumber(1);

        if (result.signer?.signatureFileId) {
          const signatureResponse = await fetch(
            `/api/admin/member-signature?fileId=${encodeURIComponent(
              result.signer.signatureFileId,
            )}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            },
          );

          if (signatureResponse.ok) {
            signatureObjectUrl = URL.createObjectURL(
              await signatureResponse.blob(),
            );
            setSignatureUrl(signatureObjectUrl);
          }
        }

      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cleanup cancellation errors.
        }
        renderTaskRef.current = null;
      }

      if (signatureObjectUrl) URL.revokeObjectURL(signatureObjectUrl);
    };
  }, [bookId, renderPage, token]);

  useEffect(() => {
    if (!loading && pdfDocumentRef.current) {
      void renderPage(pageNumber);
    }
  }, [loading, pageNumber, renderPage]);

  function startDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    target: Exclude<DragTarget, null>,
    position: Position,
  ) {
    const stage = stageRef.current;
    if (!stage) return;

    const bounds = stage.getBoundingClientRect();

    setDragTarget(target);
    setDragOffset({
      x: event.clientX - bounds.left - position.x,
      y: event.clientY - bounds.top - position.y,
    });

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragTarget || !stageRef.current || !canvasRef.current) return;

    const bounds = stageRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;

    const nextX = Math.max(
      0,
      Math.min(canvas.width - 40, event.clientX - bounds.left - dragOffset.x),
    );
    const nextY = Math.max(
      0,
      Math.min(canvas.height - 30, event.clientY - bounds.top - dragOffset.y),
    );

    if (dragTarget === "signature") {
      setSignaturePosition({ x: nextX, y: nextY });
    } else {
      setTextPosition({ x: nextX, y: nextY });
    }
  }

  function stopDrag() {
    setDragTarget(null);
  }

  function wrapText(
    context2d: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (context2d.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [""];
  }

  async function createOverlayBase64() {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("ไม่พบหน้าตัวอย่างเอกสาร");

    const overlay = document.createElement("canvas");
    overlay.width = canvas.width;
    overlay.height = canvas.height;

    const context2d = overlay.getContext("2d");
    if (!context2d) throw new Error("ไม่สามารถสร้างชั้นข้อมูลลงนามได้");

    context2d.clearRect(0, 0, overlay.width, overlay.height);

    if (showInstructionText && instructionText.trim()) {
      context2d.font = `700 ${fontSize}px "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;
      context2d.fillStyle = "#111827";
      context2d.textBaseline = "top";

      const lines = wrapText(
        context2d,
        instructionText.trim(),
        Math.max(120, overlay.width - textPosition.x - 30),
      );
      const lineHeight = fontSize * 1.45;

      lines.forEach((line, index) => {
        context2d.fillText(
          line,
          textPosition.x,
          textPosition.y + index * lineHeight,
        );
      });
    }

    if (showSignature && signatureUrl) {
      const signatureImage = new Image();
      signatureImage.src = signatureUrl;
      await signatureImage.decode();

      const ratio =
        signatureImage.naturalHeight / signatureImage.naturalWidth;
      const signatureHeight = signatureWidth * ratio;

      context2d.drawImage(
        signatureImage,
        signaturePosition.x,
        signaturePosition.y,
        signatureWidth,
        signatureHeight,
      );
    }

    return overlay.toDataURL("image/png").split(",")[1];
  }

  async function saveSignedDocument() {
    if (!context?.book || !context.sourceAttachment) return;

    setSaving(true);
    setMessage("");

    try {
      const accessToken = await token();
      if (!accessToken) return;

      const overlayBase64 = await createOverlayBase64();

      const response = await fetch("/api/documents/signing/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookId: context.book.id,
          sourceAttachmentId: context.sourceAttachment.id,
          assigneeIds: selectedAssigneeIds,
          assignmentNote,
          pageNumber,
          overlayBase64,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถบันทึกฉบับลงนามได้");
      }

      setPopupMessage("บันทึกฉบับลงนามและมอบหมายงานเรียบร้อยแล้ว");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className={styles.loading}>กำลังโหลดระบบลงนาม...</main>;
  }

  if (!context?.book || !context.sourceAttachment) {
    return (
      <main className={styles.loading}>
        <strong>ไม่สามารถเปิดระบบลงนามได้</strong>
        <span>{message}</span>
        <button type="button" onClick={() => router.push("/documents")}>
          กลับหน้าหนังสือราชการ
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>SMART AREA SIGNING</p>
          <h1>ลงนามและมอบหมายงาน</h1>
          <span>{context.book.subject}</span>
        </div>
        <button type="button" onClick={() => router.push("/documents")}>
          กลับ
        </button>
      </header>

      {message && <div className={styles.error}>{message}</div>}

      <section className={styles.workspace}>
        <div className={styles.previewPanel}>
          <div className={styles.panelHeader}>
            <div>
              <strong>วางลายเซ็นและข้อความด้วยการลาก</strong>
              <span>{context.sourceAttachment.fileName}</span>
            </div>
            <div className={styles.pageControls}>
              <button
                type="button"
                onClick={() =>
                  setPageNumber((value) => Math.max(1, value - 1))
                }
                disabled={pageNumber <= 1}
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {pageNumber} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPageNumber((value) => Math.min(pageCount, value + 1))
                }
                disabled={pageNumber >= pageCount}
              >
                ถัดไป
              </button>
            </div>
          </div>

          <div className={styles.topToolbar}>
            <div className={styles.toolbarInfo}>
              <span>เลือกเพิ่มข้อความหรือลายเซ็น แล้วลากไปยังตำแหน่งที่ต้องการ</span>
              {saving && <strong>กำลังบันทึก กรุณารอสักครู่...</strong>}
            </div>

            <div className={styles.toolbarActions}>
              <button
                type="button"
                className={styles.addToolButton}
                onClick={() => setShowInstructionText((value) => !value)}
              >
                {showInstructionText ? "ซ่อนข้อความ" : "เพิ่มข้อความ"}
              </button>

              <button
                type="button"
                className={styles.addToolButton}
                onClick={() => setShowSignature((value) => !value)}
                disabled={!signatureUrl}
              >
                {showSignature ? "ซ่อนลายเซ็น" : "เพิ่มลายเซ็น"}
              </button>

              <button
                type="button"
                className={styles.topSaveButton}
                onClick={() => void saveSignedDocument()}
                disabled={
                  saving ||
                  !signatureUrl ||
                  !showSignature ||
                  selectedAssigneeIds.length === 0
                }
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>

          <div className={styles.stageScroller}>
            <div
              ref={stageRef}
              className={styles.stage}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              <canvas ref={canvasRef} className={styles.pdfCanvas} />

              {showInstructionText && instructionText.trim() && (
                <div
                  className={`${styles.draggableText} ${
                    dragTarget === "text" ? styles.dragging : ""
                  }`}
                  style={{
                    left: textPosition.x,
                    top: textPosition.y,
                    fontSize,
                  }}
                  onPointerDown={(event) =>
                    startDrag(event, "text", textPosition)
                  }
                >
                  {instructionText}
                </div>
              )}

              {showSignature && signatureUrl && (
                <div
                  className={`${styles.draggableSignature} ${
                    dragTarget === "signature" ? styles.dragging : ""
                  }`}
                  style={{
                    left: signaturePosition.x,
                    top: signaturePosition.y,
                    width: signatureWidth,
                  }}
                  onPointerDown={(event) =>
                    startDrag(event, "signature", signaturePosition)
                  }
                >
                  <img src={signatureUrl} alt="ลายเซ็นผู้ลงนาม" />
                </div>
              )}

              {rendering && (
                <div className={styles.rendering}>กำลังแสดงหน้าเอกสาร...</div>
              )}
            </div>
          </div>
        </div>

        <aside className={styles.controlPanel}>
          <section className={styles.card}>
            <h2>ผู้ลงนาม</h2>
            <strong>{context.signer?.fullName || "-"}</strong>
            <span>{context.signer?.position || "-"}</span>
          </section>

          <section className={styles.card}>
            <div className={styles.assigneeHeader}>
              <h2>ผู้รับมอบหมาย</h2>
              <span>{selectedAssigneeIds.length} คน</span>
            </div>

            <div className={styles.assigneeList}>
              {(context.assignees ?? []).map((person) => {
                const checked = selectedAssigneeIds.includes(person.id);

                return (
                  <label key={person.id} className={styles.assigneeOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedAssigneeIds((current) =>
                          checked
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        )
                      }
                    />
                    <span>
                      <strong>{person.fullName}</strong>
                      <small>{person.position || "ไม่ระบุตำแหน่ง"}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className={styles.card}>
            <h2>ข้อความบนเอกสาร</h2>
            <textarea
              value={instructionText}
              onChange={(event) => setInstructionText(event.target.value)}
              placeholder="พิมพ์ข้อความที่ต้องการวางบนเอกสาร"
            />

            <label>
              <span>ขนาดข้อความ</span>
              <input
                type="range"
                min={10}
                max={42}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
              <small>{fontSize}px</small>
            </label>
          </section>

          <section className={styles.card}>
            <h2>ขนาดลายเซ็น</h2>
            <input
              type="range"
              min={60}
              max={280}
              step={10}
              value={signatureWidth}
              onChange={(event) =>
                setSignatureWidth(Number(event.target.value))
              }
            />
            <small>{signatureWidth}px</small>
          </section>

          <section className={styles.card}>
            <h2>ข้อความสั่งการ</h2>
            <textarea
              value={assignmentNote}
              onChange={(event) => setAssignmentNote(event.target.value)}
              placeholder="มอบหมายให้ดำเนินการ"
            />
          </section>


        </aside>
      </section>

      {popupMessage && (
        <div className={styles.popupBackdrop}>
          <div className={styles.popupCard}>
            <div className={styles.popupIcon}>✓</div>
            <h2>บันทึกสำเร็จ</h2>
            <p>{popupMessage}</p>
            <button
              type="button"
              onClick={() => {
                setPopupMessage("");
                router.push("/documents");
                router.refresh();
              }}
            >
              กลับหน้าหนังสือราชการ
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
