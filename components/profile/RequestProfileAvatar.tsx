"use client";

import { useEffect, useMemo, useState } from "react";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";

type RequestProfileAvatarProps = {
  fileId?: string | null;
  name?: string | null;
  className: string;
};

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

      const {
        data: { session },
      } = await supabase.auth.getSession();

      try {
        const cachedUrl = await getCachedProfileImageUrl(
          fileId,
          session?.access_token
        );

        if (!cancelled) setImageUrl(cachedUrl);
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
