import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  })],
  callbacks: {
    jwt: ({ token, user }) => { if (user?.id) token.id = user.id; return token; },
    session: ({ session, token }) => { if (session.user && token.id) session.user.id = token.id as string; return session; },
  },
});
