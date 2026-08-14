import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membershipFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  userCreate: vi.fn(),
  membershipCreate: vi.fn(),
  auditEventCreate: vi.fn(),
  hash: vi.fn(),
  readWorkspaceSettings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: mocks.membershipFindFirst },
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/workspace-settings", () => ({
  readWorkspaceSettings: mocks.readWorkspaceSettings,
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { POST } from "@/app/api/workspaces/[id]/accounts/route";

const context = { params: Promise.resolve({ id: "workspace-a" }) };

function securitySettings(
  overrides: Partial<{
    accountProvisioningEnabled: boolean;
    forcePasswordChangeOnNewAccount: boolean;
    minimumPasswordLength: number;
  }> = {},
) {
  return {
    security: {
      accountProvisioningEnabled: true,
      forcePasswordChangeOnNewAccount: false,
      minimumPasswordLength: 12,
      ...overrides,
    },
  };
}

function accountRequest(
  body: Record<string, unknown> = {
    name: "New teammate",
    email: "new.teammate@example.com",
    password: "a sufficiently long password",
    role: "VIEWER",
  },
) {
  return new Request("http://localhost/api/workspaces/workspace-a/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("workspace account provisioning API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "requester-a" } });
    mocks.membershipFindFirst.mockResolvedValue({ role: "ADMIN" });
    mocks.readWorkspaceSettings.mockResolvedValue(securitySettings());
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.userCreate.mockResolvedValue({ id: "user-new" });
    mocks.membershipCreate.mockResolvedValue({
      id: "membership-new",
      role: "EDITOR",
      workspaceId: "workspace-a",
      userId: "user-new",
      user: {
        id: "user-new",
        name: "Ada Lovelace",
        email: "new.user@example.com",
      },
    });
    mocks.auditEventCreate.mockResolvedValue({ id: "audit-new" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: { create: mocks.userCreate },
        membership: { create: mocks.membershipCreate },
        auditEvent: { create: mocks.auditEventCreate },
      }),
    );
  });

  it("rejects unauthenticated requests before any workspace lookup", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(accountRequest(), context);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.membershipFindFirst).not.toHaveBeenCalled();
    expect(mocks.readWorkspaceSettings).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires the requester to be an owner or administrator of this workspace", async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);

    const response = await POST(accountRequest(), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Owner or admin role required" });
    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "requester-a",
        workspaceId: "workspace-a",
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    expect(mocks.readWorkspaceSettings).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("honors a workspace policy that disables browser account provisioning", async () => {
    mocks.readWorkspaceSettings.mockResolvedValue(
      securitySettings({ accountProvisioningEnabled: false }),
    );

    const response = await POST(accountRequest(), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "管理者已停用網頁建立帳號" });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("enforces the workspace minimum initial-password length", async () => {
    mocks.readWorkspaceSettings.mockResolvedValue(
      securitySettings({ minimumPasswordLength: 20 }),
    );

    const response = await POST(
      accountRequest({
        name: "New teammate",
        email: "new.teammate@example.com",
        password: "only twelve",
        role: "VIEWER",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "初始密碼至少需要 20 個字元",
    });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns a validation response for malformed JSON without provisioning an account", async () => {
    const response = await POST(
      new Request("http://localhost/api/workspaces/workspace-a/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "帳號資料不完整；初始密碼至少需要 12 個字元",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not allow an administrator to create another owner", async () => {
    const response = await POST(
      accountRequest({
        name: "New owner",
        email: "new.owner@example.com",
        password: "a sufficiently long password",
        role: "OWNER",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "只有擁有者可以建立其他擁有者帳號",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not create a duplicate account when the normalized email already exists", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing-user" });

    const response = await POST(
      accountRequest({
        name: "Existing user",
        email: "EXISTING.USER@EXAMPLE.COM",
        password: "a sufficiently long password",
        role: "VIEWER",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "這個電子郵件已經有帳號，請使用『加入既有帳號』",
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "existing.user@example.com" },
    });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("maps a duplicate-email race during provisioning to a conflict response", async () => {
    mocks.userCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const response = await POST(accountRequest(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "這個電子郵件已經有帳號，請使用『加入既有帳號』",
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "new.teammate@example.com" },
    });
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it("provisions a normalized account, membership, and audit trail atomically", async () => {
    mocks.membershipFindFirst.mockResolvedValue({ role: "OWNER" });
    mocks.readWorkspaceSettings.mockResolvedValue(
      securitySettings({ forcePasswordChangeOnNewAccount: true }),
    );

    const response = await POST(
      accountRequest({
        name: "  Ada Lovelace  ",
        email: "NEW.USER@EXAMPLE.COM",
        password: "a sufficiently long password",
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
      role: "EDITOR",
      workspaceId: "workspace-a",
      userId: "user-new",
      user: {
        id: "user-new",
        name: "Ada Lovelace",
        email: "new.user@example.com",
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.hash).toHaveBeenCalledWith("a sufficiently long password", 12);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        name: "Ada Lovelace",
        email: "new.user@example.com",
        passwordHash: "hashed-password",
        mustChangePassword: true,
      },
    });
    expect(mocks.membershipCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-new",
        workspaceId: "workspace-a",
        role: "EDITOR",
        nickname: "Ada",
        teamGroup: "Platform",
        jobTitle: "Engineer",
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    expect(mocks.auditEventCreate).toHaveBeenCalledWith({
      data: {
        userId: "requester-a",
        action: "workspace.account_created",
        entity: "membership",
        entityId: "membership-new",
        workspaceId: "workspace-a",
        metadata: { role: "EDITOR" },
      },
    });
  });
});
