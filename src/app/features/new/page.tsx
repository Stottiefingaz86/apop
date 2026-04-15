"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewFeatureForm } from "@/components/new-feature-form";

export default function NewFeaturePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-lg">
      <Card className="border-border/80 shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-[26px] font-semibold tracking-tight md:text-[28px]">New feature</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            Creates a feature in Inbox. Optional screenshots and a PRD PDF are stored on the feature for
            agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewFeatureForm onCreated={() => router.push("/pipeline")} />
        </CardContent>
      </Card>
    </div>
  );
}
