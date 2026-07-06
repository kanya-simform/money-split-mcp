import { describe, it, expect } from "vitest";
import { computeNetCents, simplifyDebts } from "../src/services/balances.js";

describe("computeNetCents", () => {
  it("nets a single expense split three ways", () => {
    // Alice pays 900, split evenly across Alice, Bob, Carol (300 each).
    const net = computeNetCents(
      [
        {
          paidById: "alice",
          amountCents: 900,
          shares: [
            { userId: "alice", amountCents: 300 },
            { userId: "bob", amountCents: 300 },
            { userId: "carol", amountCents: 300 },
          ],
        },
      ],
      []
    );

    expect(net.get("alice")).toBe(600); // paid 900, owes 300 -> net +600 (owed)
    expect(net.get("bob")).toBe(-300);
    expect(net.get("carol")).toBe(-300);

    // Total across the group always nets to zero.
    expect([...net.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("applies settlements to reduce balances", () => {
    const net = computeNetCents(
      [
        {
          paidById: "alice",
          amountCents: 1000,
          shares: [
            { userId: "alice", amountCents: 500 },
            { userId: "bob", amountCents: 500 },
          ],
        },
      ],
      [{ fromId: "bob", toId: "alice", amountCents: 500 }]
    );

    expect(net.get("alice")).toBe(0);
    expect(net.get("bob")).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("produces no payments when everyone is already settled", () => {
    const net = new Map([["alice", 0], ["bob", 0]]);
    expect(simplifyDebts(net)).toEqual([]);
  });

  it("matches a single debtor to a single creditor", () => {
    const net = new Map([
      ["alice", 600],
      ["bob", -300],
      ["carol", -300],
    ]);
    const debts = simplifyDebts(net);
    expect(debts).toHaveLength(2);
    const total = debts.reduce((sum, d) => sum + d.amountCents, 0);
    expect(total).toBe(600);
    for (const d of debts) {
      expect(d.toUserId).toBe("alice");
    }
  });

  it("minimizes transactions across multiple debtors and creditors", () => {
    const net = new Map([
      ["alice", 1000],
      ["bob", 500],
      ["carol", -700],
      ["dave", -800],
    ]);
    const debts = simplifyDebts(net);
    // 4 participants should never need more than 3 transactions to settle.
    expect(debts.length).toBeLessThanOrEqual(3);

    const perUserNet = new Map<string, number>();
    for (const d of debts) {
      perUserNet.set(d.fromUserId, (perUserNet.get(d.fromUserId) ?? 0) - d.amountCents);
      perUserNet.set(d.toUserId, (perUserNet.get(d.toUserId) ?? 0) + d.amountCents);
    }
    for (const [userId, amount] of net.entries()) {
      expect(perUserNet.get(userId) ?? 0).toBe(amount);
    }
  });
});
