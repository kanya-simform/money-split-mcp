import { prisma } from "../db/client.js";
import { assertMembership } from "./groups.js";
import { findUserByEmail } from "./users.js";
import { dollarsToCents, centsToDollars, splitEvenlyCents } from "./money.js";

export class UserNotInGroupError extends Error {
  constructor(email: string) {
    super(`"${email}" is not a member of this group.`);
    this.name = "UserNotInGroupError";
  }
}

export class InvalidSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSplitError";
  }
}

interface AddExpenseParams {
  groupId: string;
  description: string;
  amountDollars: number;
  requestingUserId: string;
  paidByEmail?: string;
  participantEmails?: string[];
  /** Exact dollar amount per participant email; must sum to amountDollars (within a cent). */
  customSharesDollars?: Record<string, number>;
}

export async function addExpense(params: AddExpenseParams) {
  const { groupId, description, amountDollars, requestingUserId } = params;
  await assertMembership(groupId, requestingUserId);

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  });
  const memberByEmail = new Map(members.map((m) => [m.user.email, m.user]));
  const memberByUserId = new Map(members.map((m) => [m.userId, m.user]));

  const paidBy = params.paidByEmail ? memberByEmail.get(params.paidByEmail) : memberByUserId.get(requestingUserId);
  if (!paidBy) {
    throw new UserNotInGroupError(params.paidByEmail ?? requestingUserId);
  }

  const totalCents = dollarsToCents(amountDollars);

  let shareCentsByUserId: Map<string, number>;

  if (params.customSharesDollars) {
    const entries = Object.entries(params.customSharesDollars);
    shareCentsByUserId = new Map();
    let sumCents = 0;
    for (const [email, dollars] of entries) {
      const user = memberByEmail.get(email);
      if (!user) {
        throw new UserNotInGroupError(email);
      }
      const cents = dollarsToCents(dollars);
      sumCents += cents;
      shareCentsByUserId.set(user.id, cents);
    }
    if (sumCents !== totalCents) {
      throw new InvalidSplitError(
        `Custom shares sum to ${centsToDollars(sumCents)} but the expense amount is ${amountDollars}.`
      );
    }
  } else {
    const participantEmails = params.participantEmails ?? [...memberByEmail.keys()];
    const participants = participantEmails.map((email) => {
      const user = memberByEmail.get(email);
      if (!user) {
        throw new UserNotInGroupError(email);
      }
      return user;
    });
    if (participants.length === 0) {
      throw new InvalidSplitError("An expense needs at least one participant.");
    }
    const shares = splitEvenlyCents(totalCents, participants.length);
    shareCentsByUserId = new Map(participants.map((user, i) => [user.id, shares[i]]));
  }

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description,
      amount: amountDollars,
      paidById: paidBy.id,
      createdById: requestingUserId,
      shares: {
        create: [...shareCentsByUserId.entries()].map(([userId, cents]) => ({
          userId,
          shareAmount: centsToDollars(cents),
        })),
      },
    },
    include: { shares: { include: { user: true } }, paidBy: true },
  });

  return expense;
}

export async function listExpenses(groupId: string, requestingUserId: string) {
  await assertMembership(groupId, requestingUserId);
  return prisma.expense.findMany({
    where: { groupId },
    include: { paidBy: true, shares: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
}
