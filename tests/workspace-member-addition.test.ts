import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  membershipUpsert: vi.fn(),
  membershipCount: vi.fn(),
  userFindUnique: vi.fn(),
  auditEventCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { POST } from "@/app/api/workspaces/[id]/members/route";

const context = { params: Promise.resolve({ id: "workspace-a" }) };

function memberRequest(
  body: Record<string, unknown> = {
    email: "existing.user@example.com",
    role: "EDITOR",
  },
) {
  return new Request("http://localhost/api/workspaces/workspace-a/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("workspace member addition API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "requester-a" } });
    mocks.membershipFindFirst.mockResolvedValue({
      id: "requester-membership",
      role: "ADMIN",
    });
    mocks.userFindUnique.mockResolvedValue({ id: "user-existing" });
    mocks.membershipFindUnique.mockResolvedValue(null);
    mocks.membershipCount.mockResolvedValue(2);
    mocks.membershipUpsert.mockResolvedValue({
      id: "membership-new",
      userId: "user-existing",
      workspaceId: "workspace-a",
      role: "EDITOR",
      nickname: "Ada",
      teamGroup: "Platform",
      jobTitle: "Engineer",
      user: {
        id: "user-existing",
        email: "existing.user@example.com",
        name: "Ada Lovelace",
        avatarEmoji: "👩‍💻",
        avatarKey: "version-123",
      },
    });
    mocks.auditEventCreate.mockResolvedValue({ id: "audit-new" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        membership: {
          findFirst: mocks.membershipFindFirst,
          findUnique: mocks.membershipFindUnique,
          upsert: mocks.membershipUpsert,
          count: mocks.membershipCount,
        },
        user: { findUnique: mocks.userFindUnique },
        auditEvent: { create: mocks.auditEventCreate },
      }),
    );
  });

  it("adds an existing login account atomically and records the member-added audit event", async () => {
    const response = await POST(
      memberRequest({
        email: "EXISTING.USER@EXAMPLE.COM",
        nickname: "  Ada  ",
        teamGroup: "  Platform  ",
        jobTitle: "  Engineer  ",
        role: "EDITOR",
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "membership-new",
      userId: "user-existing",
      workspaceId: "workspace-a",
      role: "EDITOR",
      nickname: "Ada",
      teamGroup: "Platform",
      jobTitle: "Engineer",
      user: {
        id: "user-existing",
        email: "existing.user@example.com",
        name: "Ada Lovelace",
        avatarEmoji: "👩‍💻",
        avatarUrl: "/api/account/avatar?userId=user-existing&v=version-123",
      },
    });
    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "requester-a",
        workspaceId: "workspace-a",
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "existing.user@example.com" },
    });
    expect(mocks.membershipUpsert).toHaveBeenCalledWith({
      where: {
        userId_workspaceId: { userId: "user-existing", workspaceId: "workspace-a" },
      },
      update: {
        role: "EDITOR",
        nickname: "Ada",
        teamGroup: "Platform",
        jobTitle: "Engineer",
      },
      create: {
        userId: "user-existing",
        workspaceId: "workspace-a",
        role: "EDITOR",
        nickname: "Ada",
        teamGroup: "Platform",
        jobTitle: "Engineer",
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarEmoji: true,
            avatarKey: true,
          },
        },
      },
    });
    expect(mocks.auditEventCreate).toHaveBeenCalledWith({
      data: {
        userId: "requester-a",
        action: "workspace.member_added",
        entity: "membership",
        entityId: "membership-new",
        workspaceId: "workspace-a",
        metadata: { role: "EDITOR" },
      },
    });
  });

  it("returns the actionable not-found response when the login account does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST(memberRequest(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "找不到這個登入帳號；請先建立帳號。",
    });
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it("does not disclose or add accounts when the requester is not a workspace administrator", async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);

    const response = await POST(memberRequest(), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "只有擁有者能建立、變更或移除擁有者角色，且工作空間至少要保留一位擁有者",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before opening a transaction", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(memberRequest(), context);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
