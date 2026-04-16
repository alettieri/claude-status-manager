-- CreateTable
CREATE TABLE "AcceptanceCriterion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcceptanceCriterion_taskId_idx" ON "AcceptanceCriterion"("taskId");

-- AddForeignKey
ALTER TABLE "AcceptanceCriterion" ADD CONSTRAINT "AcceptanceCriterion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
