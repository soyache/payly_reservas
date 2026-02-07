import axios from "axios";
import { env } from "../config/env";
import type { MetaOutboundPayload } from "./types";

const BASE_URL = `https://graph.facebook.com/${env.GRAPH_API_VERSION}`;

function authHeaders() {
  return { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` };
}

export async function sendMessage(
  phoneNumberId: string,
  payload: MetaOutboundPayload
): Promise<{ messageId: string }> {
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  const response = await axios.post(url, payload, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    timeout: 15_000,
  });

  const messageId = response.data?.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("Meta API did not return a message ID");
  }

  return { messageId };
}

export async function getMediaUrl(mediaId: string): Promise<string> {
  const url = `${BASE_URL}/${mediaId}`;

  const response = await axios.get(url, {
    headers: authHeaders(),
    timeout: 10_000,
  });

  const mediaUrl = response.data?.url;
  if (!mediaUrl) {
    throw new Error("Meta API did not return a media URL");
  }

  return mediaUrl;
}

export async function downloadMedia(mediaUrl: string): Promise<Buffer> {
  const response = await axios.get(mediaUrl, {
    headers: authHeaders(),
    responseType: "arraybuffer",
    timeout: 30_000,
  });

  return Buffer.from(response.data);
}
