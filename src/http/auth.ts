import type { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { findUserByApiKey } from "../services/users.js";

export interface AuthedRequest extends Request {
  user?: User;
}

export async function requireApiKey(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    res.status(401).json({ error: "Missing or malformed Authorization: Bearer <api_key> header." });
    return;
  }

  const user = await findUserByApiKey(token);
  if (!user) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }

  req.user = user;
  next();
}
