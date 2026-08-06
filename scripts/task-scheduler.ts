import { runTaskAutomation } from "@/lib/task-automation";

const intervalMs = Math.max(60_000, Number(process.env.TASK_SCHEDULER_INTERVAL_MS || 300_000));
async function tick() { try { const result = await runTaskAutomation(); console.log(JSON.stringify({ service: "task-scheduler", ...result })); } catch (error) { console.error("task-scheduler failed", error); } }
void tick(); setInterval(() => void tick(), intervalMs);
