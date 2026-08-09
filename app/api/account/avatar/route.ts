import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { attachmentBucket, DeleteObjectCommand, GetObjectCommand, objectStorage, PutObjectCommand } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function currentUser() { const session = await auth(); return session?.user?.id || null; }

export async function GET() {
  const userId = await currentUser(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
  if (!user?.avatarKey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const object = await objectStorage.send(new GetObjectCommand({ Bucket: attachmentBucket, Key: user.avatarKey }));
    if (!object.Body) return NextResponse.json({ error: "Avatar data unavailable" }, { status: 404 });
    return new NextResponse(object.Body.transformToWebStream(), { headers: { "Content-Type": object.ContentType || "image/jpeg", "Cache-Control": "private, max-age=300" } });
  } catch { return NextResponse.json({ error: "Avatar data unavailable" }, { status: 404 }); }
}

export async function POST(request: Request) {
  const userId = await currentUser(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "請選擇頭像圖片" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "頭像僅支援 JPG、PNG、WebP 或 GIF" }, { status: 415 });
  if (file.size > maxAvatarBytes) return NextResponse.json({ error: "頭像大小不可超過 5 MB" }, { status: 413 });
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
  const extension = file.type.split("/")[1] || "img"; const key = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
  try {
    await objectStorage.send(new PutObjectCommand({ Bucket: attachmentBucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
    await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    if (previous?.avatarKey) void objectStorage.send(new DeleteObjectCommand({ Bucket: attachmentBucket, Key: previous.avatarKey })).catch(() => undefined);
    return NextResponse.json({ avatarUrl: `/api/account/avatar?v=${encodeURIComponent(key.slice(-12))}` }, { status: 201 });
  } catch { try { await objectStorage.send(new DeleteObjectCommand({ Bucket: attachmentBucket, Key: key })); } catch { /* cleanup is best effort */ } return NextResponse.json({ error: "頭像上傳失敗" }, { status: 502 }); }
}

export async function DELETE() {
  const userId = await currentUser(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
  if (previous?.avatarKey) void objectStorage.send(new DeleteObjectCommand({ Bucket: attachmentBucket, Key: previous.avatarKey })).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
