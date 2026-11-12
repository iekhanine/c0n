export async function botCommand<T>(
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  async function request(action: string, body?: unknown) {
    const r = await fetch(`/api/discord-bot?action=${action}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "Discord request failed.");
    return value;
  }
  const { id } = await request("control_command", {
    operation,
    payload,
    request_id: crypto.randomUUID(),
  });
  for (let i = 0; i < 60; i++) {
    const item = await request(`control_result&id=${encodeURIComponent(id)}`);
    if (item.state === "succeeded") return item.result as T;
    if (["failed", "uncertain", "expired"].includes(item.state))
      throw Error(
        item.error || "Check Discord action history before retrying.",
      );
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw Error(
    "Bot confirmation is pending. Check Discord action history before retrying.",
  );
}
