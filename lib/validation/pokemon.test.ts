import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { searchPokemonNames } from "../pokemon-search";
import { normalizeName, parsePokemonFile } from "./pokemon";

const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), "data/pokemon.json"), "utf8"));
const entries = parsePokemonFile(raw);
const names = entries.map((e, i) => ({ id: i + 1, nombre_es: e.nombre_es, search_key: normalizeName(e.nombre_es) }));

describe("pokemon file", () => {
  it("validates to 1082 entries: 1025 base and 57 regional", () => {
    expect(entries).toHaveLength(1082);
    expect(entries.filter((e) => e.regional)).toHaveLength(57);
  });

  it("excludes Basculin de Hisui", () => {
    expect(entries.some((e) => e.nombre_en === "basculin-white-striped")).toBe(false);
  });

  it("rejects an unknown type, a wrong count and a duplicate", () => {
    const withBadType = JSON.parse(JSON.stringify(raw)) as Array<{ tipos_es: string[] }>;
    withBadType[0]!.tipos_es = ["Sonido"];
    expect(() => parsePokemonFile(withBadType)).toThrow();
    expect(() => parsePokemonFile((raw as unknown[]).slice(0, 500))).toThrow();
    expect(() => parsePokemonFile([...(raw as unknown[]), (raw as unknown[])[1]])).toThrow();
  });
});

describe("normalizeName", () => {
  it("ignores case, accents, dots, hyphens, apostrophes and symbols", () => {
    expect(normalizeName("Nidoran♀")).toBe("nidoran");
    expect(normalizeName("Farfetch’d")).toBe("farfetchd");
    expect(normalizeName("Mr. Mime")).toBe("mrmime");
    expect(normalizeName("Ho-Oh")).toBe("hooh");
    expect(normalizeName("Flabébé")).toBe("flabebe");
  });
});

describe("searchPokemonNames", () => {
  const find = (q: string) => searchPokemonNames(names, q, 50).map((n) => n.nombre_es);

  it("finds special names however they are typed", () => {
    expect(find("mr mime")).toContain("Mr. Mime");
    expect(find("MRMIME")).toContain("Mr. Mime");
    expect(find("ho oh")).toContain("Ho-Oh");
    expect(find("farfetchd")).toContain("Farfetch’d");
    expect(find("farfetch’d")).toContain("Farfetch’d");
    expect(find("FLABEBE")).toContain("Flabébé");
  });

  it("returns both Nidoran forms", () => {
    const result = find("nidoran");
    expect(result).toContain("Nidoran♀");
    expect(result).toContain("Nidoran♂");
  });

  it("puts names that start with the query first", () => {
    expect(find("pika")[0]).toBe("Pikachu");
  });

  it("returns nothing for empty or symbol-only queries and respects the limit", () => {
    expect(searchPokemonNames(names, "")).toHaveLength(0);
    expect(searchPokemonNames(names, "...")).toHaveLength(0);
    expect(searchPokemonNames(names, "a", 8).length).toBeLessThan(9);
  });

  it("never exposes types or generation in the searchable names", () => {
    expect(Object.keys(names[0]!).sort().join(",")).toBe("id,nombre_es,search_key");
  });
});
