import { describe, expect, it } from "vitest";
import { sendChatInputSchema } from "./chat";

const parse = (body: unknown) => sendChatInputSchema.safeParse({ roomCode: "ABCDEF", body });

describe("sendChatInputSchema", () => {
  it("trims and collapses whitespace", () => {
    const out = parse("  hola   a\ttodos \n ");
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.body).toBe("hola a todos");
  });
  it("turns control characters into spaces", () => {
    const out = parse("a\u0007b");
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.body).toBe("a b");
  });
  it("accepts exactly 200 characters and rejects 201", () => {
    expect(parse("x".repeat(200)).success).toBe(true);
    expect(parse("x".repeat(201)).success).toBe(false);
  });
  it.each(["", "   ", "\n\n", 5, null])("rejects %j", (body) => {
    expect(parse(body).success).toBe(false);
  });
  it("rejects a bad room code", () => {
    expect(sendChatInputSchema.safeParse({ roomCode: "x", body: "hola" }).success).toBe(false);
  });
});
