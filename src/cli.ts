#!/usr/bin/env node
import { createServer } from "./ui-server/server.js";

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith("--port="));
const port = portArg ? parseInt(portArg.split("=")[1]!, 10) : 3000;

createServer(port);
