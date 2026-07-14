import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { verifyTOTP } from "./totp";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "your-username" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user) {
          return null;
        }

        // Block inactive users
        if (!user.isActive) {
          return null;
        }

        // Block unapproved users
        if (!user.isApproved) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        // Check 2FA if enabled
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          const totpCode = credentials.totp;
          if (!totpCode) {
            // 2FA code not provided — return null (client should check via /api/auth/check-2fa first)
            return null;
          }
          const isValidTOTP = verifyTOTP(totpCode, user.twoFactorSecret);
          if (!isValidTOTP) {
            return null;
          }
        }

        return {
          id: user.id,
          name: user.displayName || user.username,
          username: user.username,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          email: null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  events: {
    async signIn({ user }) {
      // Update lastLoginAt on successful sign-in
      if (user?.id) {
        try {
          await db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          // Silently fail — don't block login
        }
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.twoFactorEnabled = (user as { twoFactorEnabled?: boolean }).twoFactorEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.username as string;
        session.user.username = token.username as string;
        session.user.role = token.role as "ADMIN" | "HERO" | "SUPPORT";
        (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled =
          token.twoFactorEnabled as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
