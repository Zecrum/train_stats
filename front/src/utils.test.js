import { describe, it, expect } from "vitest";
import { pct, fmtShort, addDays } from "./utils";

describe("pct", () => {
  it("arrondit le pourcentage", () => {
    expect(pct(1, 3)).toBe(33);
  });
  it("renvoie 0 quand whole vaut 0", () => {
    expect(pct(5, 0)).toBe(0);
  });
});

describe("fmtShort", () => {
  it("formate en JJ/MM", () => {
    expect(fmtShort("2026-03-05")).toBe("05/03");
  });
});

describe("addDays", () => {
  it("ajoute des jours en gérant le changement de mois", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("soustrait des jours avec un n négatif", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
