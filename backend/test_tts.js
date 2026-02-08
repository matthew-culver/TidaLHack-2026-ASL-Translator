const fs = require("fs");

async function main() {
  const r = await fetch("http://localhost:3001/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hello from ElevenLabs" }),
  });

  if (!r.ok) {
    console.log("Status:", r.status);
    console.log("Body:", await r.text());
    process.exit(1);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync("out.mp3", buf);
  console.log("Wrote out.mp3", buf.length, "bytes");
}

main().catch(console.error);
