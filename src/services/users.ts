import { prisma } from "../db/client.js";
import { generateApiKey, hashApiKey } from "./apiKey.js";

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" is already registered.`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

export async function registerUser(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailAlreadyRegisteredError(email);
  }

  const apiKey = generateApiKey();
  const user = await prisma.user.create({
    data: {
      email,
      name,
      apiKeyHash: hashApiKey(apiKey),
    },
  });

  return { user, apiKey };
}

export async function findUserByApiKey(apiKey: string) {
  return prisma.user.findUnique({ where: { apiKeyHash: hashApiKey(apiKey) } });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
