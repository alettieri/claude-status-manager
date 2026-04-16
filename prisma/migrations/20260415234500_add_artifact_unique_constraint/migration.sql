-- CreateIndex
CREATE UNIQUE INDEX "Artifact_worktreeId_filePath_key" ON "Artifact"("worktreeId", "filePath");
