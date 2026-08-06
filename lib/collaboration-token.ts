import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const tokenTtl = process.env.COLLABORATION_TOKEN_TTL || "10m";
export async function createCollaborationToken(userId: string, documentId: string) {
  return new SignJWT({ documentId }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(tokenTtl).sign(secret);
}
