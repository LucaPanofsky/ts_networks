import * as fs from "node:fs/promises";
import * as path from "node:path";

// The agent's scratch workspace: a single FLAT directory holding everything the
// agent materializes (PDFs in, .txt out). This is the ONLY place in src/ that
// touches the filesystem, and the only thing standing between an untrusted name
// (a filename chosen by the agent or carried in a document) and the host disk.
//
// Safety rule, deliberately strict because the directory is flat: a name must be
// a BARE filename — no path separators, no `.`/`..`, not absolute. That alone
// makes escape impossible (root/<bare> can't leave root). Symlinks are refused
// on top of that, so a planted link can't redirect a read/write outside root.

export class WorkspaceError extends Error {
  override name = "WorkspaceError";
}

// Pure validation: return `name` iff it is a safe bare filename, else throw.
// Exported so the guarantee is testable without touching disk — it is the
// load-bearing guard.
export function safeName(name: string): string {
  if (name === "" || name === "." || name === "..") {
    throw new WorkspaceError(`invalid workspace name: ${JSON.stringify(name)}`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new WorkspaceError(
      `workspace names must be bare filenames (no path separators): ${JSON.stringify(name)}`,
    );
  }
  return name;
}

export class Workspace {
  constructor(readonly root: string) {}

  private resolve(name: string): string {
    return path.join(this.root, safeName(name));
  }

  // Refuse to read/write through a symlink (defence in depth beyond safeName).
  // A missing entry is fine — that is the normal case for a fresh write.
  private async refuseSymlink(abs: string): Promise<void> {
    try {
      const st = await fs.lstat(abs);
      if (st.isSymbolicLink()) {
        throw new WorkspaceError(`refusing to follow a symlink: ${JSON.stringify(abs)}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }

  async readBytes(name: string): Promise<Uint8Array> {
    const abs = this.resolve(name);
    await this.refuseSymlink(abs);
    return new Uint8Array(await fs.readFile(abs));
  }

  async readText(name: string): Promise<string> {
    const abs = this.resolve(name);
    await this.refuseSymlink(abs);
    return fs.readFile(abs, "utf-8");
  }

  async writeText(name: string, data: string): Promise<void> {
    const abs = this.resolve(name);
    await fs.mkdir(this.root, { recursive: true });
    await this.refuseSymlink(abs);
    await fs.writeFile(abs, data, "utf-8");
  }

  // The flat listing of the workspace. A missing root reads as empty.
  async list(): Promise<string[]> {
    try {
      return await fs.readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async exists(name: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(name));
      return true;
    } catch {
      return false;
    }
  }
}
