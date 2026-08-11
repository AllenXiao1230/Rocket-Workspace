import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditEventCreate: vi.fn(),
  auth: vi.fn(),
  fetchExternalUrl: vi.fn(),
  projectAccess: vi.fn(),
  readWorkspaceSettings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/external-url", () => ({ fetchExternalUrl: mocks.fetchExternalUrl }));
vi.mock("@/lib/permissions", () => ({ projectAccess: mocks.projectAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: { auditEvent: { create: mocks.auditEventCreate } },
}));
vi.mock("@/lib/workspace-settings", () => ({
  readWorkspaceSettings: mocks.readWorkspaceSettings,
}));

import { POST as aiChat } from "@/app/api/projects/[id]/ai/chat/route";
import { POST as webhookTest } from "@/app/api/projects/[id]/integrations/webhook/test/route";

const params = { params: Promise.resolve({ id: "project-a" }) };

describe("external integration audit events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
    mocks.projectAccess.mockResolvedValue({
      project: { workspaceId: "workspace-a" },
      membership: { role: "ADMIN" },
    });
    mocks.auditEventCreate.mockResolvedValue({ id: "audit-a" });
  });

  it("records AI chat metadata without storing the prompt or response", async () => {
    mocks.readWorkspaceSettings.mockResolvedValue({
      ai: {
        enabled: true,
        provider: "OPENAI_COMPATIBLE",
        baseUrl: "https://ai.example",
        model: "model-a",
        apiKey: "secret",
      },
    });
    mocks.fetchExternalUrl.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "回答內容" } }] }), {
        status: 200,
      }),
    );

    const response = await aiChat(
      new Request("http://localhost/api/projects/project-a/ai/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "絕密提示", context: "絕密文件" }),
      }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.auditEventCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-a",
        action: "ai.chat_requested",
        entity: "ai",
        entityId: "project-a",
        workspaceId: "workspace-a",
        projectId: "project-a",
        metadata: { provider: "OPENAI_COMPATIBLE", model: "model-a", hasContext: true },
      },
    });
    expect(JSON.stringify(mocks.auditEventCreate.mock.calls)).not.toContain("絕密");
  });

  it("records only the Webhook delivery result", async () => {
    mocks.readWorkspaceSettings.mockResolvedValue({
      integrations: {
        webhookEnabled: true,
        webhookUrl: "https://hooks.example/test",
        webhookSecret: "secret",
      },
    });
    mocks.fetchExternalUrl.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await webhookTest(
      new Request("http://localhost/api/projects/project-a/integrations/webhook/test", {
        method: "POST",
      }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.auditEventCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-a",
        action: "webhook.tested",
        entity: "webhook",
        entityId: "project-a",
        workspaceId: "workspace-a",
        projectId: "project-a",
        metadata: { status: 204, ok: true },
      },
    });
    expect(JSON.stringify(mocks.auditEventCreate.mock.calls)).not.toContain(
      "hooks.example",
    );
    expect(JSON.stringify(mocks.auditEventCreate.mock.calls)).not.toContain("secret");
  });
});
