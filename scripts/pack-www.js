const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "www");

function copy(srcRel, destRel = srcRel) {
  const from = path.join(root, srcRel);
  const to = path.join(dest, destRel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "books.js",
  "sw.js",
  "manifest.webmanifest",
]) {
  copy(file);
}

copy("icons");
copy(path.join("data", "cuv.json"), path.join("data", "cuv.json"));
if (fs.existsSync(path.join(root, "data", "notes"))) {
  copy(path.join("data", "notes"), path.join("data", "notes"));
}

console.log("packed", dest);
