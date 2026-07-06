import { prisma } from "../db/client.js";
import { assertMembership } from "./groups.js";
import { findUserByEmail } from "./users.js";
import { dollarsToCents, centsToDollars } from "./money.js";

export class InvalidSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettlementError";
  }
}

export interface ExpenseForNet {
  paidById: string;
  amountCents: number;
  shares: Array<{ userId: string; amountCents: number }>;
}

export interface SettlementForNet {
  fromId: string;
  toId: string;
  amountCents: number;
}

/** Positive = the group owes this user money. Negative = this user owes the group. */
export function computeNetCents(
  expenses: ExpenseForNet[],
  settlements: SettlementForNet[]
): Map<string, number> {
  const net = new Map<string, number>();
  const add = (userId: string, delta: number) => net.set(userId, (net.get(userId) ?? 0) + delta);

  for (const expense of expenses) {
    add(expense.paidById, expense.amountCents);
    for (const share of expense.shares) {
      add(share.userId, -share.amountCents);
    }
  }

  for (const settlement of settlements) {
    // "from" paid cash to "to", so "from" owes less (net goes up) and "to" is owed less (net goes down).
    add(settlement.fromId, settlement.amountCents);
    add(settlement.toId, -settlement.amountCents);
  }

  return net;
}

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/** Greedily matches the largest debtor against the largest creditor to minimize the number of payments. */
export function simplifyDebts(net: Map<string, number>): SimplifiedDebt[] {
  const debtors: Array<{ userId: string; amountCents: number }> = [];
  const creditors: Array<{ userId: string; amountCents: number }> = [];

  for (const [userId, amount] of net.entries()) {
    if (amount < 0) debtors.push({ userId, amountCents: -amount });
    else if (amount > 0) creditors.push({ userId, amountCents: amount });
  }

  debtors.sort((a, b) => b.amountCents - a.amountCents);
  creditors.sort((a, b) => b.amountCents - a.amountCents);

  const result: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amountCents, creditor.amountCents);

    if (amount > 0) {
      result.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents: amount });
    }

    debtor.amountCents -= amount;
    creditor.amountCents -= amount;

    if (debtor.amountCents === 0) i++;
    if (creditor.amountCents === 0) j++;
  }

  return result;
}

export async function getGroupBalances(groupId: string, requestingUserId: string) {
  await assertMembership(groupId, requestingUserId);

  const [expenses, settlements, members] = await Promise.all([
    prisma.expense.findMany({ where: { groupId }, include: { shares: true } }),
    prisma.settlement.findMany({ where: { groupId } }),
    prisma.groupMember.findMany({ where: { groupId }, include: { user: true } }),
  ]);

  const net = computeNetCents(
    expenses.map((e) => ({
      paidById: e.paidById,
      amountCents: dollarsToCents(Number(e.amount)),
      shares: e.shares.map((s) => ({ userId: s.userId, amountCents: dollarsToCents(Number(s.shareAmount)) })),
    })),
    settlements.map((s) => ({
      fromId: s.fromId,
      toId: s.toId,
      amountCents: dollarsToCents(Number(s.amount)),
    }))
  );

  const userById = new Map(members.map((m) => [m.userId, m.user]));

  const balances = members.map((m) => ({
    email: m.user.email,
    name: m.user.name,
    netAmount: centsToDollars(net.get(m.userId) ?? 0),
  }));

  const settledUp = simplifyDebts(net).map((d) => ({
    fromEmail: userById.get(d.fromUserId)!.email,
    toEmail: userById.get(d.toUserId)!.email,
    amount: centsToDollars(d.amountCents),
  }));

  return { balances, suggestedSettlements: settledUp };
}

export async function settleUp(
  groupId: string,
  toEmail: string,
  amountDollars: number,
  requestingUserId: string
) {
  await assertMembership(groupId, requestingUserId);

  const toUser = await findUserByEmail(toEmail);
  if (!toUser) {
    throw new InvalidSettlementError(`No registered user found with email "${toEmail}".`);
  }
  await assertMembership(groupId, toUser.id);

  if (toUser.id === requestingUserId) {
    throw new InvalidSettlementError("You cannot settle up with yourself.");
  }
  if (amountDollars <= 0) {
    throw new InvalidSettlementError("Settlement amount must be greater than 0.");
  }

  return prisma.settlement.create({
    data: {
      groupId,
      fromId: requestingUserId,
      toId: toUser.id,
      amount: amountDollars,
    },
    include: { from: true, to: true },
  });
}
