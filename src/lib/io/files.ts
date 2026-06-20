import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { formatFromName, type SubtitleFormat } from "../subtitle/types";

export interface LoadedFile {
  path: string;
  name: string;
  format: SubtitleFormat;
  content: string;
}

const SUBTITLE_EXTENSIONS = ["srt", "ass", "ssa"];

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// File reads/writes go through small custom Rust commands (see src-tauri/src/lib.rs)
// so any path the user explicitly picks works without fs-scope configuration.
function readText(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}
function writeText(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents }).then(() => undefined);
}

/** Read a subtitle file by path (used by both the dialog and drag-and-drop). */
export async function loadPath(path: string): Promise<LoadedFile | null> {
  const name = baseName(path);
  const format = formatFromName(name);
  if (!format) return null;
  const content = await readText(path);
  return { path, name, format, content };
}

/** Show the native open dialog and load the chosen subtitle. */
export async function openSubtitle(): Promise<LoadedFile | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Subtitles", extensions: SUBTITLE_EXTENSIONS }],
  });
  if (!selected || Array.isArray(selected)) return null;
  return loadPath(selected);
}

/** Suggest `name.<targetCode>.<ext>` next to the original. */
export function defaultOutputName(srcName: string, targetCode: string, format: SubtitleFormat): string {
  const dot = srcName.lastIndexOf(".");
  const stem = dot > 0 ? srcName.slice(0, dot) : srcName;
  return `${stem}.${targetCode}.${format}`;
}

/** Show the native save dialog (UTF-8) and write the file. Returns the path. */
export async function saveSubtitle(
  defaultName: string,
  content: string,
  format: SubtitleFormat,
): Promise<string | null> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Subtitles", extensions: [format] }],
  });
  if (!path) return null;
  await writeText(path, content);
  return path;
}

/** Reveal the saved file in the OS file manager (Explorer/Finder/…). */
export function revealInFolder(path: string): Promise<void> {
  return revealItemInDir(path);
}
