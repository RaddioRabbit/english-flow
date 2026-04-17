import { deleteAssetData, loadAssetData, saveAssetData } from "./browser-image-store";
import {
  deleteImage,
  deleteImages,
  getImageUrl,
  isSupabaseConfigured,
  type ImageType,
  uploadImage,
} from "./supabase-image-store";
import type { ModuleId } from "./task-store";

export type StorageType = "local" | "cloud";

interface ImageStoreConfig {
  preferredStorage: StorageType;
}

const defaultConfig: ImageStoreConfig = {
  preferredStorage: "cloud",
};

export async function saveImage(
  imageType: ImageType,
  taskId: string,
  fileName: string,
  dataUrl: string,
  config: Partial<ImageStoreConfig> = {},
): Promise<{ success: boolean; url?: string; localOnly?: boolean; error?: string }> {
  const { preferredStorage } = { ...defaultConfig, ...config };
  const localStoreName = imageType === "reference" ? "reference-assets" : "generated-images";

  await saveAssetData(localStoreName, [{ key: `${taskId}/${fileName}`, dataUrl }]);

  if (preferredStorage === "cloud" && isSupabaseConfigured()) {
    const result = await uploadImage(imageType, taskId, fileName, dataUrl);
    if (result.success) {
      return { success: true, url: result.url };
    }

    console.warn("Cloud upload failed, kept local copy only.", result.error);
    return { success: true, localOnly: true, url: dataUrl, error: result.error };
  }

  return { success: true, localOnly: true, url: dataUrl };
}

export async function saveImages(
  imageType: ImageType,
  taskId: string,
  images: Array<{ fileName: string; dataUrl: string }>,
  config: Partial<ImageStoreConfig> = {},
): Promise<{ success: boolean; urls?: Record<string, string>; localOnly?: boolean; errors?: string[] }> {
  const urls: Record<string, string> = {};
  const errors: string[] = [];
  let hasCloudUpload = false;
  let hasLocalOnly = false;

  for (const image of images) {
    const result = await saveImage(imageType, taskId, image.fileName, image.dataUrl, config);
    if (result.success) {
      urls[image.fileName] = result.url || image.dataUrl;
      if (result.localOnly) {
        hasLocalOnly = true;
      } else {
        hasCloudUpload = true;
      }
    } else {
      errors.push(`${image.fileName}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    urls,
    localOnly: hasLocalOnly && !hasCloudUpload,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function loadImage(
  imageType: ImageType,
  taskId: string,
  fileName: string,
): Promise<string | null> {
  const localStoreName = imageType === "reference" ? "reference-assets" : "generated-images";
  const key = `${taskId}/${fileName}`;
  const localData = await loadAssetData(localStoreName, [key]);

  if (localData[key]) {
    return localData[key];
  }

  if (isSupabaseConfigured()) {
    return getImageUrl(imageType, taskId, fileName);
  }

  return null;
}

export async function removeImage(
  imageType: ImageType,
  taskId: string,
  fileName: string,
): Promise<boolean> {
  const localStoreName = imageType === "reference" ? "reference-assets" : "generated-images";
  const key = `${taskId}/${fileName}`;

  await deleteAssetData(localStoreName, [key]);

  if (isSupabaseConfigured()) {
    return deleteImage(imageType, taskId, fileName);
  }

  return true;
}

export async function removeTaskImages(
  taskId: string,
  referenceImages: Record<ModuleId, { id?: string; fileName: string } | null>,
  generatedImages: Partial<Record<ModuleId, { id?: string; fileName: string }>>,
): Promise<void> {
  const referenceAssets = Object.values(referenceImages).filter(
    (asset): asset is NonNullable<typeof asset> => Boolean(asset?.fileName),
  );
  const generatedAssets = Object.values(generatedImages).filter(
    (asset): asset is NonNullable<typeof asset> => Boolean(asset?.fileName),
  );

  await deleteAssetData(
    "reference-assets",
    referenceAssets
      .map((asset) => `${asset.id || taskId}/${asset.fileName}`)
      .filter((key): key is string => Boolean(key)),
  );
  await deleteAssetData(
    "generated-images",
    generatedAssets
      .map((asset) => `${asset.id || taskId}/${asset.fileName}`)
      .filter((key): key is string => Boolean(key)),
  );

  if (isSupabaseConfigured()) {
    await Promise.all(referenceAssets.map((asset) => deleteImage("reference", asset.id || taskId, asset.fileName)));
    await deleteImages(
      "generated",
      taskId,
      generatedAssets.map((asset) => asset.fileName),
    );
  }
}

export async function syncTaskImagesToCloud(
  taskId: string,
  images: Array<{ imageType: ImageType; fileName: string; dataUrl: string }>,
): Promise<{ success: boolean; uploaded: number; failed: number }> {
  if (!isSupabaseConfigured()) {
    return { success: false, uploaded: 0, failed: images.length };
  }

  let uploaded = 0;
  let failed = 0;

  for (const image of images) {
    const result = await uploadImage(image.imageType, taskId, image.fileName, image.dataUrl);
    if (result.success) {
      uploaded += 1;
    } else {
      failed += 1;
    }
  }

  return { success: failed === 0, uploaded, failed };
}

export { isSupabaseConfigured };
