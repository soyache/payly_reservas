import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { verifyAdminSessionToken } from "../auth/adminSession";

function getBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-admin-token"] as string | undefined;

  if (token && token === env.ADMIN_API_TOKEN) {
    req.adminContext = { authType: "api_token" };
    next();
    return;
  }

  const sessionToken =
    getBearerToken(req) || (req.headers["x-admin-session"] as string | undefined);
  if (sessionToken) {
    const payload = verifyAdminSessionToken(sessionToken);
    if (payload) {
      req.adminContext = {
        authType: "panel_session",
        businessId: payload.businessId,
        username: payload.username,
      };
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}
