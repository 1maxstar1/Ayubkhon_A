# The program on one person's own Windows computer: the database is a file on
# this disk, nothing is sent anywhere, and the sign-in code never leaves the
# machine. The Windows twin of server/laptop.sh.
#
#   laptop.cmd                 start it in the background and open the browser
#   laptop.cmd autostart       ... and from now on start at every Windows sign-in
#   laptop.cmd status          is it running, which version, backups, Drive
#   laptop.cmd backup          make a copy now (kept in %USERPROFILE%\Backups\smeta)
#   laptop.cmd update          take the newest release now
#   laptop.cmd rollback        go back to the version before the last update
#   laptop.cmd rollback v2.4.0 ... or to a release by name
#   laptop.cmd autoupdate off  stop updating by itself (on: back again)
#   laptop.cmd drive           also keep every backup in Google Drive
#   laptop.cmd drive off       ... and stop doing that
#   laptop.cmd stop            stop it
#   laptop.cmd uninstall       stop, and stop starting at sign-in
#   laptop.cmd debug           run it in this window, to see why it does not start
#   laptop.cmd doctor          everything that decides the login, on one screen
#
# Nothing here needs Node or Git. The pages are the built ones already in
# dist\, the hooks are already in server\pb_hooks\, and PocketBase is one .exe
# downloaded on first run. The data lives in %LOCALAPPDATA%\Taqqoslash, outside
# this folder, so a new version never touches the price memory.
#
# Versions. The program folder (C:\Smeta) is what the installer put there, and
# an update never writes into it. A release is unpacked into a folder of its
# own, %LOCALAPPDATA%\Taqqoslash\app\<version>-<commit>, and current.txt names
# the one that runs; this file, started from C:\Smeta, hands every command to
# the launcher of that version. An update unpacks the new version beside the
# others, backs up the database, and lets the NEW version's own launcher bring
# the server up while the old one watches. Only when it has run, served its own
# version and signed in by itself for a while does current.txt change - one
# small file - so nothing half-copied can ever be what runs, and a rollback is
# that file written back. A release that does not come up is never tried again
# by itself.
#
# The hand-over between versions is a protocol every future version keeps:
# current.txt / previous.txt hold one folder name under app\ (or ROOT for the
# program folder itself), TAQ_LAUNCHER names the program folder's launcher,
# «serve trial» starts a version on approval, and «selftest» answers.
#
# Written for Windows PowerShell 5.1, which every Windows 10 and 11 has: no
# ?? or ?:, string bodies sent as UTF-8 bytes (5.1 sends Latin-1 otherwise),
# and the script's own messages kept to plain ASCII.
param([string]$Command = 'start', [string]$Arg = '')

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$OnWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($IsWindows -eq $true)
$Root      = Split-Path -Parent $PSScriptRoot
$PbVersion = '0.34.0'
$Port      = '8090'; if ($env:TAQ_PORT) { $Port = $env:TAQ_PORT }
$Url       = "http://127.0.0.1:$Port"

# TAQ_HOME, TAQ_PB and TAQ_BACKUPS exist for the test (test/laptop-windows.sh),
# which runs this under PowerShell on Linux against the Linux binary.
$AppHome = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Taqqoslash'
if ($env:TAQ_HOME) { $AppHome = $env:TAQ_HOME }
# One binary per PocketBase version, so a version that brings a newer
# PocketBase does not take the binary away from the one before it.
$PbName = 'pocketbase.exe'; if ($PbVersion -ne '0.34.0') { $PbName = "pocketbase-$PbVersion.exe" }
$Pb = Join-Path $AppHome $PbName
if ($env:TAQ_PB) { $Pb = $env:TAQ_PB }
$Backups = Join-Path (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Backups') 'smeta'
if ($env:TAQ_BACKUPS) { $Backups = $env:TAQ_BACKUPS }

$Data     = Join-Path $AppHome 'pb_data'
$Public   = Join-Path $AppHome 'pb_public'
$Settings = Join-Path $AppHome 'settings.env'
$PidFile  = Join-Path $AppHome 'server.pid'
$SupFile  = Join-Path $AppHome 'autostart.pid'
$Hooks    = Join-Path (Join-Path $Root 'server') 'pb_hooks'
$Schema   = Join-Path (Join-Path $Root 'server') 'pb_schema.json'
$Keep     = 14

# Where releases come from: one line per release, «v2.4.0 <commit>», and a
# release is the repository as it was at that commit - never whatever is on
# the branch at the moment of looking. TAQ_RELEASES (a file) and
# TAQ_RELEASE_ZIP (a folder of <commit>.zip) are for the test.
$Repo        = 'https://github.com/1maxstar1/Ayubkhon_A'
$ReleaseList = 'https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/claude/excel-price-validation-5ehbvb/server/releases.txt'
if ($env:TAQ_RELEASES) { $ReleaseList = $env:TAQ_RELEASES }
$AppsDir      = Join-Path $AppHome 'app'
$CurrentFile  = Join-Path $AppHome 'current.txt'
$PreviousFile = Join-Path $AppHome 'previous.txt'
$TrialFile    = Join-Path $AppHome 'trial.pid'
$UpdateFile   = Join-Path $AppHome 'update.env'
$LockFile     = Join-Path $AppHome 'update.lock'
$LogFile      = Join-Path $AppHome 'supervisor.log'
# How often the supervisor reads the release list (seconds), how long it waits
# between looks at the server, how soon it looks again after the network
# failed, and how long a new version must keep running before it is kept.
$CheckEvery  = 6 * 3600; if ($env:TAQ_UPDATE_EVERY) { $CheckEvery = [int]$env:TAQ_UPDATE_EVERY }
$RetryEvery  = 3600;     if ($env:TAQ_UPDATE_RETRY) { $RetryEvery = [int]$env:TAQ_UPDATE_RETRY }
$Tick        = 600;      if ($env:TAQ_TICK) { $Tick = [int]$env:TAQ_TICK }
$Settle      = 30;       if ($env:TAQ_SETTLE) { $Settle = [int]$env:TAQ_SETTLE }
$TrialWait   = 120;      if ($env:TAQ_TRIAL) { $TrialWait = [int]$env:TAQ_TRIAL }
$DriveFolder = 'Smeta zaxira'

# The launcher in the program folder - what the Startup shortcut points at.
# A version's own launcher, run from app\, is told it by the one that handed
# the command over.
$Launcher = $PSCommandPath
if ($env:TAQ_LAUNCHER) { $Launcher = $env:TAQ_LAUNCHER }
$InApp = $Root.StartsWith($AppsDir, [StringComparison]::OrdinalIgnoreCase)

# Functions that the supervisor also calls throw instead of ending the script:
# a supervisor that exits on the first failed start brings nothing back.
$script:NoDie = $false
$script:LastLog = ''

function Say([string]$t) { Write-Host $t }
function Die([string]$t) { Write-Host $t; exit 1 }
function Fail([string]$t) { if ($script:NoDie) { throw $t } else { Die $t } }

# What happened while nobody was looking - updates, failed starts - for
# «laptop.cmd status» to show. The same line twice in a row is written once.
function Log([string]$t) {
  if ($t -eq $script:LastLog) { return }
  $script:LastLog = $t
  try {
    New-Item -ItemType Directory -Force -Path $AppHome | Out-Null
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm') + '  ' + $t + "`r`n"
    [IO.File]::AppendAllText($LogFile, $line, [Text.Encoding]::UTF8)
    $all = [IO.File]::ReadAllLines($LogFile, [Text.Encoding]::UTF8)
    if ($all.Count -gt 600) { [IO.File]::WriteAllLines($LogFile, [string[]]($all | Select-Object -Last 300), [Text.Encoding]::UTF8) }
  } catch { }
}

function Startup-Link {
  if (-not $OnWindows) { return $null }
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Taqqoslash.lnk'
}
function Autostart-On {
  if ($env:TAQ_AUTOSTART) { return ($env:TAQ_AUTOSTART -eq '1') }   # the test
  $lnk = Startup-Link
  return [bool]($lnk -and (Test-Path $lnk))
}

# ------------------------------------------------------------------ settings
# KEY=value files: settings.env (the passwords, the Drive folder) and
# update.env (when it last looked, what failed). UTF-8, so a Drive folder
# called «Мой диск» survives the round trip.
function Read-Env([string]$file) {
  $s = @{}
  if (Test-Path $file) {
    foreach ($line in [IO.File]::ReadAllLines($file, [Text.Encoding]::UTF8)) {
      $i = $line.IndexOf('=')
      if ($i -gt 0) { $s[$line.Substring(0, $i)] = $line.Substring($i + 1) }
    }
  }
  return $s
}
function Write-Env([string]$file, $s, [string[]]$first) {
  $lines = @()
  foreach ($k in $first) { if ($s.ContainsKey($k)) { $lines += "$k=$($s[$k])" } }
  foreach ($k in ($s.Keys | Sort-Object)) { if ($first -notcontains $k) { $lines += "$k=$($s[$k])" } }
  Write-Atomic $file ($lines -join [Environment]::NewLine)
}
function Read-Settings { return Read-Env $Settings }
function Set-Setting([string]$k, [string]$v) {
  $s = Read-Settings
  if ($v) { $s[$k] = $v } else { $s.Remove($k) }
  Write-Env $Settings $s @('PB_ADMIN_EMAIL', 'PB_ADMIN_PASS')
}
function Set-UpdateState($pairs) {
  $s = Read-Env $UpdateFile
  foreach ($k in $pairs.Keys) {
    if ($null -eq $pairs[$k] -or $pairs[$k] -eq '') { $s.Remove($k) } else { $s[$k] = [string]$pairs[$k] }
  }
  Write-Env $UpdateFile $s @()
}

# A small file written whole or not at all: a power cut while writing leaves
# the old content, not half of the new.
function Write-Atomic([string]$file, [string]$text) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
  $tmp = $file + '.new'
  [IO.File]::WriteAllText($tmp, $text + [Environment]::NewLine, (New-Object Text.UTF8Encoding $false))
  # A reader holding the file for a moment makes the swap fail; try again.
  for ($i = 0; ; $i++) {
    try {
      if (Test-Path $file) { [IO.File]::Replace($tmp, $file, [NullString]::Value) }
      else { [IO.File]::Move($tmp, $file) }
      return
    } catch { if ($i -ge 9) { throw }; Start-Sleep -Milliseconds 200 }
  }
}

