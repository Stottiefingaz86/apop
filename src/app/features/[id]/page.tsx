import { notFound } from "next/navigation";
import { getFeatureById } from "@/lib/data/features";
import { FeatureWorkspace, type FeatureWorkspaceModel } from "@/components/feature-workspace";

export default async function FeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFeatureById(id);
  if (!data) notFound();

  const initial = JSON.parse(JSON.stringify(data)) as FeatureWorkspaceModel;

  return <FeatureWorkspace key={data.updatedAt.toISOString()} initial={initial} />;
}
