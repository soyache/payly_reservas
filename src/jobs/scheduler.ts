import cron from "node-cron";
import { processOutboundQueue } from "./outboundWorker";

let isProcessing = false;

export function startScheduler(): void {
  // Run outbound worker every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await processOutboundQueue();
    } catch (err) {
      console.error("Outbound worker error:", err);
    } finally {
      isProcessing = false;
    }
  });

  console.log("Scheduler started: outbound worker runs every 30s");
}
