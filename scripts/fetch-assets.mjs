import { mkdir, writeFile } from "node:fs/promises";

const assets = {
  "street-style": "photo-1524504388940-b1c1722653e1",
  ocean: "photo-1507525428034-b723cf961d3e",
  concert: "photo-1470229722913-7c0e2dbbafd3",
  roadtrip: "photo-1500530855697-b586d89ba3ee",
};
await mkdir(new URL("../public/images/", import.meta.url), { recursive: true });
for (const [name, id] of Object.entries(assets)) {
  const response = await fetch(
    `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85&fm=webp`,
  );
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  await writeFile(
    new URL(`../public/images/${name}.webp`, import.meta.url),
    Buffer.from(await response.arrayBuffer()),
  );
  console.log(`Saved ${name}.webp`);
}
