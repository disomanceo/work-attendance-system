"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCachedProfileAssetUrl,
  getCachedProfileImageUrl,
  setCachedProfileAssetUrl,
  setCachedProfileImageUrl,
} from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import styles from "./profile.module.css";

type Profile = {
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
  profile_image_file_id: string | null;
  signature_file_id: string | null;
};

type AssetType = "profile" | "signature";

type TelegramStatus = {
  connected: boolean;
  telegram: {
    userId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type CropState = {
  sourceUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  minScale: number;
  offsetX: number;
  offsetY: number;
};

const CROP_SIZE = 320;
const OUTPUT_SIZE = 800;

function getTelegramDisplayName(status: TelegramStatus | null) {
  const telegram = status?.telegram;
  if (!telegram) return "";

  if (telegram.username) return `@${telegram.username}`;

  return [telegram.firstName, telegram.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    image.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    image.src = url;
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("ไม่สามารถเตรียมรูปภาพได้"));
    image.src = url;
  });
}

async function createCroppedProfileFile(crop: CropState) {
  const image = await loadImage(crop.sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("อุปกรณ์นี้ไม่รองรับการ Crop รูป");

  const ratio = OUTPUT_SIZE / CROP_SIZE;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image,
    crop.offsetX * ratio,
    crop.offsetY * ratio,
    crop.naturalWidth * crop.scale * ratio,
    crop.naturalHeight * crop.scale * ratio
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result
        ? resolve(result)
        : reject(new Error("ไม่สามารถสร้างรูปที่ Crop ได้")),
      "image/jpeg",
      0.84
    );
  });

  return new File([blob], `profile-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [uploading, setUploading] = useState<AssetType | null>(null);
  const [uploadStage, setUploadStage] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [crop, setCrop] = useState<CropState | null>(null);
  const [cropping, setCropping] = useState(false);
  const [telegramStatus, setTelegramStatus] =
    useState<TelegramStatus | null>(null);
  const [telegramProcessing, setTelegramProcessing] = useState(false);

  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originalX: 0,
    originalY: 0,
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, position, role, account_status, profile_image_file_id, signature_file_id")
        .eq("id", user.id)
        .single();

      const profileData = data as Profile | null;
      if (error || !profileData || profileData.account_status !== "active") {
        router.replace("/login");
        return;
      }

      setProfile(profileData);

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return;

      if (profileData.profile_image_file_id) {
        const cachedProfileUrl = await getCachedProfileImageUrl(
          profileData.profile_image_file_id,
          accessToken
        );

        setProfileUrl(cachedProfileUrl);
      }

      if (profileData.signature_file_id) {
        const cachedSignatureUrl = await getCachedProfileAssetUrl(
          "signature",
          profileData.signature_file_id,
          accessToken
        );

        setSignatureUrl(cachedSignatureUrl);
      }
    }

    void load();
    void loadTelegramStatus();
  }, [router, supabase]);

  async function telegramRequest(
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

    const response = await fetch("/api/account/telegram", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "ดำเนินการ Telegram ไม่สำเร็จ");
    }

    return result;
  }

  async function loadTelegramStatus() {
    try {
      const result = await telegramRequest("GET");
      setTelegramStatus({
        connected: result.connected === true,
        telegram: result.telegram ?? null,
      });
    } catch (error) {
      console.error("Load Telegram status failed:", error);
      setTelegramStatus({ connected: false, telegram: null });
    }
  }

  async function waitForTelegramConnection(
    attempts = 8,
    delayMs = 1500,
  ) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await telegramRequest("GET");

      const nextStatus: TelegramStatus = {
        connected: result.connected === true,
        telegram: result.telegram ?? null,
      };

      setTelegramStatus(nextStatus);

      if (nextStatus.connected) {
        setMessageType("success");
        setMessage("เชื่อม Telegram สำเร็จแล้ว");
        return true;
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, delayMs),
        );
      }
    }

    return false;
  }

  async function connectTelegram() {
    setTelegramProcessing(true);
    setMessage("");

    try {
      const result = await telegramRequest("POST", { action: "connect" });
      if (!result.url) throw new Error("ไม่พบลิงก์ Telegram Bot");
      sessionStorage.setItem("telegram-link-pending", "1");

      window.location.href = result.url;
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "สร้างลิงก์เชื่อม Telegram ไม่สำเร็จ",
      );
      setTelegramProcessing(false);
    }
  }

  async function testTelegram() {
    setTelegramProcessing(true);
    setMessage("");

    try {
      const result = await telegramRequest("POST", { action: "test" });
      setMessageType("success");
      setMessage(result.message || "ส่งข้อความทดสอบแล้ว");
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ส่งข้อความทดสอบไม่สำเร็จ",
      );
    } finally {
      setTelegramProcessing(false);
    }
  }

  async function disconnectTelegram() {
    if (!window.confirm("ยืนยันยกเลิกการเชื่อม Telegram?")) return;

    setTelegramProcessing(true);
    setMessage("");

    try {
      const result = await telegramRequest("DELETE");
      setTelegramStatus({ connected: false, telegram: null });
      setMessageType("success");
      setMessage(result.message || "ยกเลิกการเชื่อม Telegram แล้ว");
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ยกเลิกการเชื่อม Telegram ไม่สำเร็จ",
      );
    } finally {
      setTelegramProcessing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function refreshPendingTelegramConnection() {
      if (cancelled) return;

      const pending =
        sessionStorage.getItem("telegram-link-pending") === "1";

      if (!pending) {
        await loadTelegramStatus();
        return;
      }

      setTelegramProcessing(true);

      try {
        const connected = await waitForTelegramConnection();

        if (connected) {
          sessionStorage.removeItem("telegram-link-pending");
        } else {
          setMessageType("error");
          setMessage(
            "ยังไม่พบการเชื่อม Telegram กรุณากด Start ในแชต Bot แล้วกลับมาหน้านี้",
          );
        }
      } catch (error) {
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "ตรวจสอบสถานะ Telegram ไม่สำเร็จ",
        );
      } finally {
        if (!cancelled) setTelegramProcessing(false);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshPendingTelegramConnection();
      }
    }

    void refreshPendingTelegramConnection();

    window.addEventListener(
      "focus",
      refreshPendingTelegramConnection,
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "focus",
        refreshPendingTelegramConnection,
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  async function uploadFile(file: File, type: AssetType) {
    setUploading(type);
    setUploadStage("กำลังเตรียมไฟล์...");
    setMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      const immediateUrl = URL.createObjectURL(file);
      if (type === "profile") {
        setProfileUrl(immediateUrl);
      } else {
        setSignatureUrl(immediateUrl);
      }

      setUploadStage("กำลังอัปโหลดไป Google Drive...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch("/api/account/profile-assets", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "อัปโหลดไฟล์ไม่สำเร็จ");
      }

      if (type === "profile") {
        setCachedProfileImageUrl(result.fileId, immediateUrl);
      } else {
        setCachedProfileAssetUrl("signature", result.fileId, immediateUrl);
      }

      setProfile((current) => {
        if (!current) return current;
        return type === "profile"
          ? { ...current, profile_image_file_id: result.fileId }
          : { ...current, signature_file_id: result.fileId };
      });

      setUploadStage("บันทึกสำเร็จ");
      setMessageType("success");
      setMessage(
        type === "profile"
          ? "บันทึกรูปโปรไฟล์เรียบร้อยแล้ว"
          : "บันทึกลายเซ็นเรียบร้อยแล้ว"
      );
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(null);
      window.setTimeout(() => setUploadStage(""), 1200);
    }
  }

  async function chooseProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessageType("error");
      setMessage("รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setMessageType("error");
      setMessage("รูปต้นฉบับต้องมีขนาดไม่เกิน 12 MB");
      return;
    }

    try {
      const sourceUrl = URL.createObjectURL(file);
      const dimensions = await readImageDimensions(sourceUrl);
      const minScale = Math.max(
        CROP_SIZE / dimensions.width,
        CROP_SIZE / dimensions.height
      );
      const displayWidth = dimensions.width * minScale;
      const displayHeight = dimensions.height * minScale;

      setCrop({
        sourceUrl,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        scale: minScale,
        minScale,
        offsetX: (CROP_SIZE - displayWidth) / 2,
        offsetY: (CROP_SIZE - displayHeight) / 2,
      });
      setMessage("");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "เปิดรูปภาพไม่สำเร็จ");
    }
  }

  function constrainOffsets(nextX: number, nextY: number, nextScale: number) {
    if (!crop) return { x: nextX, y: nextY };
    const displayWidth = crop.naturalWidth * nextScale;
    const displayHeight = crop.naturalHeight * nextScale;
    return {
      x: clamp(nextX, CROP_SIZE - displayWidth, 0),
      y: clamp(nextY, CROP_SIZE - displayHeight, 0),
    };
  }

  function handleZoom(value: number) {
    if (!crop) return;

    const oldWidth = crop.naturalWidth * crop.scale;
    const oldHeight = crop.naturalHeight * crop.scale;
    const centerX = (CROP_SIZE / 2 - crop.offsetX) / oldWidth;
    const centerY = (CROP_SIZE / 2 - crop.offsetY) / oldHeight;
    const newWidth = crop.naturalWidth * value;
    const newHeight = crop.naturalHeight * value;
    const constrained = constrainOffsets(
      CROP_SIZE / 2 - centerX * newWidth,
      CROP_SIZE / 2 - centerY * newHeight,
      value
    );

    setCrop({
      ...crop,
      scale: value,
      offsetX: constrained.x,
      offsetY: constrained.y,
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originalX: crop.offsetX,
      originalY: crop.offsetY,
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!crop || !dragRef.current.active) return;
    const constrained = constrainOffsets(
      dragRef.current.originalX + event.clientX - dragRef.current.startX,
      dragRef.current.originalY + event.clientY - dragRef.current.startY,
      crop.scale
    );
    setCrop({ ...crop, offsetX: constrained.x, offsetY: constrained.y });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function confirmCrop() {
    if (!crop) return;
    setCropping(true);

    try {
      const croppedFile = await createCroppedProfileFile(crop);
      const sourceUrl = crop.sourceUrl;
      setCrop(null);
      URL.revokeObjectURL(sourceUrl);
      await uploadFile(croppedFile, "profile");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Crop รูปไม่สำเร็จ");
    } finally {
      setCropping(false);
    }
  }

  function cancelCrop() {
    if (crop?.sourceUrl) URL.revokeObjectURL(crop.sourceUrl);
    setCrop(null);
  }

  async function chooseSignature(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessageType("error");
      setMessage("รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessageType("error");
      setMessage("ไฟล์ลายเซ็นต้องมีขนาดไม่เกิน 5 MB");
      return;
    }

    await uploadFile(file, "signature");
  }

  if (!profile) {
    return <main className={styles.loading}>กำลังโหลดข้อมูลส่วนตัว...</main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={() => router.push("/attendance")}
          aria-label="กลับหน้าลงเวลา"
        >
          ←
        </button>

        <div className={styles.headerTitle}>
          <span>MY PROFILE</span>
          <h1>ข้อมูลส่วนตัว</h1>
        </div>

        <div className={styles.telegramActions}>
          <span
            className={
              telegramStatus?.connected
                ? styles.telegramConnected
                : styles.telegramDisconnected
            }
            title={
              telegramStatus?.connected
                ? "เชื่อม Telegram แล้ว"
                : "ยังไม่เชื่อม Telegram"
            }
          >
            {telegramStatus?.connected ? "●" : "○"}
          </span>

          <button
            type="button"
            className={
              telegramStatus?.connected
                ? styles.telegramConnectedButton
                : styles.telegramConnectButton
            }
            onClick={() => void connectTelegram()}
            disabled={telegramProcessing || telegramStatus?.connected}
            title={
              telegramStatus?.connected
                ? `เชื่อมแล้ว ${getTelegramDisplayName(telegramStatus)}`
                : "เชื่อมบัญชี Telegram"
            }
          >
            {telegramProcessing
              ? "กำลังตรวจสอบ..."
              : telegramStatus?.connected
                ? "✓ เชื่อมแล้ว"
                : "เชื่อม"}
          </button>

          <button
            type="button"
            className={styles.telegramSmallButton}
            onClick={() => void testTelegram()}
            disabled={telegramProcessing || !telegramStatus?.connected}
          >
            ทดสอบ
          </button>

          <button
            type="button"
            className={styles.telegramDangerButton}
            onClick={() => void disconnectTelegram()}
            disabled={telegramProcessing || !telegramStatus?.connected}
          >
            ยกเลิก
          </button>
        </div>
      </header>

      {telegramStatus?.connected && (
        <div className={styles.telegramIdentity}>
          <span>✓ Telegram เชื่อมแล้ว</span>
          {getTelegramDisplayName(telegramStatus) && (
            <strong>{getTelegramDisplayName(telegramStatus)}</strong>
          )}
        </div>
      )}

      {message && (
        <div className={messageType === "success" ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}

      {uploadStage && (
        <div className={styles.uploadStatus}>
          <span className={styles.uploadSpinner} />
          {uploadStage}
        </div>
      )}

      <section className={styles.profileCard}>
        <div className={styles.profileImage}>
          {profileUrl ? <img src={profileUrl} alt="รูปโปรไฟล์" /> : <span>{profile.full_name.charAt(0)}</span>}
        </div>
        <div>
          <h2>{profile.full_name}</h2>
          <p>{profile.position || getRoleLabel(profile.role)}</p>
          <small>{profile.phone}</small>
        </div>
      </section>

      <section className={styles.uploadGrid}>
        <article>
          <div className={styles.preview}>
            {profileUrl ? <img src={profileUrl} alt="ตัวอย่างรูปโปรไฟล์" /> : <span>ไม่มีรูปโปรไฟล์</span>}
          </div>
          <h2>รูปโปรไฟล์</h2>
          <p>เลือกรูปแล้วลากตำแหน่งและซูมเพื่อ Crop ได้ ระบบจะย่อรูปก่อนอัปโหลด</p>
          <label className={styles.uploadButton}>
            {uploading === "profile" ? "กำลังอัปโหลด..." : "เลือกรูปและ Crop"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={(event) => void chooseProfileImage(event)} />
          </label>
        </article>

        <article>
          <div className={`${styles.preview} ${styles.signaturePreview}`}>
            {signatureUrl ? <img src={signatureUrl} alt="ตัวอย่างลายเซ็น" /> : <span>ยังไม่มีลายเซ็น</span>}
          </div>
          <h2>ลายเซ็น</h2>
          <p>แนะนำไฟล์ PNG พื้นหลังโปร่งใส ขนาดไม่เกิน 5 MB</p>
          <label className={styles.uploadButton}>
            {uploading === "signature" ? "กำลังอัปโหลด..." : "เลือกลายเซ็น"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={(event) => void chooseSignature(event)} />
          </label>
        </article>
      </section>

      <section className={styles.securityCard}>
        <div className={styles.securityIcon}>🔐</div>

        <div className={styles.securityContent}>
          <small>ACCOUNT SECURITY</small>
          <h2>ความปลอดภัยของบัญชี</h2>
          <p>
            เปลี่ยน PIN สำหรับเข้าสู่ระบบได้จากข้อมูลส่วนตัว
            ควรใช้ PIN 6 หลักที่คาดเดาได้ยากและไม่บอกผู้อื่น
          </p>
        </div>

        <button
          type="button"
          className={styles.changePinButton}
          onClick={() => router.push("/account/change-pin")}
        >
          เปลี่ยน PIN
        </button>
      </section>

      {crop && (
        <div className={styles.cropOverlay} role="dialog" aria-modal="true">
          <section className={styles.cropModal}>
            <header>
              <div>
                <small>PROFILE PHOTO</small>
                <h2>จัดตำแหน่งรูปโปรไฟล์</h2>
              </div>
              <button type="button" onClick={cancelCrop} aria-label="ปิดหน้าต่าง Crop">×</button>
            </header>

            <p className={styles.cropHelp}>ลากรูปเพื่อขยับตำแหน่ง และใช้แถบด้านล่างเพื่อซูม</p>

            <div className={styles.cropViewport} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <img
                src={crop.sourceUrl}
                alt="รูปสำหรับ Crop"
                draggable={false}
                style={{
                  width: crop.naturalWidth * crop.scale,
                  height: crop.naturalHeight * crop.scale,
                  transform: `translate(${crop.offsetX}px, ${crop.offsetY}px)`,
                }}
              />
              <div className={styles.cropGuide} />
            </div>

            <label className={styles.zoomControl}>
              <span>ย่อ</span>
              <input
                type="range"
                min={crop.minScale}
                max={crop.minScale * 3}
                step={crop.minScale / 100}
                value={crop.scale}
                onChange={(event) => handleZoom(Number(event.target.value))}
              />
              <span>ขยาย</span>
            </label>

            <div className={styles.cropActions}>
              <button type="button" className={styles.cancelButton} onClick={cancelCrop} disabled={cropping}>ยกเลิก</button>
              <button type="button" className={styles.confirmButton} onClick={() => void confirmCrop()} disabled={cropping}>
                {cropping ? "กำลังเตรียมรูป..." : "ใช้รูปนี้"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
