import "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      image?: string | null;
      role: Role;
      username: string;
      twoFactorEnabled?: boolean;
    };
  }

  interface User {
    id: string;
    name: string;
    role: Role;
    username: string;
    twoFactorEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    twoFactorEnabled?: boolean;
  }
}
