export {};

declare global {
  namespace Express {
    interface Request {
      adminContext?: {
        authType: "api_token" | "panel_session";
        businessId?: string;
        username?: string;
      };
    }
  }
}