function New-Password {
  $b = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $p = [Convert]::ToBase64String($b) -replace '[^A-Za-z0-9]', ''
  return $p.Substring(0, [Math]::Min(24, $p.Length))
}

# The superuser password guards the database console on this machine. Made
# once, kept beside the database, reused on every later run. Anything else
# kept in the file (the Drive folder) is left as it is.
function Ensure-Settings([bool]$interactive) {
  New-Item -ItemType Directory -Force -Path $AppHome | Out-Null
  $s = Read-Settings
  $script:NewPass = $false
  $changed = $false
  if (-not $s['PB_ADMIN_EMAIL']) {
    $email = $env:PB_ADMIN_EMAIL
    if (-not $email -and $interactive) {
      $email = Read-Host "Ishchi elektron pochtangiz (shu bilan dasturga kirasiz)"
    }
    if (-not $email) { Die "Pochta kerak. Avval laptop.cmd ni ikki marta bosib ishga tushiring." }
    $s['PB_ADMIN_EMAIL'] = $email.Trim()
    $changed = $true
  }
  if (-not $s['PB_ADMIN_PASS']) { $s['PB_ADMIN_PASS'] = New-Password; $script:NewPass = $true; $changed = $true }
  if ($changed) { Write-Env $Settings $s @('PB_ADMIN_EMAIL', 'PB_ADMIN_PASS') }
  $script:Email = $s['PB_ADMIN_EMAIL']
  $script:Pass  = $s['PB_ADMIN_PASS']
}

# ------------------------------------------------------------------ processes
# A pid file holds the process id and its start time. Windows hands a freed id
# to the next process soon, and an id alone would make a browser tab look like
# the supervisor - to be waited for, or killed.
function Write-Pid([string]$file, $proc) {
  $p = $proc
  if ($proc -is [int]) { $p = Get-Process -Id $proc }
  $ticks = ''
  try { $ticks = [string]$p.StartTime.ToUniversalTime().Ticks } catch { }
  Write-Atomic $file ("$($p.Id) $ticks").Trim()
}
function Pid-Alive([string]$file) {
  if (-not (Test-Path $file)) { return $null }
  $line = ''
  try { $line = [string](Get-Content $file -ErrorAction Stop | Select-Object -First 1) } catch { return $null }
  $parts = @($line.Trim() -split '\s+')
  $id = 0
  if (-not [int]::TryParse($parts[0], [ref]$id)) { return $null }
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  if ($parts.Count -ge 2 -and $parts[1]) {
    try {
      $d = [Math]::Abs($p.StartTime.ToUniversalTime().Ticks - [long]$parts[1])
      if ($d -gt 20000000) { return $null }
    } catch { return $null }
  } elseif ($p.ProcessName -notmatch '^(pocketbase|powershell|pwsh|sh)') { return $null }
  return $p.Id
}
function Kill-From([string]$file) {
  $id = Pid-Alive $file
  if ($id -and $id -ne $PID) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  if (-not $id -or $id -ne $PID) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
}

# One install at a time. A lock whose process is gone, or that is an hour old,
# is free: an install never takes that long.
function Lock-Holder {
  $id = Pid-Alive $LockFile
  if (-not $id) { return $null }
  try { if ((Get-Item $LockFile).LastWriteTime -lt (Get-Date).AddHours(-1)) { return $null } } catch { }
  return $id
}
function Take-Lock {
  $id = Lock-Holder
  if ($id -and $id -ne $PID) { return $false }
  Write-Pid $LockFile $PID
  return $true
}
function Drop-Lock {
  $id = Lock-Holder
  if (-not $id -or $id -eq $PID) { Remove-Item $LockFile -Force -ErrorAction SilentlyContinue }
}
# Typed commands that stop or start the server wait for an install in
# progress instead of killing it half-way.
function Wait-Install {
  $id = Lock-Holder
  if (-not $id -or $id -eq $PID) { return }
  Say "Yangi versiya o'rnatilmoqda - tugashini kutyapman (bir necha daqiqa)..."
  for ($i = 0; $i -lt 300; $i++) {
    $id = Lock-Holder
    if (-not $id -or $id -eq $PID) { return }
    Start-Sleep -Seconds 1
  }
  Say "O'rnatish hali tugamadi - davom etyapman."
}

# ------------------------------------------------------------------ the binary
function Ensure-PocketBase {
  if (Test-Path $Pb) { return }
  $arch = 'amd64'
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
  $u = "https://github.com/pocketbase/pocketbase/releases/download/v$PbVersion/pocketbase_${PbVersion}_windows_$arch.zip"
  $zip = Join-Path $AppHome 'pocketbase.zip'
  $tmp = Join-Path $AppHome 'pocketbase-unzip'
  Say "PocketBase yuklanmoqda ($arch, bir marta)..."
  Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile $zip
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  Move-Item (Join-Path $tmp 'pocketbase.exe') $Pb -Force
  Remove-Item $zip -Force
  Remove-Item $tmp -Recurse -Force
}

