import { NextResponse } from "next/server";

// Route handlers throwing an uncaught error (e.g. a missing env var) get a
// bare empty 500 from Next.js, which breaks `res.json()` on the client with
// a confusing "Unexpected end of JSON input". Routes catch and call this so
// failures always come back as a readable JSON error instead.
export function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[api]", message, err);
  return NextResponse.json({ error: message }, { status: 500 });
}
