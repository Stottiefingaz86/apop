#!/usr/bin/env node
/**
 * Kill listeners on ports APOP commonly uses (stale Next dev / duplicate servers).
 * macOS / Linux: uses lsof. Safe no-op if nothing is listening.
 */
import { execSync } from "node:child_process";

const ports = [3000, 3020];

for (const port of ports) {
  try {
    const out = execSync(`lsof -ti:${port}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pids = [...new Set(out.trim().split(/\s+/).filter(Boolean))];
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        /* ignore */
      }
    }
    if (pids.length) {
      console.log(`[apop] freed port ${port} (pids: ${pids.join(", ")})`);
    }
  } catch {
    /* no process on port */
  }
}
