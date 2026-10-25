// Room names look like channel names: lowercase words joined by hyphens.
export function normalizeRoomName(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
