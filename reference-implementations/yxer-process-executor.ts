import { spawn } from "node:child_process";

type Json = Record<string, unknown>;

// True only for JSON object documents (the Json type excludes arrays/scalars).
function isJsonObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Also admits arrays: findString/findUrl must descend into nested lists of
// objects, and Object.entries treats an array's indices as string keys.
function isJsonContainer(value: unknown): value is Json {
  return typeof value === "object" && value !== null;
}

export class YxerProcessError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "TIMEOUT"
      | "NON_ZERO_EXIT"
      | "INVALID_JSON"
      | "OUTPUT_TOO_LARGE",
    public readonly safeOutput?: string,
  ) {
    super(message);
  }
}

async function runYxer(
  args: readonly string[],
  opts: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxOutput = opts.maxOutputBytes ?? 2_000_000;

  // SECURITY:
  // - shell:false
  // - executable fixed
  // - args built only by typed methods below
  // - never accept a raw command string from server/user content
  return new Promise((resolve, reject) => {
    const child = spawn("yxer", [...args], {
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let killedForSize = false;

    const add = (kind: "stdout" | "stderr", chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) {
        killedForSize = true;
        child.kill();
        return;
      }
      if (kind === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };

    child.stdout.on("data", (c: Buffer) => add("stdout", c));
    child.stderr.on("data", (c: Buffer) => add("stderr", c));

    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new YxerProcessError(
          `Failed to start yxer: ${err.message}`,
          "NON_ZERO_EXIT",
        ),
      );
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killedForSize) {
        reject(
          new YxerProcessError(
            "yxer output exceeded limit",
            "OUTPUT_TOO_LARGE",
          ),
        );
        return;
      }
      if (signal && code === null) {
        reject(
          new YxerProcessError("yxer timed out or was terminated", "TIMEOUT"),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new YxerProcessError(
            `yxer exited ${code}`,
            "NON_ZERO_EXIT",
            sanitize(`${stdout}\n${stderr}`),
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sanitize(text: string): string {
  return text
    .replace(
      /(authorization|api[-_ ]?key|token|cookie)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 20_000);
}

function parseJson(text: string): Json {
  const trimmed = text.trim();
  const direct = tryParseJsonObject(trimmed);
  if (direct) return direct;
  // Some CLI versions may print notices. The production adapter must prefer
  // commands that explicitly support --json and contract-test the exact version.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const nested = tryParseJsonObject(trimmed.slice(start, end + 1));
    if (nested) return nested;
  }
  throw new YxerProcessError(
    "yxer returned non-JSON (or non-object) output",
    "INVALID_JSON",
    sanitize(text),
  );
}

function tryParseJsonObject(text: string): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface YxerAcceptedTask {
  taskSetId: string;
  raw: Json;
}

export interface YxerTaskInspection {
  terminal: boolean;
  succeeded: boolean;
  failed: boolean;
  publicUrl?: string;
  externalContentId?: string;
  raw: Json;
}

export class YxerExecutor {
  async version(): Promise<string> {
    const { stdout } = await runYxer(["--version"], { timeoutMs: 20_000 });
    return stdout.trim();
  }

  async doctor(): Promise<Json> {
    // Exact JSON flag must be confirmed by connector smoke for pinned version.
    const { stdout } = await runYxer(["doctor"], { timeoutMs: 60_000 });
    return { text: sanitize(stdout) };
  }

  async accounts(platform: string): Promise<Json> {
    assertPlatform(platform);
    const { stdout } = await runYxer([
      "accounts",
      "list",
      platform,
      "--status",
      "1",
      "--json",
    ]);
    return parseJson(stdout);
  }

  async prepare(
    platform: string,
    type: "article" | "imageText" | "video",
  ): Promise<Json> {
    assertPlatform(platform);
    const { stdout } = await runYxer(["prepare", platform, type]);
    return { text: sanitize(stdout) };
  }

  async schemaFields(
    platform: string,
    type: "article" | "imageText" | "video",
  ): Promise<Json> {
    assertPlatform(platform);
    const { stdout } = await runYxer(["schema", "fields", platform, type]);
    return { text: sanitize(stdout) };
  }

  async validate(
    platform: string,
    type: "article" | "imageText" | "video",
    payloadPath: string,
    contentFile?: string,
  ): Promise<void> {
    assertPlatform(platform);
    const args = ["validate", platform, type, payloadPath];
    if (contentFile) args.push("--content-file", contentFile);
    await runYxer(args);
  }

  async dryRun(
    platform: string,
    type: "article" | "imageText" | "video",
    payloadPath: string,
    contentFile?: string,
  ): Promise<Json> {
    assertPlatform(platform);
    const args = ["publish", type, platform, payloadPath];
    if (contentFile) args.push("--content-file", contentFile);
    args.push("--dry-run");
    const { stdout } = await runYxer(args);
    return { text: sanitize(stdout) };
  }

  async submit(
    platform: string,
    type: "article" | "imageText" | "video",
    payloadPath: string,
    contentFile?: string,
  ): Promise<YxerAcceptedTask> {
    assertPlatform(platform);
    const args = ["publish", type, platform, payloadPath];
    if (contentFile) args.push("--content-file", contentFile);

    const { stdout } = await runYxer(args, { timeoutMs: 180_000 });
    const raw = parseJson(stdout);
    const taskSetId = findString(raw, ["taskSetId"]);
    if (!taskSetId) {
      // IMPORTANT: absence does NOT mean safe-to-retry.
      throw new YxerProcessError(
        "Publish response did not contain a taskSetId; classify as REMOTE_STATE_UNKNOWN and reconcile",
        "INVALID_JSON",
        sanitize(stdout),
      );
    }
    return { taskSetId, raw };
  }

  async inspectTask(taskSetId: string): Promise<YxerTaskInspection> {
    assertOpaqueId(taskSetId);
    const { stdout } = await runYxer(["query", "details", taskSetId, "--json"]);
    const raw = parseJson(stdout);

    // Do NOT assume this generic parser is enough for production.
    // M0.5 must snapshot actual v3.2.x response and implement an exact parser.
    const text = JSON.stringify(raw).toLowerCase();
    const failed =
      text.includes('"stagestatus":"fail"') ||
      text.includes('"status":"fail"') ||
      text.includes('"status":"failed"') ||
      text.includes('"success":false');
    const succeeded =
      !failed &&
      (text.includes('"stagestatus":"success"') ||
        text.includes('"status":"success"') ||
        text.includes('"status":"published"'));
    const publicUrl = findUrl(raw);

    return {
      terminal: failed || succeeded,
      succeeded,
      failed,
      publicUrl,
      raw,
    };
  }
}

function assertPlatform(platform: string): void {
  if (!/^[\p{L}\p{N}_ .\-()（）]{1,64}$/u.test(platform)) {
    throw new Error("Invalid platform identifier");
  }
}
function assertOpaqueId(value: string): void {
  if (!/^[A-Za-z0-9_\-:.]{1,256}$/.test(value))
    throw new Error("Invalid opaque id");
}

function findString(obj: unknown, keys: string[]): string | undefined {
  if (!isJsonContainer(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === "string" && v) return v;
    const nested = findString(v, keys);
    if (nested) return nested;
  }
}
function findUrl(obj: unknown): string | undefined {
  if (!isJsonContainer(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (
      /(url|link)/i.test(k) &&
      typeof v === "string" &&
      /^https?:\/\//i.test(v)
    )
      return v;
    const nested = findUrl(v);
    if (nested) return nested;
  }
}
