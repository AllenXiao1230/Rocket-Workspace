import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  attachmentBucket,
  DeleteObjectCommand,
  GetObjectCommand,
  objectStorage,
  PutObjectCommand,
} from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";
import { inspectUploadedFile } from "@/lib/file-signature";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function currentUser() {
  const session = await auth();
  return session?.user?.id || null;
}

export async function GET(request: Request) {
  const requesterId = await currentUser();
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = new URL(request.url).searchParams.get("userId") || requesterId;
  if (userId !== requesterId) {
    const sharedWorkspace = await prisma.membership.findFirst({
      where: { userId: requesterId, workspace: { memberships: { some: { userId } } } },
      select: { id: true },
    });
    if (!sharedWorkspace)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  if (!user?.avatarKey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const object = await objectStorage.send(
      new GetObjectCommand({ Bucket: attachmentBucket, Key: user.avatarKey }),
    );
    if (!object.Body)
      return NextResponse.json({ error: "Avatar data unavailable" }, { status: 404 });
    return new NextResponse(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": object.ContentType || "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar data unavailable" }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !file.size)
    return NextResponse.json({ error: "請選擇頭像圖片" }, { status: 400 });
  if (file.size > maxAvatarBytes)
    return NextResponse.json({ error: "頭像大小不可超過 5 MB" }, { status: 413 });
  const payload = Buffer.from(await file.arrayBuffer());
  let upload;
  try {
    upload = inspectUploadedFile(payload, file.type);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法驗證頭像內容" },
      { status: 415 },
    );
  }
  if (!allowedTypes.has(upload.mimeType))
    return NextResponse.json(
      { error: "頭像僅支援 JPG、PNG、WebP 或 GIF" },
      { status: 415 },
    );
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  const extension = upload.mimeType.split("/")[1] || "img";
  const key = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
  try {
    await objectStorage.send(
      new PutObjectCommand({
        Bucket: attachmentBucket,
        Key: key,
        Body: payload,
        ContentType: upload.mimeType,
      }),
    );
    await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    await prisma.auditEvent.create({
      data: {
        userId,
        action: "account.avatar_updated",
        entity: "user",
        entityId: userId,
        metadata: { mimeType: upload.mimeType, size: file.size },
      },
    });
    if (previous?.avatarKey)
      void objectStorage
        .send(
          new DeleteObjectCommand({ Bucket: attachmentBucket, Key: previous.avatarKey }),
        )
        .catch(() => undefined);
    return NextResponse.json(
      { avatarUrl: `/api/account/avatar?v=${encodeURIComponent(key.slice(-12))}` },
      { status: 201 },
    );
  } catch {
    try {
      await objectStorage.send(
        new DeleteObjectCommand({ Bucket: attachmentBucket, Key: key }),
      );
    } catch {
      /* cleanup is best effort */
    }
    return NextResponse.json({ error: "頭像上傳失敗" }, { status: 502 });
  }
}

export async function DELETE() {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
  await prisma.auditEvent.create({
    data: { userId, action: "account.avatar_removed", entity: "user", entityId: userId },
  });
  if (previous?.avatarKey)
    void objectStorage
      .send(
        new DeleteObjectCommand({ Bucket: attachmentBucket, Key: previous.avatarKey }),
      )
      .catch(() => undefined);
  return NextResponse.json({ ok: true });
}
