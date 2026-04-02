import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.fn();
const mockSpawnSync = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdtemp = vi.fn();
const mockRm = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");

  return {
    ...actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
    default: {
      ...(actual as object),
      spawn: mockSpawn,
      spawnSync: mockSpawnSync,
    },
  };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  return {
    ...actual,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdtemp: mockMkdtemp,
    rm: mockRm,
    default: {
      ...(actual as object),
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      mkdtemp: mockMkdtemp,
      rm: mockRm,
    },
  };
});

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const VALID_DATA_URL = `data:image/png;base64,${TINY_PNG.toString("base64")}`;

describe("text-transfer-shim", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ error: null, status: 0, stderr: "" });
    mockMkdtemp.mockResolvedValue("/tmp/test-dir");
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a Claude-style prompt around the user's free-form request", async () => {
    const { buildTransferPrompt } = await import("../../server/text-transfer-skill-shim");

    const prompt = buildTransferPrompt({
      prompt: "把第一张图上的 Day 01 改成 Day 05，其余布局保持不变",
      refText: "Day 01",
      targetText: "Day 05",
    });

    expect(prompt).toContain("recreate Image 2");
    expect(prompt).toContain("The original text from Image 1 was: Day 01.");
    expect(prompt).toContain("Render the following modified text on Image 2: Day 05.");
    expect(prompt).toContain("User editing request: 把第一张图上的 Day 01 改成 Day 05");
  });

  it("returns image_data_url on successful python run", async () => {
    const { runPythonScript } = await import("../../server/python-runner");

    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (arg: number | Error) => void) => {
        if (event === "close") cb(0);
      }),
    };

    mockSpawn.mockReturnValue(mockProcess as never);
    mockReadFile.mockResolvedValue(TINY_PNG);

    const result = await runPythonScript({
      scriptPath: "/fake/transform.py",
      args: ["--prompt", "test"],
      extraImages: [{ dataUrl: VALID_DATA_URL, argName: "--ref" }],
    });

    expect(result.image_data_url).toMatch(/^data:image\/png;base64,/);
  });

  it("throws when python exits non-zero", async () => {
    const { runPythonScript } = await import("../../server/python-runner");

    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === "data") cb(Buffer.from("API error"));
        }),
      },
      on: vi.fn((event: string, cb: (arg: number | Error) => void) => {
        if (event === "close") cb(1);
      }),
    };

    mockSpawn.mockReturnValue(mockProcess as never);

    await expect(
      runPythonScript({
        scriptPath: "/fake/transform.py",
        args: ["--prompt", "test"],
      })
    ).rejects.toThrow("exit 1");
  });

  it("throws when output file is empty", async () => {
    const { runPythonScript } = await import("../../server/python-runner");

    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (arg: number | Error) => void) => {
        if (event === "close") cb(0);
      }),
    };

    mockSpawn.mockReturnValue(mockProcess as never);
    mockReadFile.mockResolvedValue(Buffer.alloc(0));

    await expect(
      runPythonScript({
        scriptPath: "/fake/transform.py",
        args: ["--prompt", "test"],
      })
    ).rejects.toThrow("empty output");
  });

  it("throws when data URL is invalid", async () => {
    const { parseDataUrl } = await import("../../server/python-runner");

    expect(() => parseDataUrl("not-a-data-url")).toThrow("Invalid image data URL");
  });

  it("cleans up temp dir even when spawn emits an error", async () => {
    const { runPythonScript } = await import("../../server/python-runner");

    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (arg: number | Error) => void) => {
        if (event === "error") cb(new Error("ENOENT: python not found"));
      }),
    };

    mockSpawn.mockReturnValue(mockProcess as never);

    await expect(
      runPythonScript({
        scriptPath: "/fake/transform.py",
        args: [],
      })
    ).rejects.toThrow("ENOENT: python not found");

    expect(mockRm).toHaveBeenCalledWith("/tmp/test-dir", { recursive: true, force: true });
  });
});
