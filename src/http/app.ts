import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerUser, EmailAlreadyRegisteredError } from "../services/users.js";
import { registerTools } from "../mcp/registerTools.js";
import { requireApiKey, type AuthedRequest } from "./auth.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/register", async (req, res) => {
    const { email, name } = req.body ?? {};
    if (typeof email !== "string" || typeof name !== "string" || !email || !name) {
      res.status(400).json({ error: "Both 'email' and 'name' are required strings." });
      return;
    }

    try {
      const { user, apiKey } = await registerUser(email, name);
      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
        apiKey,
        note: "Store this API key now — it will not be shown again. Send it as 'Authorization: Bearer <apiKey>' on every MCP request.",
      });
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/mcp", requireApiKey, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const server = new McpServer({ name: "money-split-mcp", version: "1.0.0" });
    registerTools(server, user);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "This server is stateless; use POST /mcp for all MCP requests." });
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "This server is stateless; there is no session to terminate." });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  });

  return app;
}
