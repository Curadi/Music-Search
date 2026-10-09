$ErrorActionPreference = 'Stop'
$script:NodeVersion = '24.19.0'
# Published by https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.
$script:NodeChecksums = @{
  x64 = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
  arm64 = '8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f'
}

function Test-NodeVersion([string]$Version) {
  return $Version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22
}

function Get-PinnedNodeChecksum([string]$Architecture) {
  if (-not $script:NodeChecksums.ContainsKey($Architecture)) { throw 'Use Windows 10/11 de 64 bits (x64 ou ARM64) ou instale Node.js 22+ manualmente.' }
  return $script:NodeChecksums[$Architecture]
}

function Assert-ArchiveChecksum([string]$Archive, [string]$Expected) {
  if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $Expected) {
    throw 'O checksum do Node.js não confere. O pacote não será executado. Confira a conexão e tente novamente.'
  }
}

function Ensure-MusicSearchNode([string]$ProjectRoot) {
  $command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $command) {
    try {
      $version = & $command.Source --version
      $nodeRoot = Split-Path $command.Source -Parent
      if ($LASTEXITCODE -eq 0 -and (Test-NodeVersion $version) -and (Test-Path -LiteralPath (Join-Path $nodeRoot 'npm.cmd'))) {
        return $command.Source
      }
    } catch { Write-Host 'O Node.js disponível não pôde ser utilizado; preparando uma versão portátil.' }
  }
  $architecture = $env:PROCESSOR_ARCHITEW6432
  if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
  switch ($architecture) {
    'AMD64' { $architecture = 'x64' }
    'ARM64' { $architecture = 'arm64' }
    default { $architecture = 'unsupported' }
  }
  $expected = Get-PinnedNodeChecksum $architecture
  $runtime = Join-Path $ProjectRoot '.runtime'
  $packageName = "node-v$script:NodeVersion-win-$architecture"
  $target = Join-Path $runtime $packageName
  $node = Join-Path $target 'node.exe'
  $marker = Join-Path $target '.verified-sha256'
  if (Test-Path -LiteralPath $target) {
    if (-not (Test-Path -LiteralPath $marker) -or [System.IO.File]::ReadAllText($marker).Trim() -ne $expected -or -not (Test-Path -LiteralPath $node)) {
      throw "A pasta portátil $target está incompleta ou não verificada. Preserve arquivos pessoais, remova somente essa pasta e tente novamente."
    }
    $version = & $node --version
    if ($LASTEXITCODE -ne 0 -or $version -ne "v$script:NodeVersion") { throw 'A versão portátil está danificada. Remova somente a pasta indicada em .runtime e tente novamente.' }
    return $node
  }
  [System.IO.Directory]::CreateDirectory($runtime) | Out-Null
  $staging = Join-Path $runtime ([guid]::NewGuid().ToString())
  [System.IO.Directory]::CreateDirectory($staging) | Out-Null
  try {
    Write-Host "Baixando Node.js $script:NodeVersion portátil do site oficial..."
    # TLS verification remains enabled. Nothing is installed system-wide.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $archive = Join-Path $staging "$packageName.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$script:NodeVersion/$packageName.zip" -OutFile $archive
    Assert-ArchiveChecksum $archive $expected
    Expand-Archive -LiteralPath $archive -DestinationPath $staging
    $extracted = Join-Path $staging $packageName
    $executable = Join-Path $extracted 'node.exe'
    $version = & $executable --version
    if ($LASTEXITCODE -ne 0 -or $version -ne "v$script:NodeVersion") { throw 'O Node.js portátil não iniciou. Confira a compatibilidade do Windows.' }
    [System.IO.File]::WriteAllText((Join-Path $extracted '.verified-sha256'), $expected)
    $runtimeFull = [IO.Path]::GetFullPath($runtime).TrimEnd('\') + '\'
    foreach ($candidate in @($extracted, $target)) {
      if (-not [IO.Path]::GetFullPath($candidate).StartsWith($runtimeFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho do runtime fora da pasta autorizada.' }
    }
    Move-Item -LiteralPath $extracted -Destination $target
    return $node
  } finally {
    $runtimeFull = [IO.Path]::GetFullPath($runtime).TrimEnd('\') + '\'
    if (-not [IO.Path]::GetFullPath($staging).StartsWith($runtimeFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho temporário fora da pasta do runtime.' }
    Remove-Item -LiteralPath $staging -Recurse -Force
  }
}

function Ensure-MusicSearchDependencies([string]$ProjectRoot, [string]$Node) {
  $runtime = Join-Path $ProjectRoot '.runtime'
  [System.IO.Directory]::CreateDirectory($runtime) | Out-Null
  $stamp = Join-Path $runtime 'dependencies.sha256'
  $signature = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot 'package.json') -Algorithm SHA256).Hash + ':' + (Get-FileHash -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Algorithm SHA256).Hash
  $installed = (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules/exceljs/package.json')) -and (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules/qrcode/package.json'))
  if ($installed -and (Test-Path -LiteralPath $stamp) -and [System.IO.File]::ReadAllText($stamp) -eq $signature) { return }
  Write-Host 'Preparando as dependências da aplicação (internet necessária na primeira execução)...'
  $npm = Join-Path (Split-Path $Node -Parent) 'npm.cmd'
  $cache = Join-Path $runtime 'npm-cache'
  Push-Location $ProjectRoot
  try {
    & $npm ci --omit=dev --ignore-scripts --no-fund --cache $cache
    if ($LASTEXITCODE -ne 0) { throw 'A instalação falhou. Confira a conexão com registry.npmjs.org e tente novamente. Os vídeos e sugestões foram preservados.' }
    [System.IO.File]::WriteAllText($stamp, $signature)
  } finally { Pop-Location }
}

function Convert-MusicSearchNetworkAddresses([string]$Json) {
  # Windows PowerShell 5.1 emits a JSON array as a single pipeline object.
  # Enumerate explicitly so .address always refers to an entry, never Array.Address().
  foreach ($entry in (ConvertFrom-Json -InputObject $Json)) {
    $parsed = $null
    if ($entry -isnot [pscustomobject] -or $entry.address -isnot [string] -or $entry.name -isnot [string] -or
        -not [Net.IPAddress]::TryParse($entry.address, [ref]$parsed) -or
        $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
      throw 'A lista de redes contém um endereço inválido.'
    }
    Write-Output $entry
  }
}

function Save-MusicSearchSettings([string]$File, $Settings) {
  $parent = Split-Path $File -Parent
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  $temporary = "$File.$([guid]::NewGuid()).tmp"
  try {
    [System.IO.File]::WriteAllText($temporary, ($Settings | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
    if (Test-Path -LiteralPath $File) {
      $backup = "$File.$([guid]::NewGuid()).bak"
      [System.IO.File]::Replace($temporary, $File, $backup)
      [System.IO.File]::Delete($backup)
    }
    else { [System.IO.File]::Move($temporary, $File) }
  } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

Export-ModuleMember -Function Ensure-MusicSearchNode, Ensure-MusicSearchDependencies, Save-MusicSearchSettings, Convert-MusicSearchNetworkAddresses
