import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { User } from "@prisma/client";
import * as groups from "../services/groups.js";
import * as expenses from "../services/expenses.js";
import * as balances from "../services/balances.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

async function safe(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

/** Registers all money-split tools on `server`, scoped to `user` (resolved from the caller's Bearer token). */
export function registerTools(server: McpServer, user: User) {
  server.registerTool(
    "whoami",
    {
      title: "Who Am I",
      description: "Returns the identity of the currently authenticated user.",
      inputSchema: {},
    },
    async () => json({ id: user.id, email: user.email, name: user.name })
  );

  server.registerTool(
    "create_group",
    {
      title: "Create Group",
      description: "Creates a new expense-splitting group with the caller as its first member.",
      inputSchema: { name: z.string().min(1) },
    },
    async ({ name }) =>
      safe(async () => {
        const group = await groups.createGroup(name, user.id);
        return { id: group.id, name: group.name, members: group.members.map((m) => m.user.email) };
      })
  );

  server.registerTool(
    "add_member_to_group",
    {
      title: "Add Member To Group",
      description: "Adds an already-registered user (by email) to a group the caller belongs to.",
      inputSchema: { group_id: z.string(), email: z.string().email() },
    },
    async ({ group_id, email }) =>
      safe(async () => {
        const member = await groups.addMemberByEmail(group_id, email, user.id);
        return { groupId: group_id, addedEmail: member.user.email };
      })
  );

  server.registerTool(
    "list_groups",
    {
      title: "List Groups",
      description: "Lists all groups the caller is a member of.",
      inputSchema: {},
    },
    async () =>
      safe(async () => {
        const list = await groups.listGroupsForUser(user.id);
        return list.map((g) => ({
          id: g.id,
          name: g.name,
          members: g.members.map((m) => m.user.email),
        }));
      })
  );

  server.registerTool(
    "list_group_members",
    {
      title: "List Group Members",
      description: "Lists the members of a group the caller belongs to.",
      inputSchema: { group_id: z.string() },
    },
    async ({ group_id }) =>
      safe(async () => {
        const members = await groups.listGroupMembers(group_id, user.id);
        return members.map((m) => ({ email: m.user.email, name: m.user.name }));
      })
  );

  server.registerTool(
    "add_expense",
    {
      title: "Add Expense",
      description:
        "Logs an expense in a group and splits it among participants. Defaults to: paid by the caller, split " +
        "evenly across every current group member. Pass participant_emails to split only among a subset, or " +
        "custom_shares (email -> exact dollar amount, must sum to amount) for an uneven split.",
      inputSchema: {
        group_id: z.string(),
        description: z.string().min(1),
        amount: z.number().positive(),
        paid_by_email: z.string().email().optional(),
        participant_emails: z.array(z.string().email()).optional(),
        custom_shares: z.record(z.string(), z.number().positive()).optional(),
      },
    },
    async ({ group_id, description, amount, paid_by_email, participant_emails, custom_shares }) =>
      safe(async () => {
        const expense = await expenses.addExpense({
          groupId: group_id,
          description,
          amountDollars: amount,
          requestingUserId: user.id,
          paidByEmail: paid_by_email,
          participantEmails: participant_emails,
          customSharesDollars: custom_shares,
        });
        return {
          id: expense.id,
          description: expense.description,
          amount: Number(expense.amount),
          paidBy: expense.paidBy.email,
          shares: expense.shares.map((s) => ({ email: s.user.email, amount: Number(s.shareAmount) })),
        };
      })
  );

  server.registerTool(
    "list_expenses",
    {
      title: "List Expenses",
      description: "Lists all expenses logged in a group.",
      inputSchema: { group_id: z.string() },
    },
    async ({ group_id }) =>
      safe(async () => {
        const list = await expenses.listExpenses(group_id, user.id);
        return list.map((e) => ({
          id: e.id,
          description: e.description,
          amount: Number(e.amount),
          paidBy: e.paidBy.email,
          shares: e.shares.map((s) => ({ email: s.user.email, amount: Number(s.shareAmount) })),
        }));
      })
  );

  server.registerTool(
    "get_balances",
    {
      title: "Get Balances",
      description:
        "Computes each member's net balance in a group (positive = owed money, negative = owes money) plus a " +
        "simplified list of suggested settlement payments.",
      inputSchema: { group_id: z.string() },
    },
    async ({ group_id }) => safe(async () => balances.getGroupBalances(group_id, user.id))
  );

  server.registerTool(
    "settle_up",
    {
      title: "Settle Up",
      description: "Records that the caller paid another group member back, reducing their balance.",
      inputSchema: { group_id: z.string(), to_email: z.string().email(), amount: z.number().positive() },
    },
    async ({ group_id, to_email, amount }) =>
      safe(async () => {
        const settlement = await balances.settleUp(group_id, to_email, amount, user.id);
        return {
          id: settlement.id,
          from: settlement.from.email,
          to: settlement.to.email,
          amount: Number(settlement.amount),
        };
      })
  );
}
