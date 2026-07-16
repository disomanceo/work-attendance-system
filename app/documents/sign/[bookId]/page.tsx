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
import { getCachedProfileAssetUrl } from "@/lib/profile-image-cache";
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

const SIGNING_PAYLOAD_LIMIT_BYTES = 4.2 * 1024 * 1024;
const SIGNING_PAYLOAD_OVERHEAD_BYTES = 8192;
const SIGNING_RASTER_JPEG_QUALITY = 0.82;

function formatStampedAssignmentDate(value: Date) {

  return new Intl.DateTimeFormat("th-TH", {

    day: "numeric",

    month: "short",

    year: "2-digit",

  }).format(value);

}



function compactThaiName(value: string) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "-";

  const parts = normalized.split(" ");
  if (parts.length === 1) return parts[0];

  if (
    ["นาย", "นาง", "นางสาว", "น.ส.", "ดร.", "ว่าที่ร้อยตรี"].includes(
      parts[0],
    )
  ) {
    return `${parts[0]}${parts[1] || ""}`;
  }

  return parts[0];
}

export default function DocumentSigningPage() {
  const router = useRouter();
  const params = useParams<{ bookId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const bookId = String(params.bookId || "");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewScrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfDocumentRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const sourceBytesRef = useRef<ArrayBuffer | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [context, setContext] = useState<ContextResponse | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [instructionText, setInstructionText] = useState("มอบหมายให้");
  const [fontSize, setFontSize] = useState(18);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileMimeType, setSelectedFileMimeType] = useState("");
  const [selectedFileBase64, setSelectedFileBase64] = useState("");
  const [hasPreview, setHasPreview] = useState(false);
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
  const [isDirty, setIsDirty] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [mobileToolsCollapsed, setMobileToolsCollapsed] = useState(false);

  const clearRedirectTimer = useCallback(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, []);

  function returnToSelectedBook(checkUnsaved = true) {
    if (
      checkUnsaved &&
      isDirty &&
      !savedSuccessfully &&
      !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้าลงนามหรือไม่")
    ) {
      return;
    }

    router.push(`/documents?book=${encodeURIComponent(bookId)}`);
    router.refresh();
  }

  const scheduleReturnToSelectedBook = useCallback(() => {
    clearRedirectTimer();
    redirectTimerRef.current = setTimeout(() => {
      returnToSelectedBook(false);
    }, 900);
  }, [clearRedirectTimer, returnToSelectedBook]);

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
        previewScrollerRef.current?.clientWidth ||
          stageRef.current?.parentElement?.clientWidth ||
          900,
      );
      const horizontalPadding = window.matchMedia("(max-width: 680px)").matches
        ? 28
        : 56;
      const scale = Math.min(
        2.2,
        Math.max(
          0.5,
          Math.max(320, availableWidth - horizontalPadding) /
            baseViewport.width,
        ),
      );
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
  /* SIGNING_MANUAL_FILE_FUNCTIONS_START */
  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
      );
    }

    return window.btoa(binary);
  }

  async function canvasToJpegBuffer(canvas: HTMLCanvasElement) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("ไม่สามารถบีบอัดหน้าที่เลือกได้"));
          }
        },
        "image/jpeg",
        SIGNING_RASTER_JPEG_QUALITY,
      );
    });

    return blob.arrayBuffer();
  }

  async function buildRasterizedSigningPdfBase64() {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error("ไม่พบหน้าตัวอย่างเอกสารสำหรับลดขนาดไฟล์");
    }

    const { PDFDocument } = await import("pdf-lib");
    const imageBytes = await canvasToJpegBuffer(canvas);
    const pdf = await PDFDocument.create();
    const image = await pdf.embedJpg(imageBytes);
    const page = pdf.addPage([canvas.width, canvas.height]);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });

    const pdfBytes = await pdf.save({ useObjectStreams: true });
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    return arrayBufferToBase64(pdfBuffer);
  }

  async function buildSigningSourcePayload(maxSourceBase64Length: number) {
    const sourceBytes = sourceBytesRef.current;

    if (!sourceBytes || !selectedFileBase64) {
      throw new Error("กรุณาแนบไฟล์ PDF หรือรูปภาพที่จะใช้ลงนามก่อนบันทึก");
    }

    const isPdf =
      selectedFileMimeType.toLowerCase().includes("pdf") ||
      selectedFileName.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      const originalPayload = {
        base64: selectedFileBase64,
        fileName: selectedFileName,
        mimeType: selectedFileMimeType,
        pageNumber: 1,
      };

      if (originalPayload.base64.length <= maxSourceBase64Length) {
        return originalPayload;
      }

      return {
        base64: await buildRasterizedSigningPdfBase64(),
        fileName: `${selectedFileName.replace(/\.[^.]+$/i, "") || "document"}-compressed.pdf`,
        mimeType: "application/pdf",
        pageNumber: 1,
      };
    }

    const { PDFDocument } = await import("pdf-lib");
    const sourcePdf = await PDFDocument.load(sourceBytes.slice(0));
    const pageIndex = Math.min(
      Math.max(Math.floor(pageNumber) - 1, 0),
      sourcePdf.getPageCount() - 1,
    );
    const outputPdf = await PDFDocument.create();
    const [selectedPage] = await outputPdf.copyPages(sourcePdf, [pageIndex]);
    outputPdf.addPage(selectedPage);

    const onePageBytes = await outputPdf.save({ useObjectStreams: true });
    const onePageBuffer = onePageBytes.buffer.slice(
      onePageBytes.byteOffset,
      onePageBytes.byteOffset + onePageBytes.byteLength,
    ) as ArrayBuffer;
    const baseName = selectedFileName.replace(/\.pdf$/i, "");

    const onePageBase64 = arrayBufferToBase64(onePageBuffer);

    if (onePageBase64.length <= maxSourceBase64Length) {
      return {
        base64: onePageBase64,
        fileName: `${baseName || "document"}-page-${pageIndex + 1}.pdf`,
        mimeType: "application/pdf",
        pageNumber: 1,
      };
    }

    return {
      base64: await buildRasterizedSigningPdfBase64(),
      fileName: `${baseName || "document"}-page-${pageIndex + 1}.pdf`,
      mimeType: "application/pdf",
      pageNumber: 1,
    };
  }

  function setDefaultPlacement(width: number, height: number) {
    setTextPosition({
      x: Math.max(20, Math.round(width * 0.1)),
      y: Math.max(20, Math.round(height * 0.72)),
    });
    setSignaturePosition({
      x: Math.max(20, Math.round(width * 0.62)),
      y: Math.max(20, Math.round(height * 0.78)),
    });
  }

  async function loadSigningFile(file: File) {
    setMessage("");
    setRendering(true);

    try {
      const mimeType = String(file.type || "").toLowerCase();
      const isPdf =
        mimeType.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
      const isImage =
        mimeType.startsWith("image/") ||
        /\.(png|jpe?g)$/i.test(file.name);

      if (!isPdf && !isImage) {
        throw new Error("รองรับเฉพาะไฟล์ PDF, PNG, JPG และ JPEG");
      }

      const sourceBytes = await file.arrayBuffer();
      sourceBytesRef.current = sourceBytes.slice(0);
      setSelectedFileName(file.name);
      setSelectedFileMimeType(
        mimeType || (isPdf ? "application/pdf" : "image/jpeg"),
      );
      setSelectedFileBase64(arrayBufferToBase64(sourceBytes));
      setPageNumber(1);
      setPageCount(1);
      setShowInstructionText(false);
      setShowSignature(false);

      if (isPdf) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdfDocument = await pdfjs.getDocument({
          data: new Uint8Array(sourceBytes.slice(0)),
        }).promise;

        pdfDocumentRef.current = pdfDocument;
        setPageCount(pdfDocument.numPages);
        setHasPreview(true);
        await renderPage(1);

        const canvas = canvasRef.current;
        if (canvas) setDefaultPlacement(canvas.width, canvas.height);
        return;
      }

      pdfDocumentRef.current = null;
      const canvas = canvasRef.current;
      const stage = stageRef.current;

      if (!canvas || !stage) {
        throw new Error("ไม่พบพื้นที่แสดงตัวอย่าง");
      }

      const imageUrl = URL.createObjectURL(file);

      try {
        const image = new Image();
        image.src = imageUrl;
        await image.decode();

        const availableWidth = Math.max(
          320,
          previewScrollerRef.current?.clientWidth ||
            stage.parentElement?.clientWidth ||
            900,
        );
        const horizontalPadding = window.matchMedia("(max-width: 680px)").matches
          ? 28
          : 56;
        const availableHeight = Math.max(
          280,
          previewScrollerRef.current?.clientHeight ||
            Math.round(window.innerHeight * 0.62),
        );
        const widthScale =
          Math.max(320, availableWidth - horizontalPadding) /
          image.naturalWidth;
        const heightScale =
          Math.max(260, availableHeight - horizontalPadding) /
          image.naturalHeight;
        const scale = Math.min(
          2.2,
          Math.max(0.25, Math.min(widthScale, heightScale)),
        );
        const width = Math.max(1, Math.floor(image.naturalWidth * scale));
        const height = Math.max(1, Math.floor(image.naturalHeight * scale));

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context2d = canvas.getContext("2d");
        if (!context2d) {
          throw new Error("ไม่สามารถสร้างพื้นที่แสดงรูปภาพได้");
        }

        context2d.clearRect(0, 0, width, height);
        context2d.drawImage(image, 0, 0, width, height);
        setDefaultPlacement(width, height);
        setHasPreview(true);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    } catch (error) {
      setHasPreview(false);
      setSelectedFileName("");
      setSelectedFileMimeType("");
      setSelectedFileBase64("");
      setMessage(
        error instanceof Error ? error.message : "ไม่สามารถเปิดไฟล์ที่เลือกได้",
      );
    } finally {
      setRendering(false);
    }
  }

  function handleSigningFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      void loadSigningFile(file);
    }
  }
  /* SIGNING_MANUAL_FILE_FUNCTIONS_END */

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
          !result.book
        ) {
          throw new Error(result.message || "ไม่สามารถโหลดข้อมูลลงนามได้");
        }

        setContext(result);
        
        // SIGNING_FAST_SHELL_V8: show the page before PDF and signature work finishes.
        setLoading(false);
