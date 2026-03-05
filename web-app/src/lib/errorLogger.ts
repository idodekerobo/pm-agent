/**
 * logError — sends a client-side error to the backend errors table.
 *
 * Usage:
 *   import { logError } from "@/lib/errorLogger";
 *   await logError(getToken, "Failed to load sessions", { route: "/chat" });
 *
 * Rules:
 * - Never throws — a reporting failure must never crash the caller.
 * - Fire-and-forget is fine; you don't need to await it if you don't care about the result.
 */
export async function logError(
  getToken: () => string,
  message: string,
  context?: Record<string, unknown>,
  errorType?: string,
): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;

    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        error_type: errorType,
        context,
      }),
    });
  } catch {
    console.error("[errorLogger] failed to report error to server");
  }
}
