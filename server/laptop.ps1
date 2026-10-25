# The program on one person's own Windows computer: the database is a file on
# this disk, nothing is sent anywhere, and the sign-in code never leaves the
# machine. The Windows twin of server/laptop.sh.
#
#   laptop.cmd                 start it in the background and open the browser
#   laptop.cmd autostart       ... and from now on start at every Windows sign-in
#   laptop.cmd status          is it running, how big is the database
#   laptop.cmd backup          make a copy now (kept in %USERPROFILE%\Backups\smeta)
#   laptop.cmd update          take the newest release and restart
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
# this folder, so a new version can be unpacked over it - or next to it - and
# the price memory is still there.
#
# Updates come by themselves when the program was set to start at sign-in: the
# process that keeps the server alive looks at server/releases.txt on GitHub
# every few hours, and a release newer than this one is installed - after a
# backup, with the old version kept beside the data, and only kept if the new
# one comes up and signs in. A release that does not is taken back out and
# never tried again by itself.
#
# Written for Windows PowerShell 5.1, which every Windows 10 and 11 has: no
# ?? or ?:, string bodies sent as UTF-8 bytes (5.1 sends Latin-1 otherwise),
# and the console output kept to plain ASCII.
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
$Pb = Join-Path $AppHome 'pocketbase.exe'
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

# Where releases come from. The list is one line per release, «v2.4.0 <commit>»,
# and a release is the repository as it was at that commit - never whatever
# happens to be on the branch at the moment of looking. TAQ_RELEASES and
# TAQ_RELEASE_ZIP (a local file each) are for the test.
$Repo        = 'https://github.com/1maxstar1/Ayubkhon_A'
$ReleaseList = 'https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/claude/excel-price-validation-5ehbvb/server/releases.txt'
if ($env:TAQ_RELEASES) { $ReleaseList = $env:TAQ_RELEASES }
$Previous    = Join-Path $AppHome 'previous'
$UpdateFile  = Join-Path $AppHome 'update.env'
$LockFile    = Join-Path $AppHome 'update.lock'
$LogFile     = Join-Path $AppHome 'supervisor.log'
# How often the supervisor looks (seconds), how long it waits between looks at
# the server, and how soon it looks again after the network failed.
$CheckEvery  = 6 * 3600; if ($env:TAQ_UPDATE_EVERY) { $CheckEvery = [int]$env:TAQ_UPDATE_EVERY }
$RetryEvery  = 3600;     if ($env:TAQ_UPDATE_RETRY) { $RetryEvery = [int]$env:TAQ_UPDATE_RETRY }
$Tick        = 600;      if ($env:TAQ_TICK) { $Tick = [int]$env:TAQ_TICK }
$DriveFolder = 'Smeta zaxira'

# Functions that the supervisor also calls throw instead of ending the script:
# a supervisor that exits on the first failed start brings nothing back.
$script:NoDie = $false

function Say([string]$t) { Write-Host $t }
function Die([string]$t) { Write-Host $t; exit 1 }
function Fail([string]$t) { if ($script:NoDie) { throw $t } else { Die $t } }

# What happened while nobody was looking - updates, failed starts - for
# «laptop.cmd status» to show. Kept short.
function Log([string]$t) {
  try {
    New-Item -ItemType Directory -Force -Path $AppHome | Out-Null
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm') + '  ' + $t + "`r`n"
    [IO.File]::AppendAllText($LogFile, $line, [Text.Encoding]::UTF8)
    $all = [IO.File]::ReadAllLines($LogFile, [Text.Encoding]::UTF8)
    if ($all.Count -gt 400) { [IO.File]::WriteAllLines($LogFile, [string[]]($all | Select-Object -Last 200), [Text.Encoding]::UTF8) }
  } catch { }
}

