import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rateLimit";
import { getCreatorLimits } from "@/lib/creatorLimits";
import ffmpegPath from "ffmpeg-static";
import { spawn, spawnSync } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { THEME_VIDEO_RULES } from "@/lib/themeVideoRules";

export const runtime = "nodejs";
const require = createRequire(import.meta.url);

let ffmpegBinaryCache: string | null | undefined;

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Unexpected server error";
}

function normalizeInputExt(fileType: string, originalName: string): string {
  if (fileType === "video/mp4") return "mp4";
  if (fileType === "video/webm") return "webm";

  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "webm") return ext;
  return "mp4";
}

async function resolveFfmpegBinary(): Promise<string | null> {
  if (ffmpegBinaryCache !== undefined) {
    return ffmpegBinaryCache;
  }

  const candidates = new Set<string>();
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

  const envPath = process.env.FFMPEG_PATH ?? process.env.FFMPEG_BIN;
  if (envPath) candidates.add(envPath);

  const importedFfmpegPath =
    typeof ffmpegPath === "string"
      ? ffmpegPath
      : ((ffmpegPath as unknown as { default?: unknown })?.default as string | undefined);

  if (typeof importedFfmpegPath === "string" && importedFfmpegPath.length > 0) {
    candidates.add(importedFfmpegPath);

    // Handle environments where a bad uppercase root path is injected.
    if (importedFfmpegPath.startsWith("/ROOT/")) {
      candidates.add(`/root/${importedFfmpegPath.slice("/ROOT/".length)}`);
    }
  }

  const cwd = process.cwd();
  candidates.add(path.join(cwd, "node_modules", "ffmpeg-static", binaryName));
  if (cwd.startsWith("/workspaces/")) {
    candidates.add(path.join("/root", path.relative("/", cwd), "node_modules", "ffmpeg-static", binaryName));
  }

  try {
    const ffmpegStaticEntry = require.resolve("ffmpeg-static");
    const moduleDir = path.dirname(ffmpegStaticEntry);
    candidates.add(path.join(moduleDir, binaryName));
  } catch {
    // ignore: module resolution fallback only
  }

  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fsConstants.X_OK);
      ffmpegBinaryCache = candidate;
      return candidate;
    } catch {
      try {
        // Some environments preserve the file but drop execute bit on install/cache restore.
        await fs.access(candidate, fsConstants.F_OK);
        await fs.chmod(candidate, 0o755);
        await fs.access(candidate, fsConstants.X_OK);
        ffmpegBinaryCache = candidate;
        return candidate;
      } catch {
        // continue checking fallbacks
      }
    }
  }

  // Final fallback: use PATH only if ffmpeg is actually available.
  const pathProbe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (pathProbe.status === 0) {
    ffmpegBinaryCache = "ffmpeg";
    return ffmpegBinaryCache;
  }

  ffmpegBinaryCache = null;
  return ffmpegBinaryCache;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = await resolveFfmpegBinary();
  if (!bin) {
    throw new Error("Video processor unavailable");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || "ffmpeg failed"));
    });
  });
}

async function readDurationSeconds(inputPath: string): Promise<number | null> {
  const bin = await resolveFfmpegBinary();
  if (!bin) return null;

  return await new Promise<number | null>((resolve) => {
    const child = spawn(bin, ["-i", inputPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", () => resolve(null));
    child.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        resolve(null);
        return;
      }

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      resolve(hours * 3600 + minutes * 60 + seconds);
    });
  });
}

