// Attack test #15: subscribe to a room you're not in, or to another user's
// channel, using only the public key and your own session, and receive its
// events. Runs against the local stack over a real Realtime WebSocket.
//
//   SUPABASE_SECRET_KEY=$(npx supabase status -o json | jq -r .SECRET_KEY) npm test
//
// The secret key is only used to set up fixtures (a room and a membership),
// never by the "attacker" clients.
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const URL = "http://127.0.0.1:54321";
const PUBLISHABLE_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"; // local stack default, public
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
// Cloudflare's test token, accepted by the local always-pass Turnstile secret.
const TEST_CAPTCHA = "XXXX.DUMMY.TOKEN.XXXX";

async function guest() {
  const client = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { captchaToken: TEST_CAPTCHA } });
  if (error || !data.user) throw error ?? new Error("no user");
  await client.realtime.setAuth();
  return { client, id: data.user.id };
}

// Resolves with the join outcome: "SUBSCRIBED", or the error status.
function join(client: SupabaseClient, topic: string, onEvent: (event: string) => void) {
  return new Promise<{ status: string; channel: RealtimeChannel }>((resolve) => {
    const channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "*" }, (msg) => onEvent(msg.event))
      .subscribe((status, err) => {
        if (process.env.RT_DEBUG) console.log(topic, status, err?.message ?? "");
        if (status !== "CLOSED") resolve({ status, channel });
      });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sign-ins plus WebSocket joins take longer than the 5s default.
describe.skipIf(!SECRET_KEY)("realtime channel authorization (attack #15)", { timeout: 20_000 }, () => {
  const admin = createClient(URL, SECRET_KEY ?? "", { auth: { persistSession: false } });
  let member: Awaited<ReturnType<typeof guest>>;
  let outsider: Awaited<ReturnType<typeof guest>>;
  let roomId: string;

  beforeAll(async () => {
    [member, outsider] = await Promise.all([guest(), guest()]);
    const { data: room, error } = await admin
      .from("rooms")
      .insert({ type: "public", name: `rt-${Date.now().toString(36)}` })
      .select("id")
      .single();
    if (error) throw error;
    roomId = room.id;
    await admin.from("room_members").insert({ room_id: roomId, user_id: member.id });
  });

  // Joining a topic a client is already on returns the existing channel, so
  // each test starts from no subscriptions.
  afterEach(async () => {
    await member?.client.removeAllChannels();
    await outsider?.client.removeAllChannels();
  });

  afterAll(async () => {
    if (roomId) await admin.from("rooms").delete().eq("id", roomId);
    for (const u of [member, outsider]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it("a member joins the room channel and receives new messages; an outsider is refused and receives nothing", async () => {
    const memberEvents: string[] = [];
    const outsiderEvents: string[] = [];

    const memberJoin = await join(member.client, `room:${roomId}`, (e) => memberEvents.push(e));
    const outsiderJoin = await join(outsider.client, `room:${roomId}`, (e) => outsiderEvents.push(e));
    expect(memberJoin.status).toBe("SUBSCRIBED");
    expect(outsiderJoin.status).toBe("CHANNEL_ERROR");

    const { error } = await member.client.from("messages").insert({ room_id: roomId, body: "members only" });
    expect(error).toBeNull();
    await wait(1500);

    expect(memberEvents).toContain("message.insert");
    expect(outsiderEvents).toHaveLength(0);
  });

  it("nobody can join another user's private channel", async () => {
    const own = await join(outsider.client, `user:${outsider.id}`, () => {});
    const someoneElse = await join(outsider.client, `user:${member.id}`, () => {});
    expect(own.status).toBe("SUBSCRIBED");
    expect(someoneElse.status).toBe("CHANNEL_ERROR");
  });

  it("a signed-out client cannot join any room channel", async () => {
    const anon = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const result = await join(anon, `room:${roomId}`, () => {});
    expect(result.status).toBe("CHANNEL_ERROR");
    await anon.removeAllChannels();
  });

  it("clients cannot broadcast fake events into a room they belong to", async () => {
    const memberEvents: string[] = [];
    const listener = await guest();
    await admin.from("room_members").insert({ room_id: roomId, user_id: listener.id });
    const listening = await join(listener.client, `room:${roomId}`, (e) => memberEvents.push(e));
    expect(listening.status).toBe("SUBSCRIBED"); // so "no event" below means "blocked", not "not listening"

    const { status, channel } = await join(member.client, `room:${roomId}`, () => {});
    expect(status).toBe("SUBSCRIBED");
    await channel.send({ type: "broadcast", event: "message.insert", payload: { body: "forged" } });
    await wait(1500);

    expect(memberEvents).not.toContain("message.insert");
    await listener.client.removeAllChannels();
    await admin.auth.admin.deleteUser(listener.id);
  });
});
