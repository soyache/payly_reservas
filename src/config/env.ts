import "dotenv/config";

type EnvConfig = {
  PORT: number;
  DATABASE_URL: string;
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_ACCESS_TOKEN: string;
  WEBHOOK_VERIFY_TOKEN: string;
  GRAPH_API_VERSION: string;
  UPLOAD_DIR: string;
  CONVERSATION_TIMEOUT_MINUTES: number;
  RESERVATION_EXPIRY_MINUTES: number;
  ADMIN_API_TOKEN: string;
};

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }
  return parsed;
}

export const env: EnvConfig = {
  PORT: getNumber("PORT", 3000),
  DATABASE_URL: getRequired("DATABASE_URL"),
  META_APP_ID: getRequired("META_APP_ID"),
  META_APP_SECRET: getRequired("META_APP_SECRET"),
  META_ACCESS_TOKEN: getRequired("META_ACCESS_TOKEN"),
  WEBHOOK_VERIFY_TOKEN: getRequired("WEBHOOK_VERIFY_TOKEN"),
  GRAPH_API_VERSION: process.env.GRAPH_API_VERSION || "v21.0",
  UPLOAD_DIR: process.env.UPLOAD_DIR || "./uploads",
  CONVERSATION_TIMEOUT_MINUTES: getNumber("CONVERSATION_TIMEOUT_MINUTES", 30),
  RESERVATION_EXPIRY_MINUTES: getNumber("RESERVATION_EXPIRY_MINUTES", 30),
  ADMIN_API_TOKEN: getRequired("ADMIN_API_TOKEN")
};
