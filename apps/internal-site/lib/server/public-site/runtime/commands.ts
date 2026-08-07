import { spawn } from "node:child_process";
import { getCfPagesBranch, getCfPagesProjectName } from "../../runtime-config";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandOutputEvent {
  stream: "stdout" | "stderr";
  text: string;
}

export interface RunCommandOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  unsetEnv?: readonly string[];
  onOutput?: (event: CommandOutputEvent) => void;
}

const OUTPUT_CAPTURE_LIMIT_BYTES = 64 * 1024;

/** Retains a byte-bounded diagnostic tail so verbose builds cannot grow the server heap forever. */
export function appendCommandOutputTail(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike> | string,
): Buffer<ArrayBufferLike> {
  const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (next.byteLength >= OUTPUT_CAPTURE_LIMIT_BYTES) {
    return next.subarray(next.byteLength - OUTPUT_CAPTURE_LIMIT_BYTES);
  }

  const combined = Buffer.concat([current, next]);
  return combined.byteLength > OUTPUT_CAPTURE_LIMIT_BYTES
    ? combined.subarray(combined.byteLength - OUTPUT_CAPTURE_LIMIT_BYTES)
    : combined;
}

/** Signals the entire detached command group so pnpm cannot leave build workers behind. */
function signalCommandTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The process may have exited between the signal and group lookup; fall back to the child.
    }
  }

  child.kill(signal);
}

/**
 * Normalizes command names for Windows shells so runtime helpers can keep a single invocation path
 * for `pnpm` regardless of the host OS.
 */
function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

/** Applies overrides before removals so callers can explicitly suppress inherited process flags. */
function resolveCommandEnvironment(options?: RunCommandOptions): NodeJS.ProcessEnv {
  const env = { ...process.env, ...options?.env };
  for (const name of options?.unsetEnv ?? []) {
    delete env[name];
  }
  return env;
}

/**
 * Keeps the public build invocation in one place so export and test code cannot drift on the exact
 * app/package being built.
 */
export function getPublicSiteBuildArgs(): string[] {
  return ["--filter", "@magic-compare/public-site", "build"];
}

/**
 * Constructs the deploy command lazily from env so route handlers and tests both exercise the same
 * branch/project selection logic.
 */
export function getWranglerPagesDeployArgs(exportDir: string): string[] {
  const projectName = getCfPagesProjectName() ?? "";
  const branch = getCfPagesBranch();
  const args = ["exec", "wrangler", "pages", "deploy", exportDir, "--project-name", projectName];

  if (branch) {
    args.push("--branch", branch);
  }

  return args;
}

/**
 * Captures bounded stdout/stderr tails for diagnostics and forwards container shutdown to every
 * process in the transient build/deploy command group.
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options?: RunCommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      cwd,
      detached: process.platform !== "win32",
      env: resolveCommandEnvironment(options),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let parentSignal: NodeJS.Signals | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;

    /** A parent signal is replayed after the child group exits so Next itself also shuts down. */
    function forwardParentSignal(signal: NodeJS.Signals) {
      if (parentSignal) {
        return;
      }

      parentSignal = signal;
      signalCommandTree(child, signal);
      forceKillTimer = setTimeout(() => signalCommandTree(child, "SIGKILL"), 5_000);
      forceKillTimer.unref();
    }

    const handleSigterm = () => forwardParentSignal("SIGTERM");
    const handleSigint = () => forwardParentSignal("SIGINT");
    process.once("SIGTERM", handleSigterm);
    process.once("SIGINT", handleSigint);

    function cleanup() {
      process.removeListener("SIGTERM", handleSigterm);
      process.removeListener("SIGINT", handleSigint);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = appendCommandOutputTail(stdout, chunk);
      options?.onOutput?.({ stream: "stdout", text });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = appendCommandOutputTail(stderr, chunk);
      options?.onOutput?.({ stream: "stderr", text });
    });

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (parentSignal) {
        process.kill(process.pid, parentSignal);
        return;
      }

      const stdoutText = stdout.toString("utf8");
      const stderrText = stderr.toString("utf8");
      if (code === 0) {
        resolve({ stdout: stdoutText, stderr: stderrText });
        return;
      }

      reject(
        new Error(
          [`Command failed: ${command} ${args.join(" ")}`, stderrText.trim(), stdoutText.trim()]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
