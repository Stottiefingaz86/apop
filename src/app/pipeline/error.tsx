"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PipelineError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = error.message ?? "";
  const dbIssue = /database|prisma|5432|postgres/i.test(msg);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-[22px] font-semibold tracking-tight">Pipeline couldn’t load</CardTitle>
          <CardDescription className="text-[13px]">
            {dbIssue
              ? "The app is running, but Postgres isn’t reachable."
              : "Something went wrong loading this page."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          {dbIssue ? (
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Start Postgres (Docker Desktop, then from the project folder:{" "}
                <code className="rounded bg-muted px-1">npm run db:up</code>
                ).
              </li>
              <li>
                Apply the schema:{" "}
                <code className="rounded bg-muted px-1">npx prisma db push</code>
              </li>
              <li>
                Ensure <code className="rounded bg-muted px-1">.env</code> has{" "}
                <code className="rounded bg-muted px-1">DATABASE_URL</code> pointing at that server.
              </li>
            </ol>
          ) : (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{msg}</pre>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={reset}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