function getVideoScaleFilter(): string {
  const max = THEME_VIDEO_RULES.maxLongestEdgePx;
  // Two-pass chain: first scale to fit within maxLongestEdgePx with aspect ratio
  // preserved, then round both dimensions to even pixels (libx264 requirement).
  return `scale=${max}:${max}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

export async function POST(req: Request) {
  let workingDir: string | null = null;

  try {
    const supabaseAuth = await createSupabaseRouteClient();
    const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const limits = getCreatorLimits();

    // Per-user rate limit (skip when unlimited)
    if (Number.isFinite(limits.videoUploadsPerHour)) {
      const { allowed } = await rateLimit(`theme-video-upload:${userId}`, limits.videoUploadsPerHour, 3600);
      if (!allowed) {
        return NextResponse.json(
          { error: `Video upload limit reached. Try again later.` },
          { status: 429 }
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing video file" }, { status: 400 });
    }

    const isAllowedType = THEME_VIDEO_RULES.allowedMimeTypes.includes(file.type as "video/mp4" | "video/webm");
    if (!isAllowedType) {
      return NextResponse.json({ error: "Only MP4 and WebM videos are allowed" }, { status: 400 });
    }

    if (file.size > THEME_VIDEO_RULES.maxInputBytes) {
      return NextResponse.json({ error: `Max source size is ${Math.round(THEME_VIDEO_RULES.maxInputBytes / (1024 * 1024))}MB` }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    workingDir = await fs.mkdtemp(path.join(tmpdir(), "tiplink-video-"));

    const inputExt = normalizeInputExt(file.type, file.name);
    const inputPath = path.join(workingDir, `input.${inputExt}`);
    const outputPath = path.join(workingDir, "output.mp4");
    const outputTightPath = path.join(workingDir, "output-tight.mp4");
    const posterPath = path.join(workingDir, "poster.jpg");

    await fs.writeFile(inputPath, bytes);

    const sourceDuration = await readDurationSeconds(inputPath);
    if (typeof sourceDuration === "number" && sourceDuration > THEME_VIDEO_RULES.maxUploadDurationSeconds) {
      return NextResponse.json(
        { error: `Max source duration is ${THEME_VIDEO_RULES.maxUploadDurationSeconds} seconds` },
        { status: 400 }
      );
    }

    const outputDuration =
      typeof sourceDuration === "number"
        ? Math.min(sourceDuration, THEME_VIDEO_RULES.targetDurationSeconds)
        : THEME_VIDEO_RULES.targetDurationSeconds;
    const trimmed = typeof sourceDuration === "number" && sourceDuration > THEME_VIDEO_RULES.targetDurationSeconds;

    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-t",
      String(THEME_VIDEO_RULES.targetDurationSeconds),
      "-vf",
      getVideoScaleFilter(),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ]);

    let selectedOutputPath = outputPath;
    let videoBuffer = await fs.readFile(selectedOutputPath);

    if (videoBuffer.length > THEME_VIDEO_RULES.targetMaxBytes) {
      await runFfmpeg([
        "-y",
        "-i",
        selectedOutputPath,
        "-t",
        String(THEME_VIDEO_RULES.targetDurationSeconds),
        "-vf",
        getVideoScaleFilter(),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "32",
        "-movflags",
        "+faststart",
        "-an",
        outputTightPath,
      ]);

      selectedOutputPath = outputTightPath;
      videoBuffer = await fs.readFile(outputTightPath);
    }

    await runFfmpeg([
      "-y",
      "-ss",
      "0.2",
      "-i",
      selectedOutputPath,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      posterPath,
    ]);

    const posterBuffer = await fs.readFile(posterPath);

    if (videoBuffer.length > THEME_VIDEO_RULES.hardMaxBytes) {
      return NextResponse.json({ error: "Optimized video still exceeds 10MB" }, { status: 400 });
    }

    let supabase: unknown;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      if (!supabaseUrl) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
      }

      supabase = createClient(supabaseUrl, serviceRoleKey);
    } else {
      supabase = await createSupabaseRouteClient();
    }

    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const videoFileName = `${userId}/theme-video-${stamp}.mp4`;
    const posterFileName = `${userId}/theme-video-poster-${stamp}.jpg`;

    const { error: videoErr } = await (supabase as any).storage
      .from("theme-backgrounds")
      .upload(videoFileName, videoBuffer, {
        upsert: true,
        contentType: "video/mp4",
        cacheControl: "31536000",
      });

    if (videoErr) {
      throw new Error(videoErr.message || "Failed to upload video");
    }

    const { error: posterErr } = await (supabase as any).storage
      .from("theme-backgrounds")
      .upload(posterFileName, posterBuffer, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });

    if (posterErr) {
      throw new Error(posterErr.message || "Failed to upload poster");
    }

    const { data: videoPublic } = (supabase as any).storage.from("theme-backgrounds").getPublicUrl(videoFileName);
    const { data: posterPublic } = (supabase as any).storage.from("theme-backgrounds").getPublicUrl(posterFileName);

    return NextResponse.json({
      videoUrl: videoPublic.publicUrl,
      posterUrl: posterPublic.publicUrl,
      duration: outputDuration,
      trimmed,
      hardMaxDuration: THEME_VIDEO_RULES.hardMaxDurationSeconds,
      targetMaxBytes: THEME_VIDEO_RULES.targetMaxBytes,
      outputBytes: videoBuffer.length,
    });
  } catch (err) {
    console.error("theme-video upload", err);
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  } finally {
    if (workingDir) {
      await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
