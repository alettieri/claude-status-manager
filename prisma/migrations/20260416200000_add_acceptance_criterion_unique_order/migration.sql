-- DropIndex
DROP INDEX "AcceptanceCriterion_taskId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceCriterion_taskId_order_key" ON "AcceptanceCriterion"("taskId", "order");
