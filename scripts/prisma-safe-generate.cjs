/**
 * На Windows активный Next dev блокирует `query_engine-windows.dll.node` при `rename` → EPERM.
 * Перед `prisma generate` останавливаем процессы на порту 3000 и node с next/turbopack в этом каталоге.
 *
 * Вызывается из `npm run db:generate` и `npm run postinstall`.
 */
"use strict"

const { spawnSync } = require("child_process")
const path = require("path")

const root = path.resolve(__dirname, "..")
const rootPs = root.replace(/'/g, "''")

const isWin = process.platform === "win32"

function sleep(seconds) {
  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `Start-Sleep -Seconds ${seconds}`],
    { stdio: "ignore", shell: false },
  )
}

/** @param {number} pid */
function taskkill(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/F"], {
    stdio: "pipe",
    shell: false,
  })
}

function stopLikelyDevServerWindows() {
  const psPorts = `
$ErrorActionPreference = 'SilentlyContinue'
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { if ($_ -gt 0) { $_ } }
`

  /** @type {Set<number>} */
  const victims = new Set()

  const o1 = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psPorts], {
    encoding: "utf8",
    shell: false,
  })

  const out1 = (o1.stdout || "").trim()
  if (out1) {
    for (const ln of out1.split(/\r?\n/)) {
      const pid = Number(ln.trim())
      if (Number.isFinite(pid) && pid !== process.pid) victims.add(pid)
    }
  }

  const psNext = `
$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = '${rootPs}'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  [int]$id = $_.ProcessId
  $cmd = [string]$_.CommandLine
  if ($cmd.Length -eq 0) { return }
  if ($cmd.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return }
  $isNextCli = ($cmd -match '[/\\\\\\\\]next[/\\\\\\\\]dist[/\\\\\\\\]bin[/\\\\\\\\]next')
  $isNextCache = ($cmd -match '[/\\\\\\\\\\\\.]next[/\\\\\\\\\\\\]dev[/\\\\\\\\\\\\]')
  $isNpmDev = (($cmd -match 'npm-cli\\.js') -and ($cmd -match '\\s(run|run-script)\\s+dev(\\s|\\")'))
  if ($isNextCli -or $isNextCache -or $isNpmDev) { $id }
}
`

  const o2 = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psNext], {
    encoding: "utf8",
    shell: false,
  })

  const out2 = (o2.stdout || "").trim()
  if (out2) {
    for (const ln of out2.split(/\r?\n/)) {
      const pid = Number(ln.trim())
      if (Number.isFinite(pid) && pid !== process.pid) victims.add(pid)
    }
  }

  if (victims.size === 0) return

  for (const pid of victims) taskkill(pid)
  sleep(2)
}

if (isWin) stopLikelyDevServerWindows()

const gen = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  stdio: "inherit",
  shell: isWin,
  env: process.env,
})

process.exit(gen.status ?? 1)
