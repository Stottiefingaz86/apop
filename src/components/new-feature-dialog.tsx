"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NewFeatureForm } from "@/components/new-feature-form";

export function NewFeatureDialog({
  trigger,
  triggerLabel = "New feature",
  triggerClassName,
}: {
  trigger?: React.ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="gradientCta" size="sm" className={triggerClassName}>
            <Plus className="size-4" aria-hidden />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,840px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">New feature</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Lands in Inbox. Optional screenshots help value analysis; PDFs are stored for context (text
            extraction is not automated yet).
          </DialogDescription>
        </DialogHeader>
        <NewFeatureForm onCreated={() => setOpen(false)} submitLabel="Create & close" />
      </DialogContent>
    </Dialog>
  );
}
