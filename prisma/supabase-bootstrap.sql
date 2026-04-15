-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FeatureStage" AS ENUM ('INBOX', 'VALUE_REVIEW', 'REJECTED', 'PRD', 'DESIGN_SPEC', 'READY_FOR_BUILD', 'IN_BUILD', 'QA', 'DONE');

-- CreateEnum
CREATE TYPE "FeatureStatus" AS ENUM ('idle', 'queued', 'running', 'awaiting_input', 'awaiting_review', 'approved', 'rejected', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentQuestionStatus" AS ENUM ('open', 'answered', 'superseded');

-- CreateEnum
CREATE TYPE "ApprovalRecordStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('pending', 'building', 'ready', 'error', 'canceled');

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "stage" "FeatureStage" NOT NULL DEFAULT 'INBOX',
    "status" "FeatureStatus" NOT NULL DEFAULT 'idle',
    "score" DOUBLE PRECISION,
    "contextPack" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'pending',
    "vercelDeploymentId" TEXT,
    "vercelUrl" TEXT,
    "inspectorUrl" TEXT,
    "readyState" TEXT,
    "errorMessage" TEXT,
    "buildLogExcerpt" TEXT,
    "fixRunTriggered" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "stage" "FeatureStage" NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "stage" "FeatureStage" NOT NULL,
    "type" TEXT NOT NULL,
    "contentJson" JSONB,
    "contentMarkdown" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentQuestion" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "stage" "FeatureStage" NOT NULL,
    "agentName" TEXT NOT NULL,
    "questionJson" JSONB NOT NULL,
    "status" "AgentQuestionStatus" NOT NULL DEFAULT 'open',
    "answers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignInputs" (
    "featureId" TEXT NOT NULL,
    "tokenJson" JSONB,
    "figmaUrl" TEXT,
    "competitorUrls" JSONB,
    "screenshots" JSONB,
    "notes" TEXT,
    "brandDescription" TEXT,
    "uxDirection" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignInputs_pkey" PRIMARY KEY ("featureId")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "stage" "FeatureStage" NOT NULL,
    "status" "ApprovalRecordStatus" NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Release_vercelDeploymentId_key" ON "Release"("vercelDeploymentId");

-- CreateIndex
CREATE INDEX "Release_featureId_createdAt_idx" ON "Release"("featureId", "createdAt");

-- CreateIndex
CREATE INDEX "Artifact_featureId_stage_idx" ON "Artifact"("featureId", "stage");

-- CreateIndex
CREATE INDEX "AgentQuestion_featureId_status_idx" ON "AgentQuestion"("featureId", "status");

-- CreateIndex
CREATE INDEX "Approval_featureId_stage_idx" ON "Approval"("featureId", "stage");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentQuestion" ADD CONSTRAINT "AgentQuestion_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignInputs" ADD CONSTRAINT "DesignInputs_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
