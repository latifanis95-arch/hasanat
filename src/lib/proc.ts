import { spawn } from "node:child_process";

interface RunOptions {
  cwd?: string;
  /** Affiche la sortie de la commande en direct (utile pour suivre un rendu). */
  inherit?: boolean;
  /** Renvoie la sortie d'erreur au lieu de la sortie standard (ffmpeg y écrit ses mesures). */
  stderr?: boolean;
  /** Variables d'environnement ajoutées pour cette commande. */
  env?: Record<string, string>;
}

/** FFmpeg et FFprobe : ceux du système, ou ceux indiqués dans .env (FFMPEG_PATH, FFPROBE_PATH). */
export function tool(cmd: string): string {
  if (cmd === "ffmpeg") return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  if (cmd === "ffprobe") return process.env.FFPROBE_PATH?.trim() || "ffprobe";
  return cmd;
}

export function run(cmd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = tool(cmd);
    const child = spawn(exe, args, {
      cwd: options.cwd,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT" && (cmd === "ffmpeg" || cmd === "ffprobe")) {
        reject(new Error(`${cmd} est introuvable. Installe FFmpeg (voir README, « Installation ») puis rouvre le terminal, ou indique son chemin dans .env (${cmd === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"}).`));
      } else reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(options.stderr ? stderr : stdout);
      else reject(new Error(`${cmd} a échoué (code ${code})\n${stderr.slice(-2000)}`));
    });
  });
}

/** Sonie intégrée (LUFS, norme EBU R128) : le volume perçu d'un enregistrement. */
export async function measureLoudness(file: string): Promise<number> {
  const out = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { stderr: true });
  const summary = out.slice(out.lastIndexOf("Summary:"));
  const match = /I:\s*(-?[0-9.]+) LUFS/.exec(summary);
  if (!match) throw new Error(`Mesure de volume impossible : ${file}`);
  return Number(match[1]);
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number.parseFloat(out.trim());
}
