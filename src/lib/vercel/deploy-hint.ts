/**
 * User-facing copy: Vercel lists Preview builds “by cursoragent” on apop/… branches vs Production “via Deploy Hook” from main.
 */

export const VERCEL_DEPLOY_HOOK_HINT =
  "APOP calls whichever deploy hook URL is configured in .env — that hook rebuilds the Git branch Vercel assigned when the hook was created (Preview vs Production depends on that setting, not the button label). Cursor also creates Preview deployments on apop/… automatically (“by cursoragent”). If Deploy rebuilt production but your changes were only on the agent branch, merge the PR into main or point VERCEL_DEPLOY_HOOK_URL at a Preview-branch hook in Vercel.";

export const CURSOR_BRANCH_PREVIEW_HINT =
  "Cursor opens a branch like apop/…; Vercel previews that branch automatically. Hook deploys do not merge the PR — merge to main when you want production to include the agent’s changes.";
