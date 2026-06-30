type ProfileAssetType = "profile" | "signature";

const profileAssetUrlCache = new Map<string, string>();
const pendingProfileAssetRequests = new Map<string, Promise<string>>();

function getAssetCacheKey(
  assetType: ProfileAssetType,
  fileId: string | null | undefined
) {
  return fileId ? `${assetType}:${fileId}` : "";
}

export function setCachedProfileAssetUrl(
  assetType: ProfileAssetType,
  fileId: string | null | undefined,
  objectUrl: string
) {
  const cacheKey = getAssetCacheKey(assetType, fileId);

  if (!cacheKey || !objectUrl) return;

  profileAssetUrlCache.set(cacheKey, objectUrl);
}

export async function getCachedProfileAssetUrl(
  assetType: ProfileAssetType,
  fileId: string | null | undefined,
  accessToken: string | null | undefined
) {
  const cacheKey = getAssetCacheKey(assetType, fileId);

  if (!cacheKey || !fileId || !accessToken) return "";

  const cachedUrl = profileAssetUrlCache.get(cacheKey);
  if (cachedUrl) return cachedUrl;

  const pendingRequest = pendingProfileAssetRequests.get(cacheKey);
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
      profileAssetUrlCache.set(cacheKey, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      pendingProfileAssetRequests.delete(cacheKey);
    });

  pendingProfileAssetRequests.set(cacheKey, request);
  return request;
}

export function setCachedProfileImageUrl(
  fileId: string | null | undefined,
  objectUrl: string
) {
  setCachedProfileAssetUrl("profile", fileId, objectUrl);
}

export async function getCachedProfileImageUrl(
  fileId: string | null | undefined,
  accessToken: string | null | undefined
) {
  return getCachedProfileAssetUrl("profile", fileId, accessToken);
}