setSelectedAssigneeIds(
          result.book.tasks
            .map((task) => task.assigneeId)
            .filter(Boolean) as string[],
        );
        setInstructionText(
          result.book.directorNote || "มอบหมายให้",
        );
if (result.signer?.signatureFileId) {
          const cachedSignatureUrl = await getCachedProfileAssetUrl(
            "signature",
            result.signer.signatureFileId,
            accessToken,
          );
          if (cachedSignatureUrl) {
            signatureObjectUrl = cachedSignatureUrl;
            setSignatureUrl(cachedSignatureUrl);
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

      clearRedirectTimer();
    };
  }, [bookId, clearRedirectTimer, renderPage, token]);

  useEffect(() => {
    if (!loading && hasPreview && pdfDocumentRef.current) {
      void renderPage(pageNumber);
    }
  }, [hasPreview, loading, pageNumber, renderPage]);

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

    const shouldStampInstructionText =
      (showInstructionText || !showSignature) && instructionText.trim();

    if (shouldStampInstructionText) {

      context2d.font = `700 ${fontSize}px "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;

      context2d.fillStyle = "#1d4ed8";

      context2d.textBaseline = "top";

      const lines = wrapText(
        context2d,
        instructionText.trim(),
        Math.max(120, overlay.width - textPosition.x - 30),
      );

      const lineHeight = fontSize * 1.45;

      lines.forEach((line, index) => {

        context2d.fillText(line, textPosition.x, textPosition.y + index * lineHeight);

      });

      const dateText = formatStampedAssignmentDate(new Date());

      const dateFontSize = Math.max(10, Math.round(fontSize * 0.72));

      const dateY = textPosition.y + lines.length * lineHeight;

      context2d.font = `700 ${dateFontSize}px "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;

      context2d.fillStyle = "#2563eb";

      context2d.fillText(dateText, textPosition.x, dateY);

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
  function returnToSignedBook() {
    const targetBookId = context?.book?.id || bookId;
    const targetUrl = `/documents?book=${encodeURIComponent(targetBookId)}`;

    window.location.assign(targetUrl);
  }


  async function saveSignedDocument() {
    if (!context?.book) {
      setMessage("ไม่พบข้อมูลหนังสือ กรุณาเปิดหน้าลงนามใหม่อีกครั้ง");
      return;
    }

    if (!selectedFileBase64 || !hasPreview) {
      setMessage("กรุณาแนบไฟล์ PDF หรือรูปภาพที่จะใช้ลงนามก่อนบันทึก");
      return;
    }

    if (selectedAssigneeIds.length === 0) {
      setMessage("กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน");
      return;
    }

    if (showSignature && !signatureUrl) {
      setMessage("ไม่พบไฟล์ลายเซ็น กรุณาซ่อนลายเซ็นหรือเพิ่มลายเซ็นในโปรไฟล์ก่อนบันทึก");
      return;
    }

    if (!showSignature && !instructionText.trim()) {
      setMessage("กรุณาพิมพ์ข้อความสั่งการ หรือเพิ่มลายเซ็นก่อนบันทึก");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const accessToken = await token();
      if (!accessToken) return;

      const overlayBase64 = await createOverlayBase64();
      const maxSourceBase64Length =
        SIGNING_PAYLOAD_LIMIT_BYTES -
        overlayBase64.length -
        SIGNING_PAYLOAD_OVERHEAD_BYTES;
      const signingSource = await buildSigningSourcePayload(
        maxSourceBase64Length,
      );

      const estimatedPayloadBytes =
        signingSource.base64.length +
        overlayBase64.length +
        SIGNING_PAYLOAD_OVERHEAD_BYTES;

      if (estimatedPayloadBytes > SIGNING_PAYLOAD_LIMIT_BYTES) {
        throw new Error(
          "ไฟล์หน้าที่เลือกยังมีขนาดใหญ่เกิน 4 MB กรุณาลดขนาดไฟล์ก่อนบันทึกลงนาม",
        );
      }
      const response = await fetch("/api/documents/signing/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookId: context.book.id,
          sourceAttachmentId: context.sourceAttachment?.id || "",
          sourceFileName: signingSource.fileName,
          sourceMimeType: signingSource.mimeType,
          sourceFileBase64: signingSource.base64,
          assigneeIds: selectedAssigneeIds,
          assignmentNote: instructionText,
          pageNumber: signingSource.pageNumber,
          overlayBase64,
        }),
      });

      const responseText = await response.text();
      let result: {
        ok?: boolean;
        message?: string;
        [key: string]: unknown;
      } = {};

      if (responseText.trim()) {
        try {
          result = JSON.parse(responseText) as typeof result;
        } catch {
          throw new Error(
            `Signing API returned an invalid response (HTTP ${response.status}).`,
          );
        }
      }

      if (!response.ok || !result.ok) {
        if (response.status === 413) {
          throw new Error(
            "ไฟล์มีขนาดใหญ่เกินกว่าที่เซิร์ฟเวอร์รับได้ กรุณาลดขนาดไฟล์ PDF หรือรูปภาพแล้วลองใหม่",
          );
        }

        throw new Error(
          result.message ||
            `ไม่สามารถบันทึกฉบับลงนามได้ (HTTP ${response.status})`,
        );
      }

      setSavedSuccessfully(true);
      setIsDirty(false);
      setPopupMessage("บันทึกฉบับลงนามและมอบหมายงานเรียบร้อยแล้ว");

      scheduleReturnToSelectedBook();
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

  if (!context?.book) {
    return (
      <main className={styles.loading}>
        <strong>ไม่สามารถเปิดระบบลงนามได้</strong>
        <span>{message}</span>
        <button
              type="button"
              onClick={returnToSignedBook}
            >
              กลับไปยังเรื่องนี้
            </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>ลงนามและมอบหมายงาน</h1>
        <button
          type="button"
          className={styles.closeSigningButton}
          onClick={() => returnToSelectedBook(true)}
          aria-label="ปิดหน้าลงนาม"
          title="ปิดหน้าลงนาม"
        >
          ×
        </button>
      </header>

      {message && <div className={styles.error}>{message}</div>}

      <section className={styles.workspace}>
        <div className={styles.previewPanel}>
          <div className={styles.panelHeader}>
            <div>
              <strong>วางลายเซ็นและข้อความด้วยการลาก</strong>
              <span>{selectedFileName || "ยังไม่ได้เลือกไฟล์เพื่อลงนาม"}</span>
            </div>
            <div className={styles.pageControls}>
              <button
                type="button"
                onClick={() =>
                  setPageNumber((value) => Math.max(1, value - 1))
                }
                disabled={!hasPreview || pageNumber <= 1}
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
                disabled={!hasPreview || pageNumber >= pageCount}
              >
                ถัดไป
              </button>
            </div>
          </div>
          <div className={styles.topToolbar}>
            <div className={styles.signingFileToolbar}>
              {/* SIGNING_MANUAL_FILE_CONTROLS_START */}
              <button
                type="button"
                className={styles.sourceFileButton}
                onClick={() => {
                  const url = context.sourceAttachment?.openUrl;
                  if (url) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
                disabled={!context.sourceAttachment?.openUrl}
              >
                ไฟล์ต้นฉบับ
              </button>

              <button
                type="button"
                className={styles.attachFileButton}
                onClick={() => fileInputRef.current?.click()}
              >
                แนบไฟล์ลงนาม
              </button>

              <input
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleSigningFileChange}
              />
              {/* SIGNING_MANUAL_FILE_CONTROLS_END */}
            </div>
          </div>


          <div
            className={styles.mobilePageControls}
            aria-label="mobile page controls"
          >
            <button
              type="button"
              onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
              disabled={!hasPreview || pageNumber <= 1}
              aria-label="previous page"
            >
              {"<<"}
            </button>
            <span>{pageNumber} / {pageCount}</span>
            <button
              type="button"
              onClick={() =>
                setPageNumber((value) => Math.min(pageCount, value + 1))
              }
              disabled={!hasPreview || pageNumber >= pageCount}
              aria-label="next page"
            >
              {">>"}
            </button>
          </div>

          <div
            ref={previewScrollerRef}
            className={`${styles.stageScroller} ${
              !hasPreview ? styles.stageScrollerEmpty : ""
            }`}
          >
            <div className={styles.previewAreaLabel}>พื้นที่ตัวอย่างไฟล์ลงนาม</div>
             {!hasPreview && (
               <div className={styles.emptyPreview}>
                 <strong>ยังไม่ได้แนบไฟล์เพื่อลงนาม</strong>
                 <span>
                   เลือกไฟล์ PDF, PNG, JPG หรือ JPEG เพื่อเริ่มวางลายเซ็น
                 </span>
               </div>
             )}

            <div
              ref={stageRef}
              className={`${styles.stage} ${!hasPreview ? styles.stageEmpty : ""}`}
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
          <div className={styles.previewToolRow}>
            <button
              type="button"
              className={styles.addToolButton}
              onClick={() => {
                setShowSignature((value) => !value);
                setIsDirty(true);
              }}
              disabled={!hasPreview || !signatureUrl}
            >
              {showSignature ? "ซ่อนลายเซ็น" : "เพิ่มลายเซ็น"}
            </button>

            <button
              type="button"
              className={styles.addToolButton}
              onClick={() => {
                setShowInstructionText((value) => !value);
                setIsDirty(true);
              }}
            >
              {showInstructionText ? "ซ่อนข้อความ" : "เพิ่มข้อความ"}
            </button>

            <button
              type="button"
              className={styles.topSaveButton}
              onClick={() => void saveSignedDocument()}
              disabled={
                saving
              }
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>

            <button
              type="button"
              className={styles.mobileToolsToggle}
              onClick={() => setMobileToolsCollapsed((value) => !value)}
              aria-pressed={mobileToolsCollapsed}
            >
              {mobileToolsCollapsed ? "แสดงเครื่องมือ" : "ซ่อนเครื่องมือ"}
            </button>
          </div>

        </div>

        <aside
          className={`${styles.controlPanel} ${
            mobileToolsCollapsed ? styles.mobileToolsCollapsed : ""
          }`}
        >
                    <section className={`${styles.card} ${styles.signerCard}`}>
            <div className={styles.signerInfo}>
              <h2>ผู้ลงนาม</h2>
              <strong>{context.signer?.fullName || "-"}</strong>
              <span>{context.signer?.position || "-"}</span>
            </div>
            <div className={styles.signerSignaturePreview}>
              {signatureUrl ? (
                <img src={signatureUrl} alt="ลายเซ็นผู้ลงนาม" />
              ) : (
                <span>ไม่พบลายเซ็น</span>
              )}
            </div>
          </section>

          <section className={`${styles.card} ${styles.assigneeCard}`}>
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
                      onChange={() => {
                        setIsDirty(true);
                        setSelectedAssigneeIds((current) =>
                          checked
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        );
                      }}
                    />
                    <span>
                      <strong>{compactThaiName(person.fullName)}</strong>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className={`${styles.card} ${styles.instructionCard}`}>
            <h2>ข้อความสั่งการ</h2>
            <textarea
              value={instructionText}
              onChange={(event) => {
                setInstructionText(event.target.value);
                setIsDirty(true);
              }}
              placeholder="พิมพ์ข้อความที่ต้องการวางบนเอกสาร"
            />

            <label className={styles.controlField}>
              <span>ขนาดข้อความ</span>
              <input
                type="range"
                min={10}
                max={42}
                step={1}
                value={fontSize}
                onChange={(event) => {
                  setFontSize(Number(event.target.value));
                  setIsDirty(true);
                }}
              />
              <small className={styles.controlValue}>{fontSize}px</small>
            </label>
          </section>

          <section className={`${styles.card} ${styles.signatureSizeCard}`}>
            <h2>ขนาดลายเซ็น</h2>
            <label className={styles.controlField}>
              <span>ลากเพื่อขยาย / ย่อ</span>
              <input
                type="range"
                min={60}
                max={280}
                step={10}
                value={signatureWidth}
                onChange={(event) => {
                  setSignatureWidth(Number(event.target.value));
                  setIsDirty(true);
                }}
              />
              <small className={styles.controlValue}>{signatureWidth}px</small>
            </label>
          </section>


        </aside>
      </section>

      {popupMessage && (
        <div className={styles.popupBackdrop}>
          <div className={styles.popupCard}>
            <div className={styles.popupIcon}>✓</div>
            <h2>บันทึกสำเร็จ</h2>
            <p>{popupMessage}</p>
            <span className={styles.redirectMessage}>
              กำลังกลับไปยังเรื่องที่เลือก...
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
