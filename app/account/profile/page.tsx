"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [uploading, setUploading] = useState<AssetType | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    let profileObjectUrl = "";
    let signatureObjectUrl = "";

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, phone, position, role, account_status, profile_image_file_id, signature_file_id"
        )
        .eq("id", user.id)
        .single<Profile>();

      if (error || !data || data.account_status !== "active") {
        router.replace("/login");
        return;
      }

      setProfile(data);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;

      if (!accessToken) return;

      async function loadAsset(
        fileId: string,
        setter: (value: string) => void
      ) {
        const response = await fetch(
          `/api/account/profile-assets?fileId=${encodeURIComponent(fileId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) return "";
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setter(url);
        return url;
      }

      if (data.profile_image_file_id) {
        profileObjectUrl =
          await loadAsset(data.profile_image_file_id, setProfileUrl);
      }

      if (data.signature_file_id) {
        signatureObjectUrl =
          await loadAsset(data.signature_file_id, setSignatureUrl);
      }
    }

    void load();

    return () => {
      if (profileObjectUrl) URL.revokeObjectURL(profileObjectUrl);
      if (signatureObjectUrl) URL.revokeObjectURL(signatureObjectUrl);
    };
  }, [router, supabase]);

  async function uploadAsset(
    event: ChangeEvent<HTMLInputElement>,
    type: AssetType
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowed =
      type === "profile"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["image/png", "image/jpeg", "image/webp"];

    if (!allowed.includes(file.type)) {
      setMessageType("error");
      setMessage("รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessageType("error");
      setMessage("ไฟล์ต้องมีขนาดไม่เกิน 5 MB");
      return;
    }

    setUploading(type);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch("/api/account/profile-assets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "อัปโหลดไฟล์ไม่สำเร็จ");
      }

      const previewUrl = URL.createObjectURL(file);

      if (type === "profile") {
        if (profileUrl) URL.revokeObjectURL(profileUrl);
        setProfileUrl(previewUrl);
        setProfile((current) =>
          current
            ? { ...current, profile_image_file_id: result.fileId }
            : current
        );
      } else {
        if (signatureUrl) URL.revokeObjectURL(signatureUrl);
        setSignatureUrl(previewUrl);
        setProfile((current) =>
          current ? { ...current, signature_file_id: result.fileId } : current
        );
      }

      setMessageType("success");
      setMessage(
        type === "profile"
          ? "บันทึกรูปโปรไฟล์เรียบร้อยแล้ว"
          : "บันทึกลายเซ็นเรียบร้อยแล้ว"
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ"
      );
    } finally {
      setUploading(null);
    }
  }

  if (!profile) {
    return <main className={styles.loading}>กำลังโหลดข้อมูลส่วนตัว...</main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => router.push("/attendance")}>
          ←
        </button>
        <div>
          <span>MY PROFILE</span>
          <h1>ข้อมูลส่วนตัว</h1>
        </div>
      </header>

      {message && (
        <div
          className={
            messageType === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          {message}
        </div>
      )}

      <section className={styles.profileCard}>
        <div className={styles.profileImage}>
          {profileUrl ? (
            <img src={profileUrl} alt="รูปโปรไฟล์" />
          ) : (
            <span>{profile.full_name.charAt(0)}</span>
          )}
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
            {profileUrl ? (
              <img src={profileUrl} alt="ตัวอย่างรูปโปรไฟล์" />
            ) : (
              <span>ไม่มีรูปโปรไฟล์</span>
            )}
          </div>

          <h2>รูปโปรไฟล์</h2>
          <p>ใช้ไฟล์ JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB</p>

          <label className={styles.uploadButton}>
            {uploading === "profile" ? "กำลังอัปโหลด..." : "เลือกรูปโปรไฟล์"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading !== null}
              onChange={(event) => void uploadAsset(event, "profile")}
            />
          </label>
        </article>

        <article>
          <div className={`${styles.preview} ${styles.signaturePreview}`}>
            {signatureUrl ? (
              <img src={signatureUrl} alt="ตัวอย่างลายเซ็น" />
            ) : (
              <span>ยังไม่มีลายเซ็น</span>
            )}
          </div>

          <h2>ลายเซ็น</h2>
          <p>แนะนำไฟล์ PNG พื้นหลังโปร่งใส ขนาดไม่เกิน 5 MB</p>

          <label className={styles.uploadButton}>
            {uploading === "signature" ? "กำลังอัปโหลด..." : "เลือกลายเซ็น"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading !== null}
              onChange={(event) => void uploadAsset(event, "signature")}
            />
          </label>
        </article>
      </section>
    </main>
  );
}
