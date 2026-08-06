import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearFailedLogins, failedLogin, loginAllowed } from "@/lib/login-rate-limit";
import { readSecuritySettings } from "@/lib/runtime-settings";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [Credentials({
    name: "Email and password",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    authorize: async (raw) => {
      const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
      if (!parsed.success) return null;
      const security = await readSecuritySettings(); const email = parsed.data.email.toLowerCase();
      if (security.loginRateLimitEnabled && !await loginAllowed(email, security.loginMaxAttempts)) return null;
      const user = await prisma.user.findUnique({ where: { email } });
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
