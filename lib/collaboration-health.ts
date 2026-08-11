const port = Number(process.env.COLLABORATION_PORT || 1234);

export async function checkCollaborationService() {
  const response = await fetch(`http://collab:${port}/`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error("Collaboration service health check failed");
}
