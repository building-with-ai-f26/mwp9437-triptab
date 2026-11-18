import { describe, expect, it } from "vitest";
import { cleanVenmo, cleanZelle, venmoLooksRight, zelleLabel, zelleLooksRight } from "./pay";
import { venmoNote } from "./ledger";

describe("how people pay you", () => {
  it("cleans a Venmo username and checks it", () => {
    expect(cleanVenmo(" @Jordan-B ")).toBe("Jordan-B");
    expect(cleanVenmo("  ")).toBeNull();
    expect(venmoLooksRight("@jordan-b")).toBe(true);
    expect(venmoLooksRight("")).toBe(true);
    expect(venmoLooksRight("no")).toBe(false);
  });

  it("cleans a Zelle phone to 10 digits, and an email to lower case", () => {
    expect(cleanZelle("+1 (555) 123-4567")).toBe("5551234567");
    expect(cleanZelle("555.123.4567")).toBe("5551234567");
    expect(cleanZelle(" Jordan@Mail.Example.com ")).toBe("jordan@mail.example.com");
    expect(cleanZelle("")).toBeNull();
  });

  it("takes a US phone or an email for Zelle, and nothing else", () => {
    expect(zelleLooksRight("(555) 123-4567")).toBe(true);
    expect(zelleLooksRight("jordan@mail.example.com")).toBe(true);
    expect(zelleLooksRight("")).toBe(true);
    expect(zelleLooksRight("555-1234")).toBe(false);
    expect(zelleLooksRight("jordan")).toBe(false);
    expect(zelleLooksRight("+44 20 7946 0958")).toBe(false);
  });

  it("shows a phone the way people write it", () => {
    expect(zelleLabel("5551234567")).toBe("(555) 123-4567");
    expect(zelleLabel("jordan@mail.example.com")).toBe("jordan@mail.example.com");
  });

  it("notes a Venmo payment with TripTab, the trip and its dates", () => {
    expect(venmoNote("Pod test", "Nov 20 to 22, 2026")).toBe("TripTab · Pod test · Nov 20 to 22, 2026");
    expect(venmoNote("  ", "Nov 20 to 22, 2026")).toBe("TripTab · Nov 20 to 22, 2026");
  });
});