# ------------------------------------------------------------------ http
function Api([string]$Method, [string]$Path, $Body, [string]$Token) {
  $h = @{}
  if ($Token) { $h['Authorization'] = $Token }
  $p = @{ Method = $Method; Uri = "$Url$Path"; Headers = $h; UseBasicParsing = $true; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $json = $Body
    if (-not ($Body -is [string])) { $json = $Body | ConvertTo-Json -Depth 20 -Compress }
    $p['Body'] = [Text.Encoding]::UTF8.GetBytes($json)
    $p['ContentType'] = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @p
}

function Answering {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Su-Token {
  $r = Api 'Post' '/api/collections/_superusers/auth-with-password' @{ identity = $script:Email; password = $script:Pass } $null
  return $r.token
}

# ------------------------------------------------------------------ the server
# Paths are quoted by hand: Windows PowerShell joins -ArgumentList with plain
# spaces, and a user folder called 'Khan Ali' would split --dir in two.
function Server-Args {
  return 'serve --http=127.0.0.1:' + $Port + ' --dir="' + $Data + '" --hooksDir="' + $Hooks + '" --publicDir="' + $Public + '"'
}

function Prepare-Public {
  New-Item -ItemType Directory -Force -Path $Data, $Public | Out-Null
  foreach ($f in @('index.html', 'admin.html')) {
    Copy-Item (Join-Path (Join-Path $Root 'dist') $f) (Join-Path $Public $f) -Force
  }
}

# What the server is told, handed to it explicitly rather than left for it to
# inherit from this window: on the one real Windows laptop the server came up
# without laptop mode and asked for an e-mail, and inheritance through
# Start-Process is the one link in that chain no test here could watch.
function Server-Env {
  $auto = '1'
  # No sign-in at all on a computer only its owner uses (owner's decision,
  # 2026-10). PB_AUTOLOGIN=0 set before running this brings the login back.
  if ($env:PB_AUTOLOGIN -eq '0') { $auto = '0' }
  return @{ PB_DEV = '1'; PB_LAPTOP = '1'; PB_AUTOLOGIN = $auto; PB_AUTOLOGIN_EMAIL = $script:Email }
}

function New-ServerStart([string]$file, [string]$arguments, [bool]$hidden) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  $psi.Arguments = $arguments
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $hidden
  $psi.WorkingDirectory = $AppHome
  $e = Server-Env
  foreach ($k in $e.Keys) { $psi.EnvironmentVariables[$k] = [string]$e[$k] }
  return $psi
}

# The server must outlive this script - the window it was started from is
# closed straight away. So it is not given this script's output to write to:
# Start-Process -RedirectStandardOutput keeps the log file at the end of a pipe
# this script holds, and the server's next line after the script has gone
# (the sign-in code, say) is written into nothing and ends it. On Windows it
# gets a hidden console of its own; «laptop.cmd debug» shows what it says.
function Start-Server {
  Prepare-Public
  if ($OnWindows) {
    # No window, no console of its own: closing this one does not reach it.
    $psi = New-ServerStart $Pb (Server-Args) $true
  } else {
    # only the test runs here: a shell holds the log files instead
    $sh = Join-Path $AppHome 'serve.sh'
    $line = 'exec "' + $Pb + '" ' + (Server-Args) + ' >"' + (Join-Path $AppHome 'server.log') + '" 2>&1 </dev/null'
    [IO.File]::WriteAllText($sh, $line + "`n")
    $psi = New-ServerStart '/bin/sh' ('"' + $sh + '"') $false
  }
  $proc = [System.Diagnostics.Process]::Start($psi)
  Write-Pid $PidFile $proc
  for ($i = 0; $i -lt 40; $i++) {
    if (Answering) { return }
    if ($proc.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  Fail "Server ishga tushmadi. Sababini ko'rish uchun:  laptop.cmd debug"
}

# The version label the page carries in its header (class="ver").
function Version-Of([string]$html) {
  $m = [regex]::Match([string]$html, 'class="ver"[^>]*>(v[0-9.]+)<')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}
function Version-In([string]$dir) {
  if (-not $dir) { return '' }
  $f = Join-Path (Join-Path $dir 'dist') 'index.html'
  if (-not (Test-Path -LiteralPath $f)) { return '' }
  return Version-Of ([IO.File]::ReadAllText($f))
}
function Local-Version { return Version-In $Root }
function Served-Version {
  try { return Version-Of (Invoke-WebRequest -UseBasicParsing -Uri "$Url/" -TimeoutSec 5).Content } catch { return '' }
}
# «v2.4.0» -> a version that compares; anything unreadable is the oldest.
function Version-Num([string]$label) {
  $m = [regex]::Match([string]$label, '(\d+)\.(\d+)\.(\d+)')
  if ($m.Success) { return [version]($m.Groups[1].Value + '.' + $m.Groups[2].Value + '.' + $m.Groups[3].Value) }
  return [version]'0.0.0'
}
function Autologin-On {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$Url/api/laptop/signin" -TimeoutSec 5
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# What a refused request said. Windows PowerShell 5.1 and PowerShell 7 hand the
# body over differently; ErrorDetails carries it in both.
# Kept to one line: PocketBase's own reason when there is one ("Not-laptop."),
# otherwise whatever the failure itself said.
function Error-Body($err) {
  $body = ''
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) { $body = $err.ErrorDetails.Message }
  if (-not $body) {
    try { $body = (New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())).ReadToEnd() } catch { }
  }
  if ($body) {
    try { $m = ($body | ConvertFrom-Json).message; if ($m) { return [string]$m } } catch { }
    return (($body -replace '\s+', ' ').Trim())
  }
  return $err.Exception.Message
}

# Is what answers on the port this version, running the way this script runs
# it? Something answering is not enough: a server left from an earlier
# attempt, or from an older version, answers just as well - and the first
# Windows install opened the browser on exactly that, an old server asking
# for an e-mail the new one no longer asks for.
function Is-Current {
  if (-not (Answering)) { return $false }
  if ((Served-Version) -ne (Local-Version)) { return $false }
  if ($env:PB_AUTOLOGIN -ne '0' -and -not (Autologin-On)) { return $false }
  return $true
}

# Whatever PocketBase holds the port, even one this script did not start.
# Nothing that is not PocketBase is touched.
function Stop-PortHolder {
  $ids = @()
  if ($OnWindows) {
    try {
      $ids = @(Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction Stop | ForEach-Object { $_.OwningProcess })
    } catch { $ids = @() }
  } elseif (Get-Command lsof -ErrorAction SilentlyContinue) {
    $ids = @(& lsof -t "-iTCP:$Port" -sTCP:LISTEN 2>$null)
  }
  foreach ($id in $ids) {
    $p = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -like 'pocketbase*') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  # Give it the time to let go of the port.
  for ($i = 0; $i -lt 20 -and (Answering); $i++) { Start-Sleep -Milliseconds 500 }
}

# The server, the process that keeps it alive, and a version on approval.
function Stop-Server {
  Kill-From $TrialFile
  Kill-From $SupFile
  Kill-From $PidFile
  Start-Sleep -Milliseconds 700
}
# Only the server - what the supervisor calls on itself.
function Stop-ServerOnly {
  Kill-From $PidFile
  Start-Sleep -Milliseconds 700
}

# Superuser, collections, and the one person's account. Same address as the
# superuser, and an administrator, so one person can both price a project and
# load the registry. Re-running is safe: the import merges and never deletes,
# and the account is only created when it is not there.
function Prepare {
  Ensure-PocketBase
  & $Pb superuser upsert $script:Email $script:Pass "--dir=$Data" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Superuser yaratilmadi (pocketbase superuser upsert)." }
}

function After-Start {
  $tok = Su-Token
  if (-not $tok) { Fail "Bazaga kirib bo'lmadi - settings.env dagi parol mos kelmayapti." }
  Api 'Put' '/api/collections/import' ([IO.File]::ReadAllText($Schema, [Text.Encoding]::UTF8)) $tok | Out-Null
  # The one person's account: there, active, and an administrator. An earlier
  # attempt may have left it as something else; a failure to create it is
  # said out loud rather than discovered as a login screen.
  $filter = [Uri]::EscapeDataString("email='" + $script:Email + "'")
  $found = Api 'Get' "/api/collections/users/records?perPage=1&filter=$filter" $null $tok
  if (-not $found.items -or @($found.items).Count -eq 0) {
    try {
      Api 'Post' '/api/collections/users/records' @{
        email = $script:Email; password = $script:Pass; passwordConfirm = $script:Pass
        name = 'Administrator'; role = 'admin'; active = $true; emailVisibility = $true
      } $tok | Out-Null
    } catch {
      Fail ("Hisob yaratilmadi (" + $script:Email + "): " + $_.Exception.Message)
    }
  } else {
    $u = @($found.items)[0]
    if ($u.role -ne 'admin' -or -not $u.active) {
      Api 'Patch' "/api/collections/users/records/$($u.id)" @{ role = 'admin'; active = $true } $tok | Out-Null
    }
  }
  Drive-AutoOn
  Backup-IfStale
}

# Up, this version, and signing in by itself. Never ends the script.
function Start-AndCheck {
  $was = $script:NoDie
  $script:NoDie = $true
  try {
    Prepare
    Start-Server
    After-Start
  } catch { Log "start failed: $($_.Exception.Message)"; return $false }
  finally { $script:NoDie = $was }
  for ($i = 0; $i -lt 30; $i++) { if (Is-Current) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}

# ------------------------------------------------------------------ Google Drive
# A backup on the same disk as the data does not survive the disk. Google
# Drive for desktop shows the Drive as a folder - G:\My Drive or G:\Мой диск
# when it streams (that drive's root holds .shortcut-targets-by-id), or
# %USERPROFILE%\My Drive when it mirrors - and whatever is put there is
# uploaded by Drive itself. So each backup is also copied there.
function DriveFS-Installed {
  if ($env:TAQ_DRIVEFS) { return ($env:TAQ_DRIVEFS -eq '1') }
  if (-not $OnWindows) { return $false }
  if (Test-Path 'HKCU:\Software\Google\DriveFS') { return $true }
  return [bool]($env:ProgramFiles -and (Test-Path (Join-Path $env:ProgramFiles 'Google\Drive File Stream')))
}
function Drive-Roots {
  $names = @('My Drive', 'Мой диск')
  $bases = @()
  if ($env:TAQ_DRIVE_ROOTS) {
    $bases = @($env:TAQ_DRIVE_ROOTS -split ';' | Where-Object { $_ })
  } else {
    try {
      foreach ($d in [IO.DriveInfo]::GetDrives()) {
        # Network drives can hang; Drive for desktop is not one.
        if ($d.DriveType -eq 'Network' -or $d.DriveType -eq 'CDRom') { continue }
        if (-not $d.IsReady) { continue }
        $r = $d.RootDirectory.FullName
        if (Test-Path -LiteralPath (Join-Path $r '.shortcut-targets-by-id')) { $bases += $r }
      }
    } catch { }
    if (DriveFS-Installed) {
      $u = [Environment]::GetFolderPath('UserProfile')
      $bases += $u
      $bases += (Join-Path $u 'Google Drive')
    }
  }
  $found = @()
  foreach ($b in $bases) {
    foreach ($n in $names) {
      $p = Join-Path $b $n
      if (Test-Path -LiteralPath $p -PathType Container) { $found += $p }
    }
  }
  return $found
}
function Drive-Copy {
  $s = Read-Settings
  return [string]$s['BACKUP_COPY']
}
# Turned on by itself the first time Drive is seen, unless turned off by hand.
function Drive-AutoOn {
  try {
    $s = Read-Settings
    if ($s['BACKUP_COPY'] -or $s['DRIVE_OFF'] -eq '1') { return }
    $roots = @(Drive-Roots)
    if ($roots.Count -eq 0) { return }
    $dir = Join-Path $roots[0] $DriveFolder
    Set-Setting 'BACKUP_COPY' $dir
    Say "Zaxiralar Google Drive'ga ham qo'yiladi: $dir"
    Log "drive: $dir"
  } catch { }
}
# Into the Drive folder under a temporary name first, so a copy cut off half
# way is never counted as a backup. Only the folder of our own is created: the
# Drive folder above it must already be there, or Drive is not running.
function Copy-ToDrive([string]$file) {
  $dir = Drive-Copy
  if (-not $dir) { return }
  try {
    $parent = Split-Path -Parent $dir
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "$parent yo'q - Google Drive ishlamayapti" }
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $dest = Join-Path $dir (Split-Path -Leaf $file)
    Copy-Item -LiteralPath $file -Destination ($dest + '.part') -Force
    Move-Item -LiteralPath ($dest + '.part') -Destination $dest -Force
    Get-ChildItem -LiteralPath $dir -Filter 'pb_*.zip' | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip $Keep | Remove-Item -Force
    Set-UpdateState @{ DRIVE_LAST = (Get-Date).ToString('yyyy-MM-dd HH:mm'); DRIVE_ERROR = '' }
    Say "Drive'dagi nusxa: $dest"
  } catch {
    Set-UpdateState @{ DRIVE_ERROR = $_.Exception.Message }
    Say "Drive'ga nusxa olinmadi: $($_.Exception.Message)"
    Log "drive copy failed: $($_.Exception.Message)"
  }
}
# The newest backup, in Drive too: Drive mounts some time after sign-in, which
# is when the day's backup is taken, so the supervisor tries again each tick.
function Sync-Drive {
  if (-not (Drive-Copy)) { Drive-AutoOn }
  if (-not (Drive-Copy)) { return }
  $last = Newest-Backup
  if (-not $last) { return }
  $dest = Join-Path (Drive-Copy) $last.Name
  if ((Test-Path -LiteralPath $dest) -and (Get-Item -LiteralPath $dest).Length -eq $last.Length) { return }
  Copy-ToDrive $last.FullName
}

# ------------------------------------------------------------------ backups
# A copy of the whole database, kept outside the data folder - a disk that
# loses the data folder loses the backups inside it too.
function Newest-Backup {
  if (-not (Test-Path $Backups)) { return $null }
  return Get-ChildItem -Path $Backups -Filter 'pb_*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
function Prune-Backups([string]$d) {
  Get-ChildItem -Path $d -Filter 'pb_*.zip' | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Keep | Remove-Item -Force
}
function Backup-Now {
  $tok = Su-Token
  Api 'Post' '/api/backups' @{} $tok | Out-Null
  $dir = Join-Path $Data 'backups'
  $newest = Get-ChildItem -Path $dir -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $newest) { throw "zaxira fayli topilmadi" }
  New-Item -ItemType Directory -Force -Path $Backups | Out-Null
  $copy = Join-Path $Backups $newest.Name
  Copy-Item $newest.FullName $copy -Force
  Prune-Backups $Backups
  Get-ChildItem -Path $dir -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  Say "zaxira: $copy"
  Copy-ToDrive $copy
}
# With the server stopped, the database folder as it is: what an update takes
# when nothing answers to make a backup through.
function Backup-Offline {
  if (-not (Test-Path $Data)) { return }
  New-Item -ItemType Directory -Force -Path $Backups | Out-Null
  $items = @(Get-ChildItem -LiteralPath $Data | Where-Object { $_.Name -ne 'backups' } | ForEach-Object { $_.FullName })
  if ($items.Count -eq 0) { return }
  $zip = Join-Path $Backups ('pb_offline_' + (Get-Date).ToString('yyyyMMddHHmmss') + '.zip')
  Compress-Archive -Path $items -DestinationPath $zip -Force
  Prune-Backups $Backups
  Say "zaxira: $zip"
  Copy-ToDrive $zip
}

# Once a day, taken at start-up - and by the supervisor while it runs - rather
# than at three in the morning: a laptop is asleep at three.
function Backup-IfStale {
  $last = Newest-Backup
  if ($last -and $last.LastWriteTime -gt (Get-Date).AddHours(-20)) { return }
  try { Backup-Now } catch { Say "zaxira olinmadi: $($_.Exception.Message)"; Log "backup failed: $($_.Exception.Message)" }
}

# ------------------------------------------------------------------ versions
# A pointer is one folder name under app\, or ROOT for the program folder.
function Read-Pointer([string]$file) {
  if (-not (Test-Path $file)) { return '' }
  try { $n = ([IO.File]::ReadAllText($file)).Trim() } catch { return '' }
  if ($n -match '^(ROOT|v[0-9.]+-[0-9A-Za-z]+)$') { return $n }
  return ''
}
function App-Dir([string]$name) {
  if (-not $name -or $name -eq 'ROOT') { return '' }
  return Join-Path $AppsDir $name
}
# A version folder that can run: its pages, and a launcher that parses.
function App-Ok([string]$name) {
  $d = App-Dir $name
  if (-not $d) { return $false }
  $ps = Join-Path (Join-Path $d 'server') 'laptop.ps1'
  if (-not (Test-Path -LiteralPath $ps) -or -not (Version-In $d)) { return $false }
  $errs = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($ps, [ref]$tokens, [ref]$errs)
  return (@($errs).Count -eq 0)
}
function This-Name {
  if ($InApp) { return (Split-Path -Leaf $Root) }
  return 'ROOT'
}
function Is-GitCheckout {
  return [bool]((Test-Path (Join-Path $Root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue))
}
# The version folder the program folder hands its commands to, or '' to run
# itself: the one current.txt names, else previous.txt; and never one older
# than the program folder itself (the installer was run again, or a newer ZIP
# unpacked over it).
function Active-App {
  if ($InApp -or (Is-GitCheckout)) { return '' }
  foreach ($f in @($CurrentFile, $PreviousFile)) {
    $n = Read-Pointer $f
    if ($n -eq 'ROOT') { return '' }
    if (App-Ok $n) {
      $d = App-Dir $n
      if ((Version-Num (Local-Version)) -gt (Version-Num (Version-In $d))) { return '' }
      return $d
    }
  }
  return ''
}
function Ps-Exe {
  try { return (Get-Process -Id $PID).Path } catch { return 'powershell.exe' }
}
# The command, run by another version's launcher in this window. Not with &:
# a native command's output inside a function is the function's result, not
# the screen. Not with -Wait either: Windows PowerShell waits for every
# process the command starts, and an update starts the next supervisor.
function Run-In([string]$dir, [string]$cmd, [string]$a) {
  $env:TAQ_LAUNCHER = $Launcher
  $ps = Join-Path (Join-Path $dir 'server') 'laptop.ps1'
  $argLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $ps + '" ' + $cmd
  if ($a) { $argLine += ' "' + $a + '"' }
  $p = Start-Process -FilePath (Ps-Exe) -ArgumentList $argLine -NoNewWindow -PassThru
  $null = $p.Handle   # without it Windows PowerShell forgets the exit code
  $p.WaitForExit()
  return [int]$p.ExitCode
}
# A launcher started hidden, in the background: the supervisor, or a version
# on approval.
function Start-Hidden([string]$ps, [string]$cmdArgs) {
  $env:TAQ_LAUNCHER = $Launcher
  $a = '-NoProfile -ExecutionPolicy Bypass -File "' + $ps + '" ' + $cmdArgs
  if ($OnWindows) {
    Start-Process -FilePath (Ps-Exe) -ArgumentList ('-WindowStyle Hidden ' + $a) -WindowStyle Hidden | Out-Null
  } else {
    # the test: not on the end of the pipe of whoever called this
    Start-Process -FilePath (Ps-Exe) -ArgumentList $a -RedirectStandardOutput '/dev/null' -RedirectStandardError (Join-Path $AppHome 'supervisor.err') | Out-Null
  }
}
# The supervisor, through the program folder's launcher: it runs whichever
# version current.txt names.
function Start-Supervisor([string]$how) {
  Start-Hidden $Launcher ('serve ' + $how)
}
function Wait-Supervisor {
  for ($i = 0; $i -lt 60; $i++) { if ((Pid-Alive $SupFile) -and (Answering)) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}

function Read-Releases {
  $text = ''
  if ($ReleaseList -match '^https?://') { $text = [string](Invoke-WebRequest -UseBasicParsing -Uri $ReleaseList -TimeoutSec 30).Content }
  else { $text = [IO.File]::ReadAllText($ReleaseList) }
  $list = @()
  foreach ($line in ($text -split "`n")) {
    $m = [regex]::Match($line, '^\s*v(\d+\.\d+\.\d+)\s+([0-9a-fA-F]{7,40})\b')
    if ($m.Success -and -not ($list | Where-Object { $_.Tag -eq ('v' + $m.Groups[1].Value) })) {
      $sha = $m.Groups[2].Value.ToLower()
      $list += [pscustomobject]@{ Tag = 'v' + $m.Groups[1].Value; Num = [version]$m.Groups[1].Value; Sha = $sha
        Name = 'v' + $m.Groups[1].Value + '-' + $sha.Substring(0, [Math]::Min(12, $sha.Length)) }
    }
  }
  return @($list | Sort-Object Num)
}
# A release that failed is remembered by version AND commit: the same version
# listed again with a corrected commit is a different attempt.
function Fail-Key($rel) { return $rel.Tag + '@' + $rel.Sha.Substring(0, [Math]::Min(12, $rel.Sha.Length)) }
function Name-Key([string]$name) { return ($name -replace '^(v[0-9.]+)-', '$1@') }
function Failed-Keys {
  $s = Read-Env $UpdateFile
  return @(([string]$s['FAILED']) -split ',' | Where-Object { $_ })
}
function Add-Failed([string]$key) {
  if (-not $key -or $key -eq 'ROOT') { return }
  $f = @(Failed-Keys)
  if ($f -notcontains $key) { $f += $key }
  Set-UpdateState @{ FAILED = ($f -join ',') }
}
# The newest release this computer would take by itself, or $null.
function Newer-Release([bool]$skipFailed) {
  $have = Version-Num (Local-Version)
  $failed = @(Failed-Keys)
  $best = $null
  foreach ($r in @(Read-Releases)) {
    if ($r.Num -le $have) { continue }
    if ($skipFailed -and $failed -contains (Fail-Key $r)) { continue }
    $best = $r
  }
  return $best
}

# Is the unpacked folder really this release of this program, and does its
# launcher at least read and answer? The real test - running it - comes after.
function Check-Release([string]$dir, [string]$tag) {
  $v = Version-In $dir
  if ($v -ne $tag) { return "ichidagi versiya '$v', kutilgani $tag" }
  $server = Join-Path $dir 'server'
  foreach ($f in @((Join-Path $server 'laptop.ps1'), (Join-Path $server 'pb_schema.json'), (Join-Path $server 'pb_hooks'),
                   (Join-Path (Join-Path $dir 'dist') 'admin.html'))) {
    if (-not (Test-Path -LiteralPath $f)) { return "$(Split-Path -Leaf $f) yo'q" }
  }
  $errs = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $server 'laptop.ps1'), [ref]$tokens, [ref]$errs)
  if ($errs -and @($errs).Count -gt 0) { return "laptop.ps1 o'qilmaydi: $(@($errs)[0].Message)" }
  $out = ''
  try { $out = [string](& (Ps-Exe) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $server 'laptop.ps1') selftest 2>&1) } catch { $out = $_.Exception.Message }
  if ($out -notmatch "selftest ok $([regex]::Escape($tag))") { return "laptop.ps1 javob bermadi: $(($out -replace '\s+', ' ').Trim())" }
  return ''
}

# The release, unpacked into app\<version>-<commit>. Returns the folder, or
# throws with why not; $script:Refused says whether trying again could help.
function Fetch-Release($rel) {
  $script:Refused = $false
  New-Item -ItemType Directory -Force -Path $AppsDir | Out-Null
  $tmp = Join-Path $AppsDir ('.tmp-' + $PID)
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp 'release.zip'
    if ($env:TAQ_RELEASE_ZIP) { Copy-Item (Join-Path $env:TAQ_RELEASE_ZIP "$($rel.Sha).zip") $zip -Force }
    else { Invoke-WebRequest -UseBasicParsing -Uri "$Repo/archive/$($rel.Sha).zip" -OutFile $zip -TimeoutSec 300 }
    $x = Join-Path $tmp 'x'
    Expand-Archive -Path $zip -DestinationPath $x -Force
    # GitHub puts everything inside one folder named after the commit.
    $top = Get-ChildItem -LiteralPath $x -Directory | Select-Object -First 1
    if (-not $top) { $script:Refused = $true; throw "arxiv bo'sh" }
    $why = Check-Release $top.FullName $rel.Tag
    if ($why) { $script:Refused = $true; throw $why }
    $dir = Join-Path $AppsDir $rel.Name
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    Move-Item -LiteralPath $top.FullName -Destination $dir
    return $dir
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Folders of versions that are neither current nor previous, and leftovers of
# installs that were cut off, go.
function Prune-Apps {
  if (-not (Test-Path $AppsDir)) { return }
  $keep = @((Read-Pointer $CurrentFile), (Read-Pointer $PreviousFile), (This-Name))
  foreach ($d in Get-ChildItem -LiteralPath $AppsDir -Directory -Force) {
    if ($keep -contains $d.Name) { continue }
    if ($d.Name -like '.tmp-*' -and $d.Name -eq ('.tmp-' + $PID)) { continue }
    Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# The new version runs - its own launcher, its own pages and hooks - while
# this one watches. It is kept only when its launcher stays up, the server
# answers with its version, and the page signs in by itself, for $Settle
# seconds on end.
function Trial([string]$dir, [string]$tag) {
  Kill-From $TrialFile
  Stop-ServerOnly
  Stop-PortHolder
  if (Answering) { Log "trial $tag : the port is held by something else"; return $false }
  Start-Hidden (Join-Path (Join-Path $dir 'server') 'laptop.ps1') 'serve trial'
  $good = $null
  for ($i = 0; $i -lt ($TrialWait + $Settle); $i++) {
    Start-Sleep -Seconds 1
    $up = (Pid-Alive $TrialFile) -and ((Served-Version) -eq $tag) -and ($env:PB_AUTOLOGIN -eq '0' -or (Autologin-On))
    if (-not $up) {
      $good = $null
      if ($i -gt 10 -and -not (Pid-Alive $TrialFile)) { break }
      continue
    }
    if (-not $good) { $good = Get-Date }
    if (((Get-Date) - $good).TotalSeconds -ge $Settle) { return $true }
  }
  return $false
}
# The version on approval is told it is the one now (current.txt names it),
# takes over the supervisor's file, and this process can go.
function Promote([string]$name, [string]$tag) {
  $prev = This-Name
  Write-Atomic $PreviousFile $prev
  Write-Atomic $CurrentFile $name
  for ($i = 0; $i -lt 60; $i++) {
    $sup = Pid-Alive $SupFile
    if ($sup -and $sup -ne $PID -and -not (Pid-Alive $TrialFile)) { return $true }
    Start-Sleep -Seconds 1
  }
  # It never took over: the pointers go back before anything starts from them.
  Write-Atomic $CurrentFile $prev
  Remove-Item $PreviousFile -Force -ErrorAction SilentlyContinue
  return $false
}

# Download, check, back up, run the new version on approval, and switch to it
# only if it proves itself. This version's files are never touched. Returns
# '' or why not.
function Install-Release($rel, [bool]$supervised) {
  if (-not (Take-Lock)) { Log "update $($rel.Tag): another install holds the lock"; return "boshqa o'rnatish ketyapti" }
  try { return (Install-Locked $rel $supervised) } finally { Drop-Lock }
}
function Install-Locked($rel, [bool]$supervised) {
  $from = Local-Version
  $hadSup = [bool](Pid-Alive $SupFile)
  Say "Yuklanmoqda: $($rel.Tag)..."
  Log "update $from -> $($rel.Tag): download"
  try { $dir = Fetch-Release $rel } catch {
    $msg = $_.Exception.Message
    if ($script:Refused) { Add-Failed (Fail-Key $rel); Log "update $($rel.Tag) refused: $msg"; return "$($rel.Tag) o'rnatilmaydi: $msg" }
    Log "update $($rel.Tag): download failed: $msg"
    return "$($rel.Tag) yuklab olinmadi: $msg"
  }
  try {
    if (Answering) { Backup-Now } else { Backup-Offline }
  } catch {
    Log "update $($rel.Tag): no backup, not updating: $($_.Exception.Message)"
    return "zaxira olinmadi, yangilanmadi: $($_.Exception.Message)"
  }
  if (-not $supervised) { Kill-From $SupFile }
  Say "Yangi versiya sinab ko'rilmoqda: $($rel.Tag)..."
  if ((Trial $dir $rel.Tag) -and (Promote $rel.Name $rel.Tag)) {
    Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $from -> $($rel.Tag)"); AVAILABLE = ''; WAITING_FOR = ''; WAITING_SINCE = ''; WAITING_SHA = '' }
    Log "update $from -> $($rel.Tag): ok"
    Prune-Apps
    return ''
  }
  # It did not prove itself: it goes, and this version - never stopped being
  # the one current.txt names - comes back.
  Log "update $($rel.Tag) did not prove itself - back to $from"
  Add-Failed (Fail-Key $rel)
  Kill-From $TrialFile
  Stop-ServerOnly
  Stop-PortHolder
  $back = Start-AndCheck
  if (-not $supervised -and ($hadSup -or (Autostart-On))) { Start-Supervisor 'resumed'; [void](Wait-Supervisor) }
  Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
  if ($back) {
    Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $($rel.Tag) ishga tushmadi, $from qoldi") }
    return "$($rel.Tag) ishga tushmadi - $from da qoldi"
  }
  Log "$from did not come back either"
  Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $($rel.Tag) ishga tushmadi, $from ham ishga tushmadi") }
  return "$($rel.Tag) ishga tushmadi va $from ham ishga tushmadi - laptop.cmd doctor ni ishga tushirib, natijasini yuboring"
}

# How long nobody has touched the keyboard or mouse, in seconds; -1 when this
# cannot be known.
function Idle-Seconds {
  if ($env:TAQ_IDLE_SECONDS) { return [int]$env:TAQ_IDLE_SECONDS }
  if (-not $OnWindows) { return -1 }
  try {
    if (-not ('TaqIdle' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TaqIdle {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint Seconds() {
    LASTINPUTINFO i = new LASTINPUTINFO();
    i.cbSize = (uint)Marshal.SizeOf(i);
    if (!GetLastInputInfo(ref i)) return 0;
    return ((uint)Environment.TickCount - i.dwTime) / 1000;
  }
}
'@
    }
    return [int][TaqIdle]::Seconds()
  } catch { return -1 }
}
# When the supervisor may restart the server for an update: at sign-in, or
# when nobody has used the computer for 20 minutes. A release that has waited
# three days goes in after 5 quiet minutes. Without a way to know (not
# Windows), out of hours.
function May-Restart([bool]$justStarted, [double]$waitedHours) {
  if ($env:TAQ_UPDATE_ANYTIME -eq '1') { return $true }
  if ($justStarted) { return $true }
  $idle = Idle-Seconds
  if ($idle -ge 0) {
    if ($idle -ge 1200) { return $true }
    return ($waitedHours -ge 72 -and $idle -ge 300)
  }
  $h = (Get-Date).Hour
  return ($h -ge 21 -or $h -lt 7 -or $waitedHours -ge 72)
}

function Update-IfDue([bool]$justStarted) {
  $s = Read-Settings
  if ($s['AUTO_UPDATE'] -eq '0') { return }
  if ((Is-GitCheckout) -and -not $InApp) { return }
  $u = Read-Env $UpdateFile
  $now = Get-Date
  $due = $true
  if ($u['NEXT_CHECK'] -and -not $justStarted) {
    try { $due = ([datetime]::Parse($u['NEXT_CHECK'], [Globalization.CultureInfo]::InvariantCulture) -le $now) } catch { }
  }
  $rel = $null
  if ($due) {
    try { $rel = Newer-Release $true } catch {
      Set-UpdateState @{ LAST_CHECK = $now.ToString('yyyy-MM-dd HH:mm'); CHECK_ERROR = $_.Exception.Message
        NEXT_CHECK = $now.AddSeconds($RetryEvery).ToString('s') }
      return
    }
    $latest = ''
    if ($rel) { $latest = $rel.Tag }
    Set-UpdateState @{ LAST_CHECK = $now.ToString('yyyy-MM-dd HH:mm'); CHECK_ERROR = ''; AVAILABLE = $latest
      NEXT_CHECK = $now.AddSeconds($CheckEvery).ToString('s') }
    if ($rel) { Set-UpdateState @{ WAITING_SHA = $rel.Sha } }
  } elseif ($u['AVAILABLE'] -and $u['WAITING_SHA']) {
    # A release found earlier and waiting for a quiet moment: no need to read
    # the list again for it.
    $m = [regex]::Match($u['AVAILABLE'], '^v(\d+\.\d+\.\d+)$')
    if ($m.Success) {
      $sha = $u['WAITING_SHA']
      $rel = [pscustomobject]@{ Tag = $u['AVAILABLE']; Num = [version]$m.Groups[1].Value; Sha = $sha
        Name = $u['AVAILABLE'] + '-' + $sha.Substring(0, [Math]::Min(12, $sha.Length)) }
      if ($rel.Num -le (Version-Num (Local-Version)) -or (Failed-Keys) -contains (Fail-Key $rel)) { $rel = $null }
    }
  }
  if (-not $rel) { return }
  if ($u['WAITING_FOR'] -ne $rel.Tag -or -not $u['WAITING_SINCE']) {
    Set-UpdateState @{ WAITING_FOR = $rel.Tag; WAITING_SINCE = $now.ToString('s') }
    $u = Read-Env $UpdateFile
  }
  $waited = 0
  try { $waited = ($now - [datetime]::Parse($u['WAITING_SINCE'], [Globalization.CultureInfo]::InvariantCulture)).TotalHours } catch { }
  if (-not (May-Restart $justStarted $waited)) { return }
  $why = Install-Release $rel $true
  if (-not $why) { exit 0 }
}

# A version that ran when it was installed but cannot start now - three
# attempts in a row - is left for the one before it, by itself, within a week
# of the switch.
function Recover-Previous {
  if (-not $InApp) { return $false }
  $prev = Read-Pointer $PreviousFile
  if (-not $prev) { return $false }
  if ($prev -ne 'ROOT' -and -not (App-Ok $prev)) { return $false }
  try { if ((Get-Item $CurrentFile).LastWriteTime -lt (Get-Date).AddDays(-7)) { return $false } } catch { return $false }
  Log "$(Local-Version) does not start - back to $prev"
  Add-Failed (Name-Key (This-Name))
  Write-Atomic $CurrentFile $prev
  Remove-Item $PreviousFile -Force -ErrorAction SilentlyContinue
  Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $(Local-Version) ishga tushmay qoldi, oldingisi qaytarildi") }
  Start-Supervisor 'resumed'
  return $true
}

function Banner {
  Say ""
  Say "-------------------------------------------------------------"
  Say "  Dastur:        $Url/   (versiya $(Local-Version))"
  Say "  Admin sahifa:  $Url/admin.html"
  Say "  Baza paneli:   $Url/_/     (parol: $Settings)"
  Say ""
  Say "  Kirish oynasi yo'q - sahifa ochilishi bilan ichkaridasiz."
  Say "  Hisob: $($script:Email) (administrator)"
  Say ""
  Say "  Ma'lumot shu yerda:  $Data"
  Say "  Zaxiralar:           $Backups"
  $copy = Drive-Copy
  if ($copy) { Say "  Google Drive'da:     $copy" }
  Say "-------------------------------------------------------------"
  if ($script:NewPass) { Say ""; Say "  Baza paneli uchun parol yaratildi: $Settings" }
}

function Open-Browser { if ($OnWindows) { Start-Process "$Url/" } }

# ------------------------------------------------------------------ hand-over
# Started from the program folder, every command except the two that must
# work when the version itself is broken - stop and rollback - goes to the
# launcher of the version current.txt names.
if (-not $InApp -and $Command -ne 'stop' -and $Command -ne 'rollback' -and $Command -ne 'selftest') {
  $active = Active-App
  if ($active) { exit (Run-In $active $Command $Arg) }
}

# ------------------------------------------------------------------ commands
switch ($Command) {
  # What a version about to be installed is asked first: it reads and runs.
  'selftest' { Say "selftest ok $(Local-Version)"; exit 0 }

  'start' {
    Wait-Install
    if ((Is-Current) -and ((Pid-Alive $SupFile) -or -not (Autostart-On))) { Say "Allaqachon ishlayapti: $Url/"; Open-Browser; break }
    Ensure-Settings $true
    if (Autostart-On) {
      # Set to start at sign-in: started the same way, under its supervisor,
      # rather than as a server nobody watches until the next sign-in.
      Stop-Server
      Stop-PortHolder
      Start-Supervisor 'resumed'
      if (-not (Wait-Supervisor)) { Die "Ishga tushmadi. Sababini ko'rish uchun:  laptop.cmd debug" }
    } else {
      if (Answering) {
        Say "Eski server topildi ($(Served-Version)) - $(Local-Version) bilan almashtirilmoqda..."
        Stop-Server
        Stop-PortHolder
        if (Answering) { Die "$Port-port boshqa dastur tomonidan band. Uni yoping yoki kompyuterni qayta yoqing." }
      }
      Prepare
      Start-Server
      After-Start
    }
    Banner
    Say ""
    Say "  Server fonda ishlayapti - bu oynani yopsangiz ham ishlayveradi."
    Say "  To'xtatish: laptop.cmd stop"
    Open-Browser
  }

  # What the sign-in shortcut runs («serve»), what an update or a command
  # starts («serve resumed»), and a version on approval («serve trial»): no
  # browser, no banner, and it stays alive so it can bring the server back if
  # it ever stops, take the daily backup, keep Drive's copy, and install a new
  # release.
  'serve' {
    $script:NoDie = $true
    Ensure-Settings $false
    $trial = ($Arg -eq 'trial')
    $first = ($Arg -ne 'resumed' -and -not $trial)
    if ($trial) { Write-Pid $TrialFile $PID; Log "on approval: $(Local-Version)" }
    else { Write-Pid $SupFile $PID; Log "supervisor started ($(Local-Version))" }
    $fails = 0
    $began = Get-Date
    while ($true) {
      if ($trial) {
        # Approved: current.txt names this version. Not approved within a
        # quarter of an hour: whoever started this has gone, and so does this.
        if ((Read-Pointer $CurrentFile) -eq (This-Name)) {
          Write-Pid $SupFile $PID
          Remove-Item $TrialFile -Force -ErrorAction SilentlyContinue
          $trial = $false
          Log "supervisor started ($(Local-Version), after the update)"
        } elseif (((Get-Date) - $began).TotalMinutes -gt 15) { exit 0 }
      }
      if (-not (Answering)) {
        $ok = $true
        try { Prepare; Start-Server; After-Start } catch { $ok = $false; Log "start failed: $($_.Exception.Message)" }
        if ($ok) { $fails = 0 } else {
          $fails++
          if (-not $trial -and $fails -ge 3 -and (Recover-Previous)) { exit 0 }
          Start-Sleep -Seconds ([Math]::Min(300, 10 * [Math]::Pow(2, [Math]::Min($fails - 1, 5))))
          continue
        }
      }
      if ($trial) { Start-Sleep -Seconds 1; continue }
      try { Backup-IfStale } catch { }
      try { Sync-Drive } catch { }
      try { Update-IfDue $first } catch { Log "update check failed: $($_.Exception.Message)" }
      $first = $false
      $id = Pid-Alive $PidFile
      if ($id) { try { [void](Get-Process -Id $id).WaitForExit($Tick * 1000) } catch { } }
      else { Start-Sleep -Seconds ([Math]::Min(60, $Tick)) }
      Start-Sleep -Seconds 1
    }
  }

  'autostart' {
    if (-not $OnWindows) { Die "autostart faqat Windows'da (Mac'da: sh server/laptop.sh autostart)" }
    Wait-Install
    Ensure-Settings $true
    Prepare
    $lnk = Startup-Link
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Launcher + '" serve'
    $sc.WorkingDirectory = (Split-Path -Parent (Split-Path -Parent $Launcher))
    $sc.WindowStyle = 7
    $sc.Description = 'Taqqoslash jadvali - mahalliy server'
    $sc.Save()
    if (-not (Is-Current) -or -not (Pid-Alive $SupFile)) {
      Stop-Server
      Stop-PortHolder
      Start-Supervisor 'resumed'
      [void](Wait-Supervisor)
    }
    if (-not (Answering)) { Die "Ishga tushmadi. Sababini ko'rish uchun:  laptop.cmd debug" }
    Banner
    Say ""
    Say "  Endi Windows'ga kirganingizda o'zi ishga tushadi va yangi versiyalarni"
    Say "  o'zi o'rnatadi (o'chirish: laptop.cmd autoupdate off)."
    Say "  Bekor qilish:  laptop.cmd uninstall"
    Open-Browser
  }

  # The server in this window, saying everything it says - for when «start»
  # reports that it did not come up. Ctrl+C stops it.
  'debug' {
    Wait-Install
    Ensure-Settings $true
    if (Answering) { Say "Avval to'xtating:  laptop.cmd stop"; exit 1 }
    Prepare
    Prepare-Public
    Say "Server shu oynada ishlayapti, hamma xabarlari ko'rinadi. To'xtatish: Ctrl+C"
    $p = [System.Diagnostics.Process]::Start((New-ServerStart $Pb (Server-Args) $false))
    $p.WaitForExit()
  }

  # Everything that decides whether the page opens without a login, in one
  # screenful that can be copied back - for when it does not.
  'doctor' {
    Wait-Install
    $s = Read-Settings
    $script:Email = $s['PB_ADMIN_EMAIL']; $script:Pass = $s['PB_ADMIN_PASS']
    Say "=== Tashxis ==="
    Say "Dastur papkasi:  $Root  (versiya $(Local-Version))"
    if ($InApp) { Say "Boshlovchi:      $Launcher" }
    Say "Ma'lumot:        $Data"
    Say "PocketBase:      $Pb  (bor: $(Test-Path $Pb))"
    Say "Hisob:           $($script:Email)"
    $ok = $false
    if (Answering) {
      Say "Portda server:   bor, versiya $(Served-Version)"
      if ($OnWindows) {
        try {
          foreach ($c in @(Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction Stop)) {
            $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($p) { Say ("  jarayon:       {0} (pid {1}) {2}" -f $p.ProcessName, $p.Id, $p.Path) }
          }
        } catch { }
      }
      try {
        Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$Url/api/laptop/signin" -TimeoutSec 5 | Out-Null
        Say "Avtomatik kirish: ISHLAYAPTI"
        $ok = $true
      } catch {
        $why = Error-Body $_
        Say "Avtomatik kirish: ISHLAMAYAPTI - $why"
      }
      if ($script:Email -and $script:Pass) {
        try {
          $tok = Su-Token
          $f = [Uri]::EscapeDataString("email='" + $script:Email + "'")
          $u = @((Api 'Get' "/api/collections/users/records?perPage=1&filter=$f" $null $tok).items)
          if ($u.Count) { Say "Hisob bazada:    bor, rol $($u[0].role), faol $($u[0].active)" } else { Say "Hisob bazada:    YO'Q" }
        } catch { Say "Hisob bazada:    tekshirib bo'lmadi - $($_.Exception.Message)" }
      }
    } else { Say "Portda server:   yo'q" }

    if ($ok) {
      Say ""
      Say "Server tomoni to'g'ri. Brauzerdagi barcha 'Smeta' varaqlarini yoping,"
      Say "$Url/ ni oching va Ctrl+F5 bosing."
      Say "Yana kirish oynasi chiqsa - undagi qizil yozuvni yuboring."
      break
    }

    # Not working: run it once here, where everything it says can be seen.
    Say ""
    Say "=== Sinov: server 8 soniya shu yerda ishga tushiriladi ==="
    Ensure-Settings $false
    Stop-Server
    Stop-PortHolder
    Prepare
    Prepare-Public
    $psi = New-ServerStart $Pb (Server-Args) $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    for ($i = 0; $i -lt 16 -and -not (Answering); $i++) { Start-Sleep -Milliseconds 500 }
    try {
      Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$Url/api/laptop/signin" -TimeoutSec 5 | Out-Null
      Say "Sinovda avtomatik kirish: ISHLAYAPTI"
    } catch {
      $why = Error-Body $_
      Say "Sinovda avtomatik kirish: ISHLAMAYAPTI - $why"
    }
    if (-not $p.HasExited) { $p.Kill() }
    $p.WaitForExit()
    Say "--- server xabarlari ---"
    (($outTask.Result + $errTask.Result) -split "`n") | Select-Object -Last 25 | ForEach-Object { Say "  $_" }
    Say "------------------------"
    Start-Sleep -Milliseconds 700
    if (Autostart-On) { Start-Supervisor 'resumed'; [void](Wait-Supervisor) }
    else { Start-Server; After-Start }
    Say "Server qayta ishga tushirildi. Shu oynadagi hamma yozuvni yuboring."
  }

  'stop' {
    Wait-Install
    Stop-Server
    if (Answering) { Say "Hali ham javob beryapti - boshqa dastur 8090 portni egallagan bo'lishi mumkin." }
    else { Say "To'xtatildi." }
  }

  'status' {
    if (Answering) {
      Say "Ishlayapti: $Url/"
      $sv = Served-Version; $lv = Local-Version
      if ($sv -eq $lv) { Say "Versiya: $sv" } else { Say "Versiya: $sv ishlayapti, kerakligi $lv - almashtirish uchun: laptop.cmd start" }
      if (Autologin-On) { Say "Kirish oynasisiz: ha" } else { Say "Kirish oynasisiz: yo'q (kirish oynasi chiqadi)" }
    } else { Say "Ishlamayapti" }
    $sup = Pid-Alive $SupFile
    if (Autostart-On) {
      if ($sup) { Say "Windows'ga kirganda o'zi ishga tushadi (kuzatuvchi ishlayapti)" }
      else { Say "Windows'ga kirganda o'zi ishga tushadi (kuzatuvchi hozir ishlamayapti - laptop.cmd start)" }
    }
    $s = Read-Settings
    $u = Read-Env $UpdateFile
    if ((Is-GitCheckout) -and -not $InApp) { Say "Yangilanish: git papkasi - qo'lda (laptop.cmd update)" }
    elseif ($s['AUTO_UPDATE'] -eq '0') { Say "Avtomatik yangilanish: o'chirilgan (yoqish: laptop.cmd autoupdate on)" }
    elseif (-not $sup) { Say "Avtomatik yangilanish: kuzatuvchi ishlamayapti - hozir o'zi yangilanmaydi (laptop.cmd autostart)" }
    else { Say "Avtomatik yangilanish: yoqilgan (har $([int]($CheckEvery / 3600)) soatda tekshiradi)" }
    if ($u['LAST_CHECK']) {
      $line = "  oxirgi tekshiruv: $($u['LAST_CHECK'])"
      if ($u['CHECK_ERROR']) { $line += " - xato: $($u['CHECK_ERROR'])" }
      elseif ($u['AVAILABLE']) { $line += " - yangi versiya bor: $($u['AVAILABLE']) (o'rnatish uchun kompyuter 20 daqiqa bo'sh turishini kutadi)" }
      else { $line += " - eng yangisi o'rnatilgan" }
      Say $line
    }
    if ($u['LAST_UPDATE']) { Say "  oxirgi yangilanish: $($u['LAST_UPDATE'])" }
    if ($u['FAILED']) { Say "  o'zi qayta urinmaydi: $($u['FAILED'])" }
    $prev = Read-Pointer $PreviousFile
    if ($prev -eq 'ROOT') { Say "  oldingi versiya: $(Version-In (Split-Path -Parent (Split-Path -Parent $Launcher))) (qaytarish: laptop.cmd rollback)" }
    elseif ($prev -and (App-Ok $prev)) { Say "  oldingi versiya: $(Version-In (App-Dir $prev)) (qaytarish: laptop.cmd rollback)" }
    if (Lock-Holder) { Say "  hozir yangi versiya o'rnatilyapti" }
    if (Test-Path $Data) {
      $mb = (Get-ChildItem $Data -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
      Say ("Ma'lumot: {0:N1} MB  ({1})" -f $mb, $Data)
    }
    $all = @()
    if (Test-Path $Backups) { $all = @(Get-ChildItem -Path $Backups -Filter 'pb_*.zip' | Sort-Object LastWriteTime -Descending) }
    if ($all.Count) { Say "Zaxira: $($all.Count) ta, oxirgisi $($all[0].Name)" } else { Say "Zaxira: hali yo'q" }
    $copy = $s['BACKUP_COPY']
    if ($copy) {
      $files = @()
      if (Test-Path -LiteralPath $copy) { $files = @(Get-ChildItem -LiteralPath $copy -Filter 'pb_*.zip' | Sort-Object LastWriteTime -Descending) }
      $line = "Google Drive'da: $($files.Count) ta ($copy)"
      if ($files.Count) {
        $line += ", oxirgisi $($files[0].LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
        if ($files[0].LastWriteTime -lt (Get-Date).AddDays(-2)) { $line += " - ESKI: Google Drive ishlayaptimi?" }
      }
      Say $line
      if ($u['DRIVE_ERROR']) { Say "  oxirgi xato: $($u['DRIVE_ERROR'])" }
    } else { Say "Google Drive'da: yo'q (yoqish: laptop.cmd drive)" }
  }

  'backup' {
    Ensure-Settings $false
    $started = $false
    if (-not (Answering)) { Prepare; Start-Server; $started = $true }
    Backup-Now
    if ($started) { Stop-ServerOnly }
  }

  # The newest release, now, even one that failed before. A git checkout - a
  # developer's copy - is pulled instead.
  'update' {
    if ((Is-GitCheckout) -and -not $InApp) {
      & git -C $Root pull --ff-only
      if ($LASTEXITCODE -ne 0) { Die "git pull o'tmadi" }
      Ensure-Settings $false
      $wasAuto = (Autostart-On) -or [bool](Pid-Alive $SupFile)
      Stop-Server
      Stop-PortHolder
      if ($wasAuto) { Start-Supervisor 'resumed'; [void](Wait-Supervisor) }
      else { Prepare; Start-Server; After-Start }
      Say "Yangilandi - brauzerda Ctrl+Shift+R bosing."
      break
    }
    Wait-Install
    Ensure-Settings $false
    try { $rel = Newer-Release $false } catch { Die "Relizlar ro'yxatini olib bo'lmadi: $($_.Exception.Message)" }
    if (-not $rel) { Say "Eng yangi versiya o'rnatilgan: $(Local-Version)"; break }
    $why = Install-Release $rel $false
    if ($why) { Die $why }
    Say "Yangilandi: $($rel.Tag) - brauzerda Ctrl+Shift+R bosing."
  }

  # Back to the version before the last update, or to a release by name.
  # Handled by whichever launcher is asked - the program folder's too - so it
  # works when the newer version itself is what is broken. What was running
  # is not installed again by itself.
  'rollback' {
    if ((Is-GitCheckout) -and -not $InApp) { Die "Bu git papkasi: eski versiyaga git checkout bilan qayting." }
    Wait-Install
    Ensure-Settings $false
    $cur = Read-Pointer $CurrentFile
    $curLabel = Local-Version
    if ($cur -and $cur -ne 'ROOT' -and (App-Ok $cur)) { $curLabel = Version-In (App-Dir $cur) }
    if ($Arg) {
      $tag = $Arg.Trim(); if ($tag -notlike 'v*') { $tag = 'v' + $tag }
      try { $all = @(Read-Releases) } catch { Die "Relizlar ro'yxatini olib bo'lmadi: $($_.Exception.Message)" }
      $rel = $all | Where-Object { $_.Tag -eq $tag } | Select-Object -First 1
      if (-not $rel) { Die "$tag relizlar ro'yxatida yo'q. Bor: $(($all | ForEach-Object { $_.Tag }) -join ', ')" }
      # The supervisor first, so that it writes nothing while this does.
      Kill-From $SupFile
      foreach ($r in $all) { if ($r.Num -gt $rel.Num) { Add-Failed (Fail-Key $r) } }
      if (App-Ok $rel.Name) {
        # already on the disk: only the pointer moves
        Write-Atomic $PreviousFile $cur
        Write-Atomic $CurrentFile $rel.Name
        Stop-Server; Stop-PortHolder
        Start-Supervisor 'resumed'
        if (-not (Wait-Supervisor)) { Die "$tag ishga tushmadi. laptop.cmd doctor ni ishga tushirib, natijasini yuboring." }
      } else {
        $why = Install-Release $rel $false
        if ($why) { Die $why }
      }
      Log "rollback $curLabel -> $tag"
      Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " qaytarildi: $curLabel -> $tag") }
      Say "Qaytarildi: $curLabel -> $tag. Undan yangilari o'zi o'rnatilmaydi (keyingi reliz chiqquncha)."
      break
    }
    $prev = Read-Pointer $PreviousFile
    if (-not $prev -or ($prev -ne 'ROOT' -and -not (App-Ok $prev))) {
      $names = @()
      try { $names = @(Read-Releases | Where-Object { $_.Tag -ne $curLabel } | ForEach-Object { $_.Tag }) } catch { }
      $hint = ''
      if ($names.Count) { $hint = " Ro'yxatdagi relizlar: $($names -join ', ') - masalan: laptop.cmd rollback $($names[-1])" }
      Die "Oldingi versiya saqlanmagan.$hint"
    }
    Kill-From $SupFile
    Add-Failed (Name-Key $cur)
    Stop-Server
    Stop-PortHolder
    Write-Atomic $CurrentFile $prev
    Remove-Item $PreviousFile -Force -ErrorAction SilentlyContinue
    $label = ''
    if ($prev -eq 'ROOT') { $label = Version-In (Split-Path -Parent (Split-Path -Parent $Launcher)) } else { $label = Version-In (App-Dir $prev) }
    Start-Supervisor 'resumed'
    if (-not (Wait-Supervisor)) { Die "Oldingi versiya ($label) ishga tushmadi. laptop.cmd doctor ni ishga tushirib, natijasini yuboring." }
    Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " qaytarildi: $curLabel -> $label") }
    Log "rollback $curLabel -> $label"
    Say "Qaytarildi: $curLabel -> $label. $curLabel o'zi qayta o'rnatilmaydi."
  }

  'autoupdate' {
    switch ($Arg) {
      'off' { Set-Setting 'AUTO_UPDATE' '0'; Say "Avtomatik yangilanish o'chirildi. Qo'lda: laptop.cmd update" }
      'on'  { Set-Setting 'AUTO_UPDATE' ''; Set-UpdateState @{ NEXT_CHECK = '' }; Say "Avtomatik yangilanish yoqildi." }
      default { Die "laptop.cmd autoupdate on   yoki   laptop.cmd autoupdate off" }
    }
  }

  # Every backup also in Google Drive: in a folder of its own inside the
  # Drive folder Drive for desktop shows, found by itself, or inside the one
  # given.
  'drive' {
    Ensure-Settings $false
    if ($Arg -eq 'off') {
      Set-Setting 'BACKUP_COPY' ''; Set-Setting 'DRIVE_OFF' '1'
      Say "Google Drive'ga nusxa olish to'xtatildi. Drive'dagi eski nusxalar joyida."
      break
    }
    $dir = ''
    if ($Arg -and $Arg -ne 'on') {
      if (-not [IO.Path]::IsPathRooted($Arg) -or -not (Test-Path -LiteralPath $Arg -PathType Container)) {
        Die "Bunday papka yo'q: $Arg   (masalan: laptop.cmd drive `"G:\My Drive`")"
      }
      $dir = Join-Path $Arg $DriveFolder
    } else {
      $roots = @(Drive-Roots)
      if ($roots.Count -eq 0) {
        Say "Google Drive papkasi topilmadi."
        Say "1. 'Google Drive dlya kompyutera' ni o'rnating: https://www.google.com/drive/download/"
        Say "2. Google hisobingiz bilan kiring."
        Say "3. Shu buyruqni qayta ishga tushiring:  laptop.cmd drive"
        exit 1
      }
      $dir = Join-Path $roots[0] $DriveFolder
    }
    Set-Setting 'BACKUP_COPY' $dir
    Set-Setting 'DRIVE_OFF' ''
    Say "Zaxiralar endi Google Drive'ga ham qo'yiladi: $dir"
    $last = Newest-Backup
    if ($last) { Copy-ToDrive $last.FullName }
  }

  'uninstall' {
    Wait-Install
    $lnk = Startup-Link
    if ($lnk -and (Test-Path $lnk)) { Remove-Item $lnk -Force }
    Stop-Server
    Say "O'chirildi: endi o'zi ishga tushmaydi. Ma'lumot joyida: $Data"
  }

  default { Die "Buyruqlar: start, autostart, status, backup, update, rollback, autoupdate, drive, stop, uninstall, debug, doctor" }
}
