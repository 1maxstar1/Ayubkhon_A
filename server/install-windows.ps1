# From nothing to running, on Windows, in one paste into PowerShell:
#
#   irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex
#
# Downloads the program as a ZIP (no Git, no Node), puts it in C:\Smeta, and
# starts it with server\laptop.ps1. Running it again over an existing install
# is an update: the price memory lives in %LOCALAPPDATA%\Taqqoslash, not in
# C:\Smeta, so nothing in it is touched.
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
  $url = 'https://github.com/1maxstar1/Ayubkhon_A/archive/refs/heads/claude/excel-price-validation-5ehbvb.zip'
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

  $ps1 = Join-Path (Join-Path $dir 'server') 'laptop.ps1'
  if (-not (Test-Path $ps1)) { throw "O'rnatish chala qoldi: $ps1 topilmadi" }
  Write-Host "O'rnatildi: $dir"
  Write-Host ""
  if ($env:TAQ_NOSTART -eq '1') { return }          # the test stops here
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 start
  Write-Host ""
  # The diagnosis, every time: if the page still asks for an e-mail, this
  # window already says why.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 doctor
}
