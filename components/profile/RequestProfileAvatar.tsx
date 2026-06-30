"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RequestProfileAvatarProps = {
  fileId?: string | null;
  name?: string | null;
  className: string;
};

const avatarUrlCache = new Map<string, string>();

export default function RequestProfileAvatar({
  fileId,
  name,
  className,
}: RequestProfileAvatarProps) {
  const supabase = useMemo(() => createClient(), []);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const initial = name?.trim().charAt(0) || "U";

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      setImageFailed(false);

      if (!fileId) {
        setImageUrl("");
        return;
      }

      const cachedUrl = avatarUrlCache.get(fileId);
      if (cachedUrl) {
        setImageUrl(cachedUrl);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      try {
        const response = await fetch(
          `/api/account/profile-assets?fileId=${encodeURIComponent(fileId)}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok || cancelled) return;

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        avatarUrlCache.set(fileId, objectUrl);

        if (!cancelled) setImageUrl(objectUrl);
      } catch {
        if (!cancelled) setImageUrl("");
      }
    }

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [fileId, supabase]);

  return (
    <div className={className} aria-label={`รูปโปรไฟล์ ${name || ""}`.trim()}>
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}
