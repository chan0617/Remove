import { zip, type Zippable } from "fflate";

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const files: Zippable = {};
  const usedNames = new Set<string>();

  for (const entry of entries) {
    let name = entry.name;
    let counter = 1;
    while (usedNames.has(name)) {
      const base = entry.name.replace(/\.png$/i, "");
      name = `${base}-${counter}.png`;
      counter++;
    }
    usedNames.add(name);
    const buffer = await entry.blob.arrayBuffer();
    files[name] = new Uint8Array(buffer);
  }

  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => {
      if (err) reject(err);
      else resolve(new Blob([data], { type: "application/zip" }));
    });
  });
}
