const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node run-windows-powershell.cjs <powershell args>");
  process.exit(1);
}

const systemRoot = process.env.SYSTEMROOT || process.env.SystemRoot || process.env.windir || "C:\\Windows";
const powershellPath = path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

const result = spawnSync(powershellPath, args, {
  stdio: "inherit",
  windowsHide: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
