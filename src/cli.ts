#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createApp } from "./server/app.js";

const args = process.argv.slice(2);

function argValue(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1]! : fallback;
}

const port   = parseInt(argValue("--port", "3000"), 10);
const dbPath = argValue("--db", "./ts-networks.db");

const app = createApp(dbPath);

serve({ fetch: app.fetch, port }, () => {
  console.log(`ts-networks running on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});
