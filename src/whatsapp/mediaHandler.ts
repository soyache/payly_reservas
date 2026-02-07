import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { getMediaUrl, downloadMedia } from "./graphApi";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function downloadAndSavePaymentProof(
  mediaId: string,
  mimeType: string,
  businessId: string,
  appointmentId: string
): Promise<string> {
  const url = await getMediaUrl(mediaId);
  const buffer = await downloadMedia(url);

  const ext = MIME_TO_EXT[mimeType] || ".jpg";
  const dir = path.join(env.UPLOAD_DIR, businessId);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `${appointmentId}${ext}`;
  const fullPath = path.join(dir, filename);

  fs.writeFileSync(fullPath, buffer);

  return `${businessId}/${filename}`;
}
