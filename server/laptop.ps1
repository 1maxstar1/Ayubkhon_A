# The program on one person's own Windows computer: the database is a file on
# this disk, nothing is sent anywhere, and the sign-in code never leaves the
# machine. The Windows twin of server/laptop.sh.
#
#   laptop.cmd                 start it in the background and open the browser
#   laptop.cmd autostart       ... and from now on start at every Windows sign-in
#   laptop.cmd status          is it running, how big is the database
#   laptop.cmd backup          make a copy now (kept in %USERPROFILE%\Backups\smeta)
#   laptop.cmd update          take the newest version and restart
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
# Written for Windows PowerShell 5.1, which every Windows 10 and 11 has: no
# ?? or ?:, string bodies sent as UTF-8 bytes (5.1 sends Latin-1 otherwise),
# and the console output kept to plain ASCII.
param([string]$Command = 'start')

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

function Say([string]$t) { Write-Host $t }
function Die([string]$t) { Write-Host $t; exit 1 }

function Startup-Link {
  if (-not $OnWindows) { return $null }
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Taqqoslash.lnk'
}

# ------------------------------------------------------------------ settings
function Read-Settings {
  $s = @{}
  if (Test-Path $Settings) {
    foreach ($line in [IO.File]::ReadAllLines($Settings)) {
      $i = $line.IndexOf('=')
      if ($i -gt 0) { $s[$line.Substring(0, $i)] = $line.Substring($i + 1) }
    }
  }
  return $s
}

function New-Password {
  $b = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $p = [Convert]::ToBase64String($b) -replace '[^A-Za-z0-9]', ''
  return $p.Substring(0, [Math]::Min(24, $p.Length))
}

# The superuser password guards the database console on this machine. Made
# once, kept beside the database, reused on every later run.
function Ensure-Settings([bool]$interactive) {
  New-Item -ItemType Directory -Force -Path $AppHome | Out-Null
  $s = Read-Settings
  $script:NewPass = $false
  if (-not $s['PB_ADMIN_EMAIL']) {
    $email = $env:PB_ADMIN_EMAIL
    if (-not $email -and $interactive) {
      $email = Read-Host "Ishchi elektron pochtangiz (shu bilan dasturga kirasiz)"
    }
    if (-not $email) { Die "Pochta kerak. Avval laptop.cmd ni ikki marta bosib ishga tushiring." }
    $s['PB_ADMIN_EMAIL'] = $email.Trim()
  }
  if (-not $s['PB_ADMIN_PASS']) { $s['PB_ADMIN_PASS'] = New-Password; $script:NewPass = $true }
  $lines = @("PB_ADMIN_EMAIL=$($s['PB_ADMIN_EMAIL'])", "PB_ADMIN_PASS=$($s['PB_ADMIN_PASS'])")
  [IO.File]::WriteAllLines($Settings, $lines)
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
  Die "Server ishga tushmadi. Sababini ko'rish uchun:  laptop.cmd debug"
}

# The version label the page carries in its header (class="ver").
function Version-Of([string]$html) {
  $m = [regex]::Match([string]$html, 'class="ver"[^>]*>(v[0-9.]+)<')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}
function Local-Version {
  return Version-Of ([IO.File]::ReadAllText((Join-Path (Join-Path $Root 'dist') 'index.html')))
}
function Served-Version {
  try { return Version-Of (Invoke-WebRequest -UseBasicParsing -Uri "$Url/" -TimeoutSec 5).Content } catch { return '' }
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

function Stop-Server {
  foreach ($f in @($SupFile, $PidFile)) {
    $id = Running-Pid $f
    if ($id) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 700
}

# Superuser, collections, and the one person's account. Same address as the
# superuser, and an administrator, so one person can both price a project and
# load the registry. Re-running is safe: the import merges and never deletes,
# and the account is only created when it is not there.
function Prepare {
  Ensure-PocketBase
  & $Pb superuser upsert $script:Email $script:Pass "--dir=$Data" | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "Superuser yaratilmadi (pocketbase superuser upsert)." }
}

function After-Start {
  $tok = Su-Token
  if (-not $tok) { Die "Bazaga kirib bo'lmadi - settings.env dagi parol mos kelmayapti." }
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
      Die ("Hisob yaratilmadi (" + $script:Email + "): " + $_.Exception.Message)
    }
  } else {
    $u = @($found.items)[0]
    if ($u.role -ne 'admin' -or -not $u.active) {
      Api 'Patch' "/api/collections/users/records/$($u.id)" @{ role = 'admin'; active = $true } $tok | Out-Null
    }
  }
  Backup-IfStale
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
  Copy-Item $newest.FullName (Join-Path $Backups $newest.Name) -Force
  foreach ($d in @($Backups, $dir)) {
    Get-ChildItem -Path $d -Filter '*.zip' | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip $Keep | Remove-Item -Force
  }
  Say "zaxira: $(Join-Path $Backups $newest.Name)"
}

