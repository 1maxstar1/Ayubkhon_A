# From nothing to running, on Windows, in one paste into PowerShell:
#
#   irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex
#
# Downloads the program as a ZIP (no Git, no Node), puts it in C:\Smeta, and
# starts it with server\laptop.ps1. Running it again over an existing install
# is an update: over an install that updates itself it simply runs that
# install's own update (the new version beside the old, tried before it is
# kept); over an older one it copies the newest listed release in. The price
# memory lives in %LOCALAPPDATA%\Taqqoslash, not in C:\Smeta, so nothing in it
# is touched.
#
# Kept to plain ASCII without a byte-order mark: it arrives through
# Invoke-RestMethod as a string, and Windows PowerShell 5.1 would carry a BOM
# into Invoke-Expression as a stray first character. Everything is inside one
# script block, so the settings below do not stay behind in the person's
# PowerShell window, and nothing here calls exit, which under iex would close
# that window.
& {
  $ErrorActionPreference = 'Stop'
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

  $dir = 'C:\Smeta'
  if ($env:TAQ_DIR) { $dir = $env:TAQ_DIR }
  $exe = 'powershell.exe'
  try { $exe = (Get-Process -Id $PID).Path } catch {}
  $ps1 = Join-Path (Join-Path $dir 'server') 'laptop.ps1'

  # Already installed, with a launcher that updates itself (it answers
  # selftest): the new version goes in the way every update does - beside the
  # old one, tried before it is kept - and nothing here is copied over it.
  if (Test-Path $ps1) {
    $answer = ''
    try { $answer = [string](& $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 selftest 2>&1) } catch {}
    if ($answer -match 'selftest ok') {
      Write-Host "Dastur allaqachon o'rnatilgan ($dir) - yangi versiya o'zi orqali olinadi."
      if ($env:TAQ_NOSTART -eq '1') { return }
      & $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 update
      Write-Host ""
      & $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 doctor
      return
    }
  }

  # The newest release in server/releases.txt - the same list the program
  # updates itself from. The branch itself only for a first install while the
  # list has no release yet; a list that cannot be read stops everything.
  $url = 'https://github.com/1maxstar1/Ayubkhon_A/archive/refs/heads/claude/excel-price-validation-5ehbvb.zip'
  if (-not $env:TAQ_ZIP) {
    $list = $null
    for ($try = 0; $try -lt 3 -and $null -eq $list; $try++) {
      try { $list = [string](Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri 'https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/claude/excel-price-validation-5ehbvb/server/releases.txt').Content } catch { Start-Sleep -Seconds 3 }
    }
    if ($null -eq $list -or $list -notmatch 'releases') { throw "Relizlar ro'yxatini olib bo'lmadi - birozdan keyin qayta urinib ko'ring. Hech narsa o'zgartirilmadi." }
    $best = $null
    foreach ($line in ($list -split "`n")) {
      $m = [regex]::Match($line, '^\s*v(\d+\.\d+\.\d+)\s+([0-9a-fA-F]{7,40})\b')
      if ($m.Success -and (-not $best -or [version]$m.Groups[1].Value -gt $best.Num)) {
        $best = @{ Num = [version]$m.Groups[1].Value; Sha = $m.Groups[2].Value }
      }
    }
    if ($best) { $url = 'https://github.com/1maxstar1/Ayubkhon_A/archive/' + $best.Sha + '.zip'; Write-Host "Reliz: v$($best.Num)" }
    elseif (Test-Path $ps1) { throw "Ro'yxatda reliz yo'q - o'rnatilgan dastur o'zgartirilmadi." }
  }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('smeta-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp, $dir | Out-Null

  Write-Host "Dastur yuklanmoqda..."
  $zip = Join-Path $tmp 'smeta.zip'
  if ($env:TAQ_ZIP) { Copy-Item $env:TAQ_ZIP $zip }  # the test brings its own
  else { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip }
  $unz = Join-Path $tmp 'x'
  Expand-Archive -Path $zip -DestinationPath $unz -Force
  # GitHub puts everything inside one folder named after the branch.
  $top = Get-ChildItem -Path $unz -Directory | Select-Object -First 1
  Copy-Item -Path (Join-Path $top.FullName '*') -Destination $dir -Recurse -Force
  Remove-Item $tmp -Recurse -Force

  if (-not (Test-Path $ps1)) { throw "O'rnatish chala qoldi: $ps1 topilmadi" }
  Write-Host "O'rnatildi: $dir"
  Write-Host ""
  if ($env:TAQ_NOSTART -eq '1') { return }          # the test stops here
  & $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 start
  Write-Host ""
  # The diagnosis, every time: if the page still asks for an e-mail, this
  # window already says why.
  & $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 doctor
}
