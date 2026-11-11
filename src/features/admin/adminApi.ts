export type Access = "admin" | "moderator" | "report";
export type StorageStatus = {
  connected: boolean;
  initialized: boolean;
  schema_version?: number;
  needs_upgrade?: boolean;
};
export async function adminApi<T>(
  action: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/admin?action=${action}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Try again shortly.",
    );
  }
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result as T;
}