# Once a day, taken at start-up rather than at three in the morning: a laptop
# is asleep at three.
function Backup-IfStale {
  $last = $null
  if (Test-Path $Backups) {
    $last = Get-ChildItem -Path $Backups -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }
  if ($last -and $last.LastWriteTime -gt (Get-Date).AddHours(-20)) { return }
  try { Backup-Now } catch { Say "zaxira olinmadi: $($_.Exception.Message)" }
}

# ------------------------------------------------------------------ autostart
function Start-Supervisor {
  $a = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" serve'
  Start-Process -FilePath 'powershell.exe' -ArgumentList $a -WindowStyle Hidden | Out-Null
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
  Say "-------------------------------------------------------------"
  if ($script:NewPass) { Say ""; Say "  Baza paneli uchun parol yaratildi: $Settings" }
}

function Open-Browser { if ($OnWindows) { Start-Process "$Url/" } }

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
  # so it can bring the server back if it ever stops.
  'serve' {
    Ensure-Settings $false
    Set-Content -Path $SupFile -Value $PID
    while ($true) {
      if (-not (Answering)) {
        try { Prepare; Start-Server; After-Start } catch { Start-Sleep -Seconds 10; continue }
      }
      $id = Running-Pid $PidFile
      if ($id) { try { (Get-Process -Id $id).WaitForExit() } catch { } }
      else { Start-Sleep -Seconds 10 }
      Start-Sleep -Seconds 3
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
    if (-not (Is-Current)) {
      Stop-Server
      Stop-PortHolder
      Start-Supervisor
      for ($i = 0; $i -lt 60; $i++) { if (Answering) { break }; Start-Sleep -Seconds 1 }
    }
    if (-not (Answering)) { Die "Ishga tushmadi. Sababini ko'rish uchun:  laptop.cmd debug" }
    Banner
    Say ""
    Say "  Endi Windows'ga kirganingizda o'zi ishga tushadi."
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
    $lnk = Startup-Link
    if ($lnk -and (Test-Path $lnk)) { Say "Windows'ga kirganda o'zi ishga tushadi" }
    if (Test-Path $Data) {
      $mb = (Get-ChildItem $Data -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
      Say ("Ma'lumot: {0:N1} MB  ({1})" -f $mb, $Data)
    }
    $all = @()
    if (Test-Path $Backups) { $all = @(Get-ChildItem -Path $Backups -Filter '*.zip' | Sort-Object LastWriteTime -Descending) }
    if ($all.Count) { Say "Zaxira: $($all.Count) ta, oxirgisi $($all[0].Name)" } else { Say "Zaxira: hali yo'q" }
  }

  'backup' {
    Ensure-Settings $false
    $started = $false
    if (-not (Answering)) { Prepare; Start-Server; $started = $true }
    Backup-Now
    if ($started) { Stop-Server }
  }

  # The newest version of the program, over this folder. The data is not in
  # this folder, so nothing in it is touched.
  'update' {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git -and (Test-Path (Join-Path $Root '.git'))) {
      & git -C $Root pull --ff-only
      if ($LASTEXITCODE -ne 0) { Die "git pull o'tmadi" }
    } else {
      $zipUrl = 'https://github.com/1maxstar1/Ayubkhon_A/archive/refs/heads/claude/excel-price-validation-5ehbvb.zip'
      $zip = Join-Path $AppHome 'update.zip'
      $tmp = Join-Path $AppHome 'update'
      Say "Yangi versiya yuklanmoqda..."
      Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zip
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
      $top = Get-ChildItem $tmp -Directory | Select-Object -First 1
      Copy-Item -Path (Join-Path $top.FullName '*') -Destination $Root -Recurse -Force
      Remove-Item $zip -Force
      Remove-Item $tmp -Recurse -Force
    }
    $wasAuto = $false
    $lnk = Startup-Link
    if ($lnk -and (Test-Path $lnk)) { $wasAuto = $true }
    Stop-Server
    Stop-PortHolder
    Ensure-Settings $false
    if ($wasAuto) {
      Start-Supervisor
      for ($i = 0; $i -lt 60; $i++) { if (Answering) { break }; Start-Sleep -Seconds 1 }
    } else {
      Prepare; Start-Server; After-Start
    }
    Say "Yangilandi - brauzerda Ctrl+Shift+R bosing."
  }

  'uninstall' {
    $lnk = Startup-Link
    if ($lnk -and (Test-Path $lnk)) { Remove-Item $lnk -Force }
    Stop-Server
    Say "O'chirildi: endi o'zi ishga tushmaydi. Ma'lumot joyida: $Data"
  }

  default { Die "Buyruqlar: start, autostart, status, backup, update, stop, uninstall, debug, doctor" }
}