function Startup-Link {
  if (-not $OnWindows) { return $null }
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Taqqoslash.lnk'
}
function Autostart-On {
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
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
  [IO.File]::WriteAllLines($file, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
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
function Running-Pid([string]$file) {
  if (-not (Test-Path $file)) { return $null }
  $id = (Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $id) { return $null }
  $p = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
  if ($p) { return $p.Id }
  return $null
}

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
  Set-Content -Path $PidFile -Value $proc.Id
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
  $f = Join-Path (Join-Path $dir 'dist') 'index.html'
  if (-not (Test-Path $f)) { return '' }
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

# The server and the process that keeps it alive.
function Stop-Server {
  foreach ($f in @($SupFile, $PidFile)) {
    $id = Running-Pid $f
    if ($id -and $id -ne $PID) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 700
}
# Only the supervisor: a command typed by hand that changes the version stops
# it first, so the two never write the same files at once.
function Stop-Supervisor {
  $id = Running-Pid $SupFile
  if ($id -and $id -ne $PID) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  Remove-Item $SupFile -Force -ErrorAction SilentlyContinue
}
# One install at a time: the supervisor's or one typed by hand. A lock left by
# a process that is gone is free.
function Take-Lock {
  $id = Running-Pid $LockFile
  if ($id -and $id -ne $PID) { return $false }
  New-Item -ItemType Directory -Force -Path $AppHome | Out-Null
  Set-Content -Path $LockFile -Value $PID
  return $true
}
function Drop-Lock {
  $id = Running-Pid $LockFile
  if (-not $id -or $id -eq $PID) { Remove-Item $LockFile -Force -ErrorAction SilentlyContinue }
}
# Only the server - what the supervisor calls on itself.
function Stop-ServerOnly {
  $id = Running-Pid $PidFile
  if ($id) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
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

# ------------------------------------------------------------------ Google Drive
# A backup on the same disk as the data does not survive the disk. Google
# Drive for desktop shows the Drive as a folder (G:\My Drive, G:\Мой диск, or
# %USERPROFILE%\My Drive when it mirrors), and whatever is put there is
# uploaded by Drive itself - so each backup is also copied there, and can be
# opened from any other computer.
function Drive-Roots {
  if ($env:TAQ_DRIVE_ROOTS) { return @($env:TAQ_DRIVE_ROOTS -split ';' | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }) }
  $names = @('My Drive', 'Мой диск', 'Mening diskim', 'Google Drive')
  $found = @()
  $bases = @()
  try { $bases += @([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName }) } catch { }
  $bases += [Environment]::GetFolderPath('UserProfile')
  foreach ($b in $bases) {
    foreach ($n in $names) {
      $p = Join-Path $b $n
      if (Test-Path -LiteralPath $p -PathType Container) { $found += $p }
    }
    # A Drive for desktop drive in a language not listed above: its root holds
    # .shortcut-targets-by-id, and «My Drive» sorts before «Shared drives».
    if ($found.Count -eq 0 -and (Test-Path -LiteralPath (Join-Path $b '.shortcut-targets-by-id'))) {
      $d = Get-ChildItem -LiteralPath $b -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '.*' } | Sort-Object Name | Select-Object -First 1
      if ($d) { $found += $d.FullName }
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
function Copy-ToDrive([string]$file) {
  $dir = Drive-Copy
  if (-not $dir) { return }
  try {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -LiteralPath $file -Destination (Join-Path $dir (Split-Path -Leaf $file)) -Force
    Get-ChildItem -LiteralPath $dir -Filter '*.zip' | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip $Keep | Remove-Item -Force
    Say "Drive'dagi nusxa: $(Join-Path $dir (Split-Path -Leaf $file))"
  } catch {
    Say "Drive'ga nusxa olinmadi (Google Drive ishlayaptimi?): $($_.Exception.Message)"
    Log "drive copy failed: $($_.Exception.Message)"
  }
}

# ------------------------------------------------------------------ backups
# A copy of the whole database, kept outside the data folder - a disk that
# loses the data folder loses the backups inside it too.
function Backup-Now {
  $tok = Su-Token
  Api 'Post' '/api/backups' @{} $tok | Out-Null
  $dir = Join-Path $Data 'backups'
  $newest = Get-ChildItem -Path $dir -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $newest) { Say "zaxira fayli topilmadi"; return }
  New-Item -ItemType Directory -Force -Path $Backups | Out-Null
  $copy = Join-Path $Backups $newest.Name
  Copy-Item $newest.FullName $copy -Force
  foreach ($d in @($Backups, $dir)) {
    Get-ChildItem -Path $d -Filter '*.zip' | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip $Keep | Remove-Item -Force
  }
  Say "zaxira: $copy"
  Copy-ToDrive $copy
}

# Once a day, taken at start-up - and by the supervisor while it runs - rather
# than at three in the morning: a laptop is asleep at three.
function Backup-IfStale {
  $last = $null
  if (Test-Path $Backups) {
    $last = Get-ChildItem -Path $Backups -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }
  if ($last -and $last.LastWriteTime -gt (Get-Date).AddHours(-20)) { return }
  try { Backup-Now } catch { Say "zaxira olinmadi: $($_.Exception.Message)"; Log "backup failed: $($_.Exception.Message)" }
}

# ------------------------------------------------------------------ releases
function Get-Text([string]$src) {
  if ($src -match '^https?://') { return [string](Invoke-WebRequest -UseBasicParsing -Uri $src -TimeoutSec 30).Content }
  return [IO.File]::ReadAllText($src)
}

# server/releases.txt: «v2.4.0 <commit>» per line, anything else ignored.
function Read-Releases {
  $list = @()
  foreach ($line in ((Get-Text $ReleaseList) -split "`n")) {
    $m = [regex]::Match($line, '^\s*v(\d+\.\d+\.\d+)\s+([0-9a-fA-F]{7,40})\b')
    if ($m.Success) {
      $list += [pscustomobject]@{ Tag = 'v' + $m.Groups[1].Value; Num = [version]$m.Groups[1].Value; Sha = $m.Groups[2].Value }
    }
  }
  return @($list | Sort-Object Num)
}
function Failed-Tags {
  $s = Read-Env $UpdateFile
  return @(([string]$s['FAILED']) -split ',' | Where-Object { $_ })
}
function Add-Failed([string]$tag) {
  $f = @(Failed-Tags)
  if ($f -notcontains $tag) { $f += $tag }
  Set-UpdateState @{ FAILED = ($f -join ',') }
}
function Is-GitCheckout {
  return [bool]((Test-Path (Join-Path $Root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue))
}

# Is the unpacked folder really this release of this program, and can its
# launcher even be read? A launcher with a syntax error would be the last
# version this computer ever ran by itself.
function Check-Release([string]$dir, [string]$tag) {
  $v = Version-In $dir
  if ($v -ne $tag) { return "ichidagi versiya '$v', kutilgani $tag" }
  $server = Join-Path $dir 'server'
  foreach ($f in @((Join-Path $server 'laptop.ps1'), (Join-Path $server 'pb_schema.json'), (Join-Path $server 'pb_hooks'),
                   (Join-Path (Join-Path $dir 'dist') 'admin.html'))) {
    if (-not (Test-Path $f)) { return "$(Split-Path -Leaf $f) yo'q" }
  }
  $errs = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $server 'laptop.ps1'), [ref]$tokens, [ref]$errs)
  if ($errs -and @($errs).Count -gt 0) { return "laptop.ps1 o'qilmaydi: $(@($errs)[0].Message)" }
  return ''
}

# The program folder from another one. dist\ and the hooks are made exactly
# like the source - a hook the new version no longer has must not keep
# running - everything else is copied over what is there.
function Put-Files([string]$src, [string]$dst) {
  foreach ($t in @((Join-Path $dst 'dist'), (Join-Path (Join-Path $dst 'server') 'pb_hooks'))) {
    if (Test-Path $t) { Remove-Item $t -Recurse -Force }
  }
  # The same copy the installer makes, which is known to merge into an
  # existing install on Windows PowerShell 5.1.
  Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
}

# The version now in the folder, kept beside the data for «rollback».
function Save-Previous {
  if (Test-Path $Previous) { Remove-Item $Previous -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $Previous | Out-Null
  Copy-Item -Path (Join-Path $Root '*') -Destination $Previous -Recurse -Force
}

# Up, and the version that is in the folder, and signing in by itself.
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

# The supervisor of the new version takes over; this process, if it is the
# old supervisor, ends.
function Hand-Over {
  Start-Supervisor
  for ($i = 0; $i -lt 30; $i++) { if ((Running-Pid $SupFile) -and (Running-Pid $SupFile) -ne $PID) { break }; Start-Sleep -Seconds 1 }
}

# Download, check, back up, keep the old version, put the new one in, start
# it, and keep it only if it comes up as itself. Returns '' or why not.
function Install-Release($rel, [bool]$supervised) {
  if (-not (Take-Lock)) { return "boshqa yangilanish ketyapti" }
  try { return (Install-Locked $rel $supervised) } finally { Drop-Lock }
}
function Install-Locked($rel, [bool]$supervised) {
  $from = Local-Version
  $zip = Join-Path $AppHome 'update.zip'
  $tmp = Join-Path $AppHome 'update'
  Say "Yuklanmoqda: $($rel.Tag)..."
  Log "update $from -> $($rel.Tag): download"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  if ($env:TAQ_RELEASE_ZIP) { Copy-Item (Join-Path $env:TAQ_RELEASE_ZIP "$($rel.Sha).zip") $zip -Force }
  else { Invoke-WebRequest -UseBasicParsing -Uri "$Repo/archive/$($rel.Sha).zip" -OutFile $zip -TimeoutSec 300 }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  Remove-Item $zip -Force
  # GitHub puts everything inside one folder named after the commit.
  $top = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  $why = 'arxiv bo''sh'
  if ($top) { $why = Check-Release $top.FullName $rel.Tag }
  if ($why) {
    Remove-Item $tmp -Recurse -Force
    Add-Failed $rel.Tag
    Log "update $($rel.Tag) refused: $why"
    return "$($rel.Tag) o'rnatilmadi: $why"
  }

  if (Answering) { try { Backup-Now } catch { Log "backup before update failed: $($_.Exception.Message)" } }
  Save-Previous
  if ($supervised) { Stop-ServerOnly } else { Stop-Server }
  Stop-PortHolder
  $ok = $false
  try {
    Put-Files $top.FullName $Root
    $ok = Start-AndCheck
  } catch { Log "update $($rel.Tag): $($_.Exception.Message)" }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

  if ($ok) {
    Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $from -> $($rel.Tag)") }
    Log "update $from -> $($rel.Tag): ok"
    return ''
  }
  # It did not come up as itself: the old one goes back, and this release is
  # not tried again by itself.
  Log "update $($rel.Tag) did not start - back to $from"
  Add-Failed $rel.Tag
  Stop-ServerOnly
  Stop-PortHolder
  Put-Files $Previous $Root
  if (-not (Start-AndCheck)) { Log "the previous version did not start either" }
  Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " $($rel.Tag) ishga tushmadi, $from qaytarildi") }
  return "$($rel.Tag) ishga tushmadi - $from qaytarildi"
}

# The newest release this computer would take by itself, or $null.
function Newer-Release([bool]$skipFailed) {
  $have = Version-Num (Local-Version)
  $failed = @(Failed-Tags)
  $best = $null
  foreach ($r in @(Read-Releases)) {
    if ($r.Num -le $have) { continue }
    if ($skipFailed -and $failed -contains $r.Tag) { continue }
    $best = $r
  }
  return $best
}

# When the supervisor may restart the server for an update: when it has just
# started (sign-in), out of working hours, or when the release has waited a
# day. A restart under somebody typing prices costs them the last keystroke.
function Quiet-Time {
  if ($env:TAQ_UPDATE_ANYTIME -eq '1') { return $true }
  $h = (Get-Date).Hour
  return ($h -lt 8 -or $h -ge 19)
}

function Update-IfDue([bool]$justStarted) {
  $s = Read-Settings
  if ($s['AUTO_UPDATE'] -eq '0') { return }
  if (Is-GitCheckout) { return }
  $u = Read-Env $UpdateFile
  $now = Get-Date
  # At sign-in it always looks: the computer may have been off for days.
  if ($u['NEXT_CHECK'] -and -not $justStarted) {
    try { if ([datetime]::Parse($u['NEXT_CHECK'], [Globalization.CultureInfo]::InvariantCulture) -gt $now) { return } } catch { }
  }
  try {
    $rel = Newer-Release $true
  } catch {
    Set-UpdateState @{ LAST_CHECK = $now.ToString('yyyy-MM-dd HH:mm'); CHECK_ERROR = $_.Exception.Message
      NEXT_CHECK = $now.AddSeconds($RetryEvery).ToString('s') }
    return
  }
  $latest = ''
  if ($rel) { $latest = $rel.Tag }
  Set-UpdateState @{ LAST_CHECK = $now.ToString('yyyy-MM-dd HH:mm'); CHECK_ERROR = ''; AVAILABLE = $latest
    NEXT_CHECK = $now.AddSeconds($CheckEvery).ToString('s') }
  if (-not $rel) { return }
  if (-not $justStarted -and -not (Quiet-Time)) {
    $since = $u['WAITING_SINCE']
    if ($u['WAITING_FOR'] -ne $rel.Tag -or -not $since) {
      Set-UpdateState @{ WAITING_FOR = $rel.Tag; WAITING_SINCE = $now.ToString('s') }
      Set-UpdateState @{ NEXT_CHECK = $now.AddSeconds([Math]::Min($CheckEvery, 3600)).ToString('s') }
      return
    }
    try { $waited = ($now - [datetime]::Parse($since, [Globalization.CultureInfo]::InvariantCulture)).TotalHours } catch { $waited = 0 }
    if ($waited -lt 24) {
      Set-UpdateState @{ NEXT_CHECK = $now.AddSeconds([Math]::Min($CheckEvery, 3600)).ToString('s') }
      return
    }
  }
  Set-UpdateState @{ WAITING_FOR = ''; WAITING_SINCE = '' }
  $why = Install-Release $rel $true
  if (-not $why) { Hand-Over; exit 0 }
}

# ------------------------------------------------------------------ autostart
# The supervisor: started hidden, by the sign-in shortcut or after an update.
function Start-Supervisor {
  $exe = 'powershell.exe'
  try { $exe = (Get-Process -Id $PID).Path } catch { }
  $a = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" serve'
  if ($OnWindows) {
    Start-Process -FilePath $exe -ArgumentList ('-WindowStyle Hidden ' + $a) -WindowStyle Hidden | Out-Null
  } else {
    # the test: not on the end of the pipe of whoever called this
    Start-Process -FilePath $exe -ArgumentList $a -RedirectStandardOutput '/dev/null' -RedirectStandardError (Join-Path $AppHome 'supervisor.err') | Out-Null
  }
}

function Banner {
  Say ""
  Say "-------------------------------------------------------------"
  Say "  Dastur:        $Url/"
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

# After a manual install or rollback: back under the supervisor if it had one.
function Restart-AsBefore([bool]$wasAuto) {
  if ($wasAuto) { Hand-Over }
}

# ------------------------------------------------------------------ commands
switch ($Command) {
  'start' {
    if (Is-Current) { Say "Allaqachon ishlayapti: $Url/"; Open-Browser; break }
    Ensure-Settings $true
    if (Answering) {
      Say "Eski server topildi ($(Served-Version)) - $(Local-Version) bilan almashtirilmoqda..."
      Stop-Server
      Stop-PortHolder
      if (Answering) { Die "$Port-port boshqa dastur tomonidan band. Uni yoping yoki kompyuterni qayta yoqing." }
    }
    Prepare
    Start-Server
    After-Start
    Banner
    Say ""
    Say "  Server fonda ishlayapti - bu oynani yopsangiz ham ishlayveradi."
    Say "  To'xtatish: laptop.cmd stop"
    Open-Browser
  }

  # What the sign-in shortcut runs: no browser, no banner, and it stays alive
  # so it can bring the server back if it ever stops, take the daily backup,
  # and install a new release.
  'serve' {
    $script:NoDie = $true
    Ensure-Settings $false
    Set-Content -Path $SupFile -Value $PID
    Log "supervisor started ($(Local-Version))"
    $first = $true
    while ($true) {
      if (-not (Answering)) {
        try { Prepare; Start-Server; After-Start } catch { Log "start failed: $($_.Exception.Message)"; Start-Sleep -Seconds 10; continue }
      }
      try { Backup-IfStale } catch { }
      try { Update-IfDue $first } catch { Log "update check failed: $($_.Exception.Message)" }
      $first = $false
      $id = Running-Pid $PidFile
      if ($id) { try { [void](Get-Process -Id $id).WaitForExit($Tick * 1000) } catch { } }
      else { Start-Sleep -Seconds ([Math]::Min(60, $Tick)) }
      Start-Sleep -Seconds 1
    }
  }

  'autostart' {
    if (-not $OnWindows) { Die "autostart faqat Windows'da (Mac'da: sh server/laptop.sh autostart)" }
    Ensure-Settings $true
    Prepare
    $lnk = Startup-Link
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" serve'
    $sc.WorkingDirectory = $Root
    $sc.WindowStyle = 7
    $sc.Description = 'Taqqoslash jadvali - mahalliy server'
    $sc.Save()
    if (-not (Is-Current) -or -not (Running-Pid $SupFile)) {
      Stop-Server
      Stop-PortHolder
      Start-Supervisor
      for ($i = 0; $i -lt 60; $i++) { if (Answering) { break }; Start-Sleep -Seconds 1 }
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
    $s = Read-Settings
    $script:Email = $s['PB_ADMIN_EMAIL']; $script:Pass = $s['PB_ADMIN_PASS']
    Say "=== Tashxis ==="
    Say "Dastur papkasi:  $Root  (versiya $(Local-Version))"
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
    Start-Server
    After-Start
    Say "Server qayta ishga tushirildi. Shu oynadagi hamma yozuvni yuboring."
  }

  'stop' {
    Stop-Server
    if (Answering) { Say "Hali ham javob beryapti - boshqa dastur 8090 portni egallagan bo'lishi mumkin." }
    else { Say "To'xtatildi." }
  }

  'status' {
    if (Answering) {
      Say "Ishlayapti: $Url/"
      $sv = Served-Version; $lv = Local-Version
      if ($sv -eq $lv) { Say "Versiya: $sv" } else { Say "Versiya: $sv ishlayapti, papkada $lv - almashtirish uchun: laptop.cmd start" }
      if (Autologin-On) { Say "Kirish oynasisiz: ha" } else { Say "Kirish oynasisiz: yo'q (kirish oynasi chiqadi)" }
    } else { Say "Ishlamayapti" }
    if (Autostart-On) {
      if (Running-Pid $SupFile) { Say "Windows'ga kirganda o'zi ishga tushadi (kuzatuvchi ishlayapti)" }
      else { Say "Windows'ga kirganda o'zi ishga tushadi (kuzatuvchi hozir ishlamayapti)" }
    }
    $s = Read-Settings
    $u = Read-Env $UpdateFile
    if (Is-GitCheckout) { Say "Yangilanish: git papkasi - qo'lda (laptop.cmd update)" }
    elseif ($s['AUTO_UPDATE'] -eq '0') { Say "Avtomatik yangilanish: o'chirilgan (yoqish: laptop.cmd autoupdate on)" }
    elseif (-not (Autostart-On) -and $OnWindows) { Say "Avtomatik yangilanish: faqat autostart bilan ishlaydi (laptop.cmd autostart)" }
    else { Say "Avtomatik yangilanish: yoqilgan (har $([int]($CheckEvery / 3600)) soatda tekshiradi)" }
    if ($u['LAST_CHECK']) {
      $line = "  oxirgi tekshiruv: $($u['LAST_CHECK'])"
      if ($u['CHECK_ERROR']) { $line += " - xato: $($u['CHECK_ERROR'])" }
      elseif ($u['AVAILABLE']) { $line += " - yangi versiya bor: $($u['AVAILABLE'])" }
      else { $line += " - eng yangisi o'rnatilgan" }
      Say $line
    }
    if ($u['LAST_UPDATE']) { Say "  oxirgi yangilanish: $($u['LAST_UPDATE'])" }
    if ($u['FAILED']) { Say "  o'zi qayta urinmaydi: $($u['FAILED'])" }
    $pv = Version-In $Previous
    if ($pv) { Say "  oldingi versiya saqlangan: $pv (qaytarish: laptop.cmd rollback)" }
    if (Test-Path $Data) {
      $mb = (Get-ChildItem $Data -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
      Say ("Ma'lumot: {0:N1} MB  ({1})" -f $mb, $Data)
    }
    $all = @()
    if (Test-Path $Backups) { $all = @(Get-ChildItem -Path $Backups -Filter '*.zip' | Sort-Object LastWriteTime -Descending) }
    if ($all.Count) { Say "Zaxira: $($all.Count) ta, oxirgisi $($all[0].Name)" } else { Say "Zaxira: hali yo'q" }
    $copy = $s['BACKUP_COPY']
    if ($copy) {
      $n = 0
      if (Test-Path -LiteralPath $copy) { $n = @(Get-ChildItem -LiteralPath $copy -Filter '*.zip').Count }
      Say "Google Drive'da: $n ta ($copy)"
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
    if (Is-GitCheckout) {
      & git -C $Root pull --ff-only
      if ($LASTEXITCODE -ne 0) { Die "git pull o'tmadi" }
      $wasAuto = Autostart-On
      Stop-Server
      Stop-PortHolder
      Ensure-Settings $false
      if ($wasAuto) { Hand-Over; for ($i = 0; $i -lt 60; $i++) { if (Answering) { break }; Start-Sleep -Seconds 1 } }
      else { Prepare; Start-Server; After-Start }
      Say "Yangilandi - brauzerda Ctrl+Shift+R bosing."
      break
    }
    Ensure-Settings $false
    try { $rel = Newer-Release $false } catch { Die "Relizlar ro'yxatini olib bo'lmadi: $($_.Exception.Message)" }
    if (-not $rel) { Say "Eng yangi versiya o'rnatilgan: $(Local-Version)"; break }
    if (-not (Take-Lock)) { Die "Hozir o'zi yangilanyapti - bir daqiqadan keyin qayta urinib ko'ring." }
    $wasAuto = (Autostart-On) -or [bool](Running-Pid $SupFile)
    Stop-Supervisor
    try { $why = Install-Release $rel $false } catch { $why = "$($rel.Tag) yuklab olinmadi: $($_.Exception.Message)" }
    Restart-AsBefore $wasAuto
    if ($why) { Die $why }
    Say "Yangilandi: $($rel.Tag) - brauzerda Ctrl+Shift+R bosing."
  }

  # Back to the version before the last update (kept beside the data), or to
  # a release by name. Whatever was running is not installed again by itself.
  'rollback' {
    if (Is-GitCheckout) { Die "Bu git papkasi: eski versiyaga git checkout bilan qayting." }
    Ensure-Settings $false
    $now = Local-Version
    if (-not (Take-Lock)) { Die "Hozir o'zi yangilanyapti - bir daqiqadan keyin qayta urinib ko'ring." }
    $wasAuto = (Autostart-On) -or [bool](Running-Pid $SupFile)
    Stop-Supervisor
    if ($Arg) {
      $tag = $Arg.Trim(); if ($tag -notlike 'v*') { $tag = 'v' + $tag }
      try { $rel = @(Read-Releases) | Where-Object { $_.Tag -eq $tag } | Select-Object -First 1 } catch { Drop-Lock; Restart-AsBefore $wasAuto; Die "Relizlar ro'yxatini olib bo'lmadi: $($_.Exception.Message)" }
      if (-not $rel) { Drop-Lock; Restart-AsBefore $wasAuto; Die "$tag relizlar ro'yxatida yo'q. Bor: $((@(Read-Releases) | ForEach-Object { $_.Tag }) -join ', ')" }
      foreach ($r in @(Read-Releases)) { if ($r.Num -gt $rel.Num) { Add-Failed $r.Tag } }
      try { $why = Install-Release $rel $false } catch { $why = "$tag yuklab olinmadi: $($_.Exception.Message)" }
      Restart-AsBefore $wasAuto
      if ($why) { Die $why }
      Say "Qaytarildi: $now -> $tag. Undan yangilari o'zi o'rnatilmaydi (keyingi reliz chiqquncha)."
      break
    }
    $pv = Version-In $Previous
    if (-not $pv) { Drop-Lock; Restart-AsBefore $wasAuto; Die "Oldingi versiya saqlanmagan. Reliz bo'yicha qaytarish: laptop.cmd rollback v2.4.0" }
    Add-Failed $now
    Stop-Server
    Stop-PortHolder
    Put-Files $Previous $Root
    $up = Start-AndCheck
    Drop-Lock
    if (-not $up) { Restart-AsBefore $wasAuto; Die "Oldingi versiya ($pv) ishga tushmadi. laptop.cmd doctor ni ishga tushirib, natijasini yuboring." }
    Remove-Item $Previous -Recurse -Force
    Set-UpdateState @{ LAST_UPDATE = ((Get-Date).ToString('yyyy-MM-dd HH:mm') + " qaytarildi: $now -> $pv") }
    Log "rollback $now -> $pv"
    Restart-AsBefore $wasAuto
    Say "Qaytarildi: $now -> $pv. $now o'zi qayta o'rnatilmaydi."
  }

  'autoupdate' {
    switch ($Arg) {
      'off' { Set-Setting 'AUTO_UPDATE' '0'; Say "Avtomatik yangilanish o'chirildi. Qo'lda: laptop.cmd update" }
      'on'  { Set-Setting 'AUTO_UPDATE' ''; Set-UpdateState @{ NEXT_CHECK = '' }; Say "Avtomatik yangilanish yoqildi." }
      default { Die "laptop.cmd autoupdate on   yoki   laptop.cmd autoupdate off" }
    }
  }

  # Every backup also in Google Drive: the folder Drive for desktop shows,
  # found by itself, or the one given.
  'drive' {
    Ensure-Settings $false
    if ($Arg -eq 'off') {
      Set-Setting 'BACKUP_COPY' ''; Set-Setting 'DRIVE_OFF' '1'
      Say "Google Drive'ga nusxa olish to'xtatildi. Drive'dagi eski nusxalar joyida."
      break
    }
    $dir = ''
    if ($Arg) { $dir = $Arg }
    else {
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
    $last = $null
    if (Test-Path $Backups) { $last = Get-ChildItem -Path $Backups -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
    if ($last) { Copy-ToDrive $last.FullName }
  }

  'uninstall' {
    $lnk = Startup-Link
    if ($lnk -and (Test-Path $lnk)) { Remove-Item $lnk -Force }
    Stop-Server
    Say "O'chirildi: endi o'zi ishga tushmaydi. Ma'lumot joyida: $Data"
  }

  default { Die "Buyruqlar: start, autostart, status, backup, update, rollback, autoupdate, drive, stop, uninstall, debug, doctor" }
}
