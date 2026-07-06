import { prisma } from "../db/client.js";
import { findUserByEmail } from "./users.js";

export class NotAGroupMemberError extends Error {
  constructor() {
    super("You are not a member of this group.");
    this.name = "NotAGroupMemberError";
  }
}

export class UserNotFoundError extends Error {
  constructor(email: string) {
    super(`No registered user found with email "${email}".`);
    this.name = "UserNotFoundError";
  }
}

export async function assertMembership(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new NotAGroupMemberError();
  }
}

export async function createGroup(name: string, creatorId: string) {
  return prisma.group.create({
    data: {
      name,
      createdById: creatorId,
      members: {
        create: { userId: creatorId },
      },
    },
    include: { members: { include: { user: true } } },
  });
}

export async function addMemberByEmail(groupId: string, email: string, requestingUserId: string) {
  await assertMembership(groupId, requestingUserId);

  const user = await findUserByEmail(email);
  if (!user) {
    throw new UserNotFoundError(email);
  }

  return prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId: user.id } },
    create: { groupId, userId: user.id },
    update: {},
    include: { user: true },
  });
}

export async function listGroupsForUser(userId: string) {
  return prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listGroupMembers(groupId: string, requestingUserId: string) {
  await assertMembership(groupId, requestingUserId);
  return prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  });
}
