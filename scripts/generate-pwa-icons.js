const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");

async function generate() {
  const svg192 = fs.readFileSync(path.join(publicDir, "icon-192.svg"));
  const svg512 = fs.readFileSync(path.join(publicDir, "icon-512.svg"));

  await sharp(svg192).png().toFile(path.join(publicDir, "icon-192.png"));
  await sharp(svg512).png().toFile(path.join(publicDir, "icon-512.png"));

  console.log("Generated icon-192.png and icon-512.png");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
