import { describe, expect, it } from "vitest";
import { joinRoomInputSchema, nicknameSchema } from "./players";

describe("nicknameSchema", () => {
  it.each([
    ["Ana", "Ana"],
    ["  Ana  ", "Ana"],
    ["Ana    Luz", "Ana Luz"],
    ["José", "José"],
    ["Ñandú_9", "Ñandú_9"],
    ["Ash.K", "Ash.K"],
    ["Mr-Mime", "Mr-Mime"],
    ["A1", "A1"],
    ["x".repeat(20), "x".repeat(20)],
  ])("accepts %j as %j", (input, expected) => {
    const parsed = nicknameSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "    "],
    ["one character", "A"],
    ["21 characters", "x".repeat(21)],
    ["emoji", "🔥🔥"],
    ["emoji next to letters", "Ana🔥"],
    ["symbols", "Ana!"],
    ["html", "<b>Ana</b>"],
    ["no letters or digits", "__"],
    ["one letter plus symbols", "a-_"],
    ["non-latin letters", "Алиса"],
    ["accent the database would drop", "Ānā"],
    ["very long input", "x".repeat(101)],
  ])("rejects %s", (_label, input) => {
    expect(nicknameSchema.safeParse(input).success).toBe(false);
  });
});

describe("joinRoomInputSchema", () => {
  it("normalizes the room code and the nickname", () => {
    const parsed = joinRoomInputSchema.safeParse({ roomCode: " abc-234 ", nickname: "  Ana " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ roomCode: "ABC234", nickname: "Ana" });
  });

  it("reports which field failed", () => {
    const badNickname = joinRoomInputSchema.safeParse({ roomCode: "ABC234", nickname: "A" });
    expect(badNickname.success).toBe(false);
    if (!badNickname.success) expect(badNickname.error.issues[0]?.path[0]).toBe("nickname");

    const badCode = joinRoomInputSchema.safeParse({ roomCode: "ABC", nickname: "Ana" });
    expect(badCode.success).toBe(false);
    if (!badCode.success) expect(badCode.error.issues[0]?.path[0]).toBe("roomCode");
  });

  it("rejects a room code with the forbidden characters I, O, 0 and 1", () => {
    expect(joinRoomInputSchema.safeParse({ roomCode: "ABCI01", nickname: "Ana" }).success).toBe(false);
  });
});
