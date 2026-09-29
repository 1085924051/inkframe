import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

type ComposeInput = { projectId: string; urls: string[] };

function runFfmpeg(args: string[]): Promise<void> {
  const packagedBinary = resolve(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const binary = ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : packagedBinary;
  if (!binary) throw new Error("ffmpeg binary unavailable");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-1000)}`)));
  });
}

async function materializeUrl(url: string, directory: string, index: number): Promise<string> {
  const parsed = new URL(url, "http://inkframe.local");
  const target = join(directory, `${String(index).padStart(4, "0")}-${basename(parsed.pathname) || "shot.mp4"}`);
  if (parsed.origin === "http://inkframe.local") {
    const localPath = resolve(process.cwd(), "public", parsed.pathname.replace(/^\//, ""));
    try {
      await access(localPath);
      await writeFile(target, await readFile(localPath));
    } catch {
      if (parsed.pathname !== "/demo/shot-preview.mp4") throw new Error(`本地素材不存在：${parsed.pathname}`);
      await runFfmpeg(["-y", "-f", "lavfi", "-i", "color=c=0x38525b:s=1280x720:r=24", "-t", "1", "-an", target]);
    }
  } else {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`无法下载镜头素材：HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  return target;
}

export async function composeVideos(input: ComposeInput): Promise<string> {
  if (!input.urls.length) throw new Error("没有可合成的镜头素材");
  const directory = await mkdtemp(join(tmpdir(), "inkframe-compose-"));
  try {
    const files = await Promise.all(input.urls.map((url, index) => materializeUrl(url, directory, index)));
    const list = join(directory, "concat.txt");
    await writeFile(list, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    const outputDirectory = resolve(process.cwd(), "public", "generated");
    await mkdir(outputDirectory, { recursive: true });
    const output = join(outputDirectory, `${input.projectId}.mp4`);
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", output]);
    return `/generated/${input.projectId}.mp4`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
