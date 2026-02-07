import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-admin-token"] as string | undefined;

  if (!token || token !== env.ADMIN_API_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
