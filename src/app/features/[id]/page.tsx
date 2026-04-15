import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureWorkspace, type FeatureWorkspaceModel } from "@/components/feature-workspace";
import { getCursorBuildRepository } from "@/lib/cursor/env";
import { getFeatureByIdSafe } from "@/lib/data/features";
import { getApopDeliveryTarget } from "@/lib/domain/delivery-target";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, databaseAvailable } = await getFeatureByIdSafe(id);

  if (!databaseAvailable) {
    return (
      <div className="mx-auto max-w-lg py-4">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-[22px] font-semibold tracking-tight">Database not connected</CardTitle>
            <CardDescription className="text-[13px]">
              The feature workspace needs Postgres. Start the database and run{" "}
              <code className="rounded bg-muted px-1 text-xs">npx prisma db push</code>, then reload
              this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/pipeline">Back to pipeline</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) notFound();

  const initial = JSON.parse(JSON.stringify(data)) as FeatureWorkspaceModel;
  if (!initial.cursorAgentJobs) initial.cursorAgentJobs = [];
  initial.deliveryRepositoryWebUrl =
    getCursorBuildRepository()?.trim() || getApopDeliveryTarget().repositoryWebUrl;

  return (
    <FeatureWorkspace
      key={id}
      initial={initial}
    />
  );
}
