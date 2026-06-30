const profileImageUrlCache = new Map<string, string>();
const pendingProfileImageRequests = new Map<string, Promise<string>>();

export async function getCachedProfileImageUrl(
  fileId: string | null | undefined,
  accessToken: string | null | undefined
) {
  if (!fileId || !accessToken) return "";

  const cachedUrl = profileImageUrlCache.get(fileId);
  if (cachedUrl) return cachedUrl;

  const pendingRequest = pendingProfileImageRequests.get(fileId);
  if (pendingRequest) return pendingRequest;

  const request = fetch(
    `/api/account/profile-assets?fileId=${encodeURIComponent(fileId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  )
    .then(async (response) => {
      if (!response.ok) return "";

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      profileImageUrlCache.set(fileId, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      pendingProfileImageRequests.delete(fileId);
    });

  pendingProfileImageRequests.set(fileId, request);
  return request;
}
