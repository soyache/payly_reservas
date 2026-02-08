import type { Request, Response } from "express";

export function resolveBusinessScope(
  req: Request,
  res: Response
): string | null {
  if (req.adminContext?.authType === "panel_session" && req.adminContext.businessId) {
    return req.adminContext.businessId;
  }

  const businessId =
    typeof req.query.businessId === "string"
      ? req.query.businessId
      : typeof req.body?.businessId === "string"
        ? req.body.businessId
        : undefined;

  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return null;
  }

  return businessId;
}
