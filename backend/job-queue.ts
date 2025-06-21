import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";
import { exec as _exec } from "child_process";
import { fileURLToPath } from "url";

export const WORK_DIR = path.join(process.cwd(), "workdir");
if (!(await fs.exists(WORK_DIR))) {
  await fs.mkdir(WORK_DIR, { recursive: true });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "template");
const exec = promisify(_exec);

interface Job {
  code: string;
  resolve: (r: JobResult) => void;
  reject: (e: unknown) => void;
}

export interface JobResult {
  id: string;
  directory: string;
  wasmPath: string;
}

export class JobQueue {
  private queue: Job[] = [];
  private running = false;

  enqueue(code: string): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ code, resolve, reject });
      this.process();
    });
  }

  private async runJob(code: string): Promise<JobResult> {
    // start with 'a' because package name cannot start with a number
    const id = "a" + crypto.randomBytes(16).toString("hex");
    console.log(`Running job ${id}`);

    const dir = path.join(WORK_DIR, id);
    await fs.mkdir(dir, { recursive: true });

    await exec("cargo init --lib", { cwd: dir });
    fs.appendFile(
      path.join(dir, "Cargo.toml"),
      `\

[lib]
crate-type = ["cdylib"]`,
    );

    const src = path.join(dir, "src");
    await fs.copyFile(
      path.join(TEMPLATE_DIR, "lib.rs"),
      path.join(src, "lib.rs"),
    );
    await fs.copyFile(
      path.join(TEMPLATE_DIR, "simulo.rs"),
      path.join(src, "simulo.rs"),
    );
    await fs.writeFile(path.join(src, "game.rs"), code);

    const crate = path.basename(dir).replace(/-/g, "_");
    const buildCmd = "cargo build --target wasm32-unknown-unknown --release";
    try {
      await exec(buildCmd, { cwd: dir });
    } catch (err: any) {
      const stderr = err?.stderr ?? "";
      await fs.rm(dir, { recursive: true, force: true });
      throw new Error(`compile failed: ${stderr}`);
    }

    const wasmPath = path.join(
      dir,
      "target",
      "wasm32-unknown-unknown",
      "release",
      `${crate}.wasm`,
    );

    console.log(`Job ${id} completed`);
    return { id, directory: dir, wasmPath };
  }

  private async process() {
    if (this.running) {
      return;
    }

    this.running = true;

    while (this.queue.length) {
      const { code, resolve, reject } = this.queue.shift()!;
      try {
        const out = await this.runJob(code);
        resolve(out);
      } catch (err) {
        reject(err);
        console.error(`Job failed: ${err}`);
      }
    }

    this.running = false;
  }
}

export function finishJob(job: JobResult) {
  fs.rm(job.directory, { recursive: true, force: true });
}
