import { getSupabaseClient, SUPABASE_BUCKET, isSupabaseConfigured } from "./supabase-client";

export type ImageType = "reference" | "generated";
export type StorageObjectType = ImageType | "audio" | "video";
export { isSupabaseConfigured };

async function imageSourceToBlob(imageSource: string): Promise<Blob> {
  if (!imageSource) {
    throw new Error("Image source is empty.");
  }

  if (imageSource.startsWith("data:")) {
    const [metadata, payload = ""] = imageSource.split(",", 2);
    const mimeMatch = metadata.match(/^data:([^;,]+)/i);
    const mimeType = mimeMatch?.[1] ?? "application/octet-stream";

    if (metadata.includes(";base64")) {
      const byteString = atob(payload);
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);

      for (let i = 0; i < byteString.length; i += 1) {
        uint8Array[i] = byteString.charCodeAt(i);
      }

      return new Blob([arrayBuffer], { type: mimeType });
    }

    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  const response = await fetch(imageSource);
  if (!response.ok) {
    throw new Error(`Failed to fetch image source: HTTP ${response.status}`);
  }

  return response.blob();
}

function buildStoragePath(objectType: StorageObjectType, taskId: string, fileName: string): string {
  switch (objectType) {
    case "reference":
      return `references/${taskId}/${fileName}`;
    case "generated":
      return `generated/${taskId}/${fileName}`;
    case "audio":
      return `audio/${taskId}/${fileName}`;
    case "video":
      return `videos/sentence-explanation/${taskId}/${fileName}`;
    default:
      return `generated/${taskId}/${fileName}`;
  }
}

export async function uploadStorageObject(
  objectType: StorageObjectType,
  taskId: string,
  fileName: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Supabase is not configured." };
  }

  try {
    const blob = await imageSourceToBlob(dataUrl);
    const path = buildStoragePath(objectType, taskId, fileName);

    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });

    if (error) {
      console.error("Failed to upload image.", error);
      return { success: false, error: error.message };
    }

    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
    return { success: true, url: data.publicUrl };
  } catch (error) {
    console.error("Failed to upload image.", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload image.",
    };
  }
}

export async function uploadImage(
  imageType: ImageType,
  taskId: string,
  fileName: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  return uploadStorageObject(imageType, taskId, fileName, dataUrl);
}

export async function uploadImages(
  imageType: ImageType,
  taskId: string,
  images: Array<{ fileName: string; dataUrl: string }>,
): Promise<{ success: boolean; urls?: Record<string, string>; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const urls: Record<string, string> = {};

  for (const image of images) {
    const result = await uploadImage(imageType, taskId, image.fileName, image.dataUrl);
    if (result.success && result.url) {
      urls[image.fileName] = result.url;
    } else {
      console.error(`Failed to upload ${image.fileName}.`, result.error);
    }
  }

  return { success: true, urls };
}

export async function deleteStorageObject(
  objectType: StorageObjectType,
  taskId: string,
  fileName: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  try {
    const path = buildStoragePath(objectType, taskId, fileName);
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([path]);

    if (error) {
      console.error("Failed to delete image.", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to delete image.", error);
    return false;
  }
}

export async function deleteImage(imageType: ImageType, taskId: string, fileName: string): Promise<boolean> {
  return deleteStorageObject(imageType, taskId, fileName);
}

export async function deleteStorageObjects(
  objectType: StorageObjectType,
  taskId: string,
  fileNames: string[],
): Promise<boolean> {
  if (!isSupabaseConfigured() || !fileNames.length) {
    return false;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  try {
    const paths = fileNames.map((fileName) => buildStoragePath(objectType, taskId, fileName));
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove(paths);

    if (error) {
      console.error("Failed to delete images.", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to delete images.", error);
    return false;
  }
}

export async function deleteImages(imageType: ImageType, taskId: string, fileNames: string[]): Promise<boolean> {
  return deleteStorageObjects(imageType, taskId, fileNames);
}

export function getStorageObjectUrl(objectType: StorageObjectType, taskId: string, fileName: string): string {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return "";
  }

  const path = buildStoragePath(objectType, taskId, fileName);
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function getImageUrl(imageType: ImageType, taskId: string, fileName: string): string {
  return getStorageObjectUrl(imageType, taskId, fileName);
}

export async function listTaskImages(
  imageType: ImageType,
  taskId: string,
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Supabase is not configured." };
  }

  try {
    const path = buildStoragePath(imageType, taskId, "").replace(/\/$/, "");

    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(path);

    if (error) {
      console.error("Failed to list images.", error);
      return { success: false, error: error.message };
    }

    return { success: true, files: data?.map((item) => item.name) || [] };
  } catch (error) {
    console.error("Failed to list images.", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to list images.",
    };
  }
}
