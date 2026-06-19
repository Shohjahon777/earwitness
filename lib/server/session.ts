import "server-only";
import { cookies } from "next/headers";
import { customAlphabet } from "nanoid";
import { prisma } from "./db";

const COOKIE = "ew_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const newSessionId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 21);
const newHandleSuffix = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 3);

export type SessionRow = NonNullable<Awaited<ReturnType<typeof prisma.session.findUnique>>>;

// Resolves the anonymous session from the cookie, creating one (and setting the cookie)
// on first contact. No login wall — identity is just a cookie.
export async function getOrCreateSession(): Promise<SessionRow> {
  const jar = await cookies();
  const existingId = jar.get(COOKIE)?.value;

  if (existingId) {
    const found = await prisma.session.findUnique({ where: { id: existingId } });
    if (found) return found;
  }

  // Create with a unique handle; retry on the rare collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = existingId ?? newSessionId();
    try {
      const created = await prisma.session.create({
        data: { id, handle: `Listener-${newHandleSuffix()}` },
      });
      jar.set(COOKIE, created.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });
      return created;
    } catch {
      // handle/id collision — try again with fresh values
    }
  }
  throw new Error("Could not create a session.");
}
