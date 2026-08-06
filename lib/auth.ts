import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearFailedLogins, failedLogin, loginAllowed } from "@/lib/login-rate-limit";
import { readSecuritySettings } from "@/lib/runtime-settings";
import { readEffectiveSecuritySettings } from "@/lib/workspace-settings";

const nextAuth = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [Credentials({
    name: "Email and password",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    authorize: async (raw) => {
      const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      const security = user ? await readEffectiveSecuritySettings(user.id) : await readSecuritySettings();
      if (security.loginRateLimitEnabled && !await loginAllowed(email, security.loginMaxAttempts)) return null;
      if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) { if (security.loginRateLimitEnabled) await failedLogin(email, security.loginWindowMinutes); return null; }
      if (security.loginRateLimitEnabled) await clearFailedLogins(email);
      return { id: user.id, email: user.email, name: user.name };
    },
  })],
  callbacks: {
    jwt: ({ token, user }) => { if (user?.id) token.id = user.id; return token; },
    session: ({ session, token }) => { if (session.user && token.id) session.user.id = token.id as string; return session; },
  },
});

export const { handlers, signIn, signOut } = nextAuth;
/**
 * Normal application gate. A temporary password can only be used for the
 * password-change page and endpoint, both of which deliberately use rawAuth.
 */
export const rawAuth = nextAuth.auth as () => Promise<Session | null>;

export async function auth(): Promise<Session | null> {
  const session = await rawAuth();
  if (!session?.user?.id) return session;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mustChangePassword: true } });
  return user?.mustChangePassword ? null : session;
}
