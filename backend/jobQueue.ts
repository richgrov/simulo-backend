import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";
import { exec as _exec } from "child_process";
import { fileURLToPath } from "url";

// Working directory for compile jobs
export const WORK_DIR = process.env.WORK_DIR ?? path.join(process.cwd(), "workdir");
if (!fs.existsSync(WORK_DIR)) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
}

const PROCESS_DELAY_MS = Number(process.env.JOB_DELAY_MS ?? 200);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "template");
const exec = promisify(_exec);

interface Job {
  code: string;
  resolve: (r: string) => void;
  reject: (e: unknown) => void;
}

export class JobQueue {
  private queue: Job[] = [];
  private running = false;

  enqueue(code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ code, resolve, reject });
      void this.process();
    });
  }

  private async runJob(code: string): Promise<string> {
    const id = crypto.randomBytes(8).toString("hex");
    const dir = path.join(WORK_DIR, id);
    await fsp.mkdir(dir, { recursive: true });

    await exec("cargo init --lib", { cwd: dir });

    const src = path.join(dir, "src");
    await fsp.copyFile(path.join(TEMPLATE_DIR, "lib.rs"), path.join(src, "lib.rs"));
    await fsp.copyFile(path.join(TEMPLATE_DIR, "simulo.rs"), path.join(src, "simulo.rs"));
    await fsp.writeFile(path.join(src, "game.rs"), code);

    const crate = path.basename(dir).replace(/-/g, "_");
    const buildCmd = "cargo build --target wasm32-unknown-unknown --release";
    try {
      await exec(buildCmd, { cwd: dir });
    } catch (err: any) {
      const stderr = err?.stderr ?? "";
      await fsp.rm(dir, { recursive: true, force: true });
      throw new Error(`compile failed: ${stderr}`);
    }

    const wasmPath = path.join(
      dir,
      "target",
      "wasm32-unknown-unknown",
      "release",
      `${crate}.wasm`,
    );
    const wasm = await fsp.readFile(wasmPath);

    await new Promise((r) => setTimeout(r, PROCESS_DELAY_MS));
    await fsp.rm(dir, { recursive: true, force: true });
    return wasm.toString("base64");
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const { code, resolve, reject } = this.queue.shift()!;
      try {
        const out = await this.runJob(code);
        resolve(out);
      } catch (err) {
        reject(err);
      }
    }
    this.running = false;
  }
}
