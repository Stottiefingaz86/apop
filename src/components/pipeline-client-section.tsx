"use client";

import type { FeatureStage } from "@prisma/client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PipelineActivityPoller } from "@/components/pipeline-activity-poller";
import { PipelineKanbanBoard } from "@/components/pipeline-kanban-board";
import type { PipelineKanbanCard } from "@/lib/domain/pipeline-kanban";

export function PipelineClientSection({
  children,
  boardKey,
  initialAgentRunning,
  initialHasPipelineActivity,
  initialHumanNeedsAttention,
  initialColumns,
  cursorBuildConfigured,
  pollBoard,
  filterQ,
  filterStage,
}: {
  children: ReactNode;
  boardKey: string;
  initialAgentRunning: boolean;
  initialHasPipelineActivity: boolean;
  initialHumanNeedsAttention: boolean;
  initialColumns: Record<FeatureStage, PipelineKanbanCard[]>;
  cursorBuildConfigured: boolean;
  pollBoard: boolean;
  filterQ: string;
  filterStage: string;
}) {
  const [meta, setMeta] = useState(() => ({
    agentRunning: initialAgentRunning,
    hasPipelineActivity: initialHasPipelineActivity,
    humanNeedsAttention: initialHumanNeedsAttention,
  }));

  useEffect(() => {
    setMeta({
      agentRunning: initialAgentRunning,
      hasPipelineActivity: initialHasPipelineActivity,
      humanNeedsAttention: initialHumanNeedsAttention,
    });
  }, [boardKey, initialAgentRunning, initialHasPipelineActivity, initialHumanNeedsAttention]);

  return (
    <>
      <PipelineActivityPoller
        active={meta.humanNeedsAttention || meta.agentRunning}
        agentRunning={meta.agentRunning}
      />
      {children}
      <div
        className="-mx-2 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
        style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
      >
        <PipelineKanbanBoard
          boardKey={boardKey}
          initialColumns={initialColumns}
          databaseAvailable
          cursorBuildConfigured={cursorBuildConfigured}
          pollBoard={pollBoard}
          filterQ={filterQ}
          filterStage={filterStage}
          onBoardMetaChange={setMeta}
        />
      </div>
    </>
  );
}
