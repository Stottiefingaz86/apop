import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCursorBuildRepository } from "@/lib/cursor/env";

export type SpecKitFiles = {
  spec: string | null;
  plan: string | null;
  tasks: string | null;
  requirements: string | null;
  research: string | null;
};

/**
 * Fetches spec-kit markdown files from a branch in the delivery repo.
 * Uses git (which has stored credentials) to handle private repos.
 * Spec-kit outputs files to specs/<feature-name>/ — we find the latest spec folder.
 */
export async function fetchSpecKitFilesFromBranch(
  branch: string,
): Promise<SpecKitFiles> {
  const repoUrl = getCursorBuildRepository();
  if (!repoUrl) return empty();

  const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (!match) return empty();

  const cloneUrl = `https://github.com/${match[1]}.git`;
  const workDir = join(tmpdir(), `apop-spec-fetch-${Date.now()}`);

  try {
    mkdirSync(workDir, { recursive: true });

    execSync(
      `git clone --depth 1 --branch ${shellQuote(branch)} --single-branch ${shellQuote(cloneUrl)} .`,
      { cwd: workDir, stdio: "pipe", timeout: 30_000 },
    );

    const specsDir = join(workDir, "specs");
    const specFiles = findSpecKitFiles(workDir, specsDir);

    console.log(
      `[fetch-spec-files] branch=${branch} found: spec=${!!specFiles.spec} plan=${!!specFiles.plan} tasks=${!!specFiles.tasks} req=${!!specFiles.requirements} research=${!!specFiles.research}`,
    );

    return specFiles;
  } catch (e) {
    console.error("[fetch-spec-files] git clone failed:", e instanceof Error ? e.message : e);
    return empty();
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch { /* cleanup best-effort */ }
  }
}

function findSpecKitFiles(rootDir: string, specsDir: string): SpecKitFiles {
  const names = ["spec.md", "plan.md", "tasks.md", "requirements.md", "research.md"] as const;
  type Key = "spec" | "plan" | "tasks" | "requirements" | "research";

  const result: SpecKitFiles = empty();

  if (existsSync(specsDir)) {
    const entries = readdirSafe(specsDir);
    const featureDirs = entries
      .map((name) => join(specsDir, name))
      .filter((p) => {
        try { return require("node:fs").statSync(p).isDirectory(); } catch { return false; }
      });

    for (const dir of featureDirs) {
      for (const name of names) {
        const key = name.replace(".md", "").replace("requirements", "requirements") as Key;
        const filePath = join(dir, name);
        if (!result[key] && existsSync(filePath)) {
          result[key] = readFileSync(filePath, "utf-8");
        }
      }
    }
  }

  for (const name of names) {
    const key = name.replace(".md", "") as Key;
    if (!result[key]) {
      const filePath = join(rootDir, name);
      if (existsSync(filePath)) {
        result[key] = readFileSync(filePath, "utf-8");
      }
    }
  }

  return result;
}

function readdirSafe(dir: string): string[] {
  try {
    return require("node:fs").readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function empty(): SpecKitFiles {
  return { spec: null, plan: null, tasks: null, requirements: null, research: null };
}
