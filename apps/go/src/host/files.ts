import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { FileFilter, FileOutcome, FileService, PickedFile, WriteFileInput } from "@suite/go";

/**
 * Files a person can actually reach, with no third-party plugin.
 *
 * Import goes through a hidden `<input type="file">`. Inside a Capacitor WebView that
 * is not a web input at all: Chromium hands the request to Android, which opens the
 * system document picker. So the real SAF picker is the one the platform shows, and
 * there is no plugin to keep in step.
 *
 * Export goes through the share sheet for the same reason. Android has no "reveal in
 * folder" for an app's own storage, and writing silently into a directory nobody can
 * find would be worse than useless. A share sheet lets the person put the file in
 * Drive, Files, or Downloads.
 */

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  planner: "application/json",
  budget: "application/json",
  canvas: "application/json",
  json: "application/json",
  csv: "text/csv",
  qif: "application/qif",
  txt: "text/plain",
  md: "text/markdown",
};

export function mimeFor(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** A filter list as an `accept` attribute. Android honours the extension form. */
export function acceptAttribute(filters: readonly FileFilter[]): string {
  const parts: string[] = [];
  for (const filter of filters) {
    for (const extension of filter.extensions) parts.push(`.${extension}`);
  }
  return parts.join(",");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function writeToDocuments(input: WriteFileInput): Promise<{ ok: true; uri: string }> {
  const result = await Filesystem.writeFile({
    path: input.name,
    data: toBase64(input.bytes),
    directory: Directory.Documents,
    recursive: true,
  });
  return { ok: true, uri: result.uri };
}

export function createFileService(): FileService {
  return {
    async pickOpen(filters): Promise<PickedFile | null> {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = acceptAttribute(filters);
      // Not appended to the layout: a hidden input that is still in the document is
      // what Android needs to raise the picker.
      input.style.display = "none";
      document.body.append(input);

      const chosen = await new Promise<File | null>((resolve) => {
        let settled = false;
        const finish = (file: File | null) => {
          if (settled) return;
          settled = true;
          resolve(file);
        };
        input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
        // Android fires no event when the person backs out of the picker. The
        // `cancel` event covers modern WebView; the fallback keeps the promise from
        // hanging forever on an older one.
        input.addEventListener("cancel", () => finish(null), { once: true });
        window.addEventListener(
          "focus",
          () => {
            setTimeout(() => finish(input.files?.[0] ?? null), 500);
          },
          { once: true },
        );
        input.click();
      });

      input.remove();
      if (!chosen) return null;

      return {
        name: chosen.name,
        mimeType: chosen.type || mimeFor(chosen.name),
        bytes: new Uint8Array(await chosen.arrayBuffer()),
      };
    },

    write: writeToDocuments,

    async share(input): Promise<FileOutcome> {
      try {
        const written = await writeToDocuments(input);
        await Share.share({
          title: input.name,
          files: [written.uri],
        });
        return { ok: true, name: input.name };
      } catch (error) {
        // Dismissing the share sheet is not a failure worth an error message.
        const message = error instanceof Error ? error.message : String(error);
        if (/cancel/i.test(message)) return { ok: false, reason: "cancelled" };
        return { ok: false, reason: "failed", message };
      }
    },
  };
}
