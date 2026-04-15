import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

/**
 * Converts known Prisma errors to appropriate HTTP responses.
 * Returns null if the error is not a recognized Prisma error (caller should
 * re-throw or handle it as a 500).
 */
export function handlePrismaError(err: unknown): NextResponse | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return NextResponse.json(
          { error: "A record with that value already exists" },
          { status: 409 }
        );
      case "P2025":
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      case "P2003":
        return NextResponse.json(
          { error: "Foreign key constraint violation" },
          { status: 400 }
        );
      default:
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
  return null;
}
