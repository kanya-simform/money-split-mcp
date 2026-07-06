import "dotenv/config";
import { createApp } from "./http/app.js";

const port = Number(process.env.PORT ?? 3000);

const app = createApp();
app.listen(port, () => {
  console.log(`money-split-mcp listening on http://localhost:${port}`);
});
