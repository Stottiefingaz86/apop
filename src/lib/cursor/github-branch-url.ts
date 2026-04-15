/** Build https://github.com/org/repo/tree/branch from a repo web URL and branch name. */
export function githubTreeUrl(repositoryWebUrl: string, branch: string): string | null {
  const b = branch.trim();
  if (!b) return null;
  const u = repositoryWebUrl.trim().replace(/\.git$/i, "");
  const m = u.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  const path = b
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `https://github.com/${m[1]}/${m[2]}/tree/${path}`;
}
