param(
  [string]$VideoFolder,
  [string]$DataFolder = "$PSScriptRoot\data",
  [switch]$BlockYouTube,
  [switch]$RestoreYouTube
)
$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot\windows\YouTubeBlock.psm1" -Force
if ($RestoreYouTube) {
  Restore-MusicSearchYouTube
  return
}
if (-not $VideoFolder) { throw 'Informe -VideoFolder com a pasta dos vídeos.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale o Node.js 22 ou superior antes de iniciar.' }
if (-not (Test-Path -LiteralPath $VideoFolder -PathType Container)) { throw 'A pasta de vídeos não existe.' }
$env:KARAOKE_DIR = (Resolve-Path -LiteralPath $VideoFolder).Path
$env:DATA_DIR = $DataFolder
Push-Location $PSScriptRoot
$youtubeLock = $null
try {
  if (-not (Test-Path 'node_modules\exceljs') -or -not (Test-Path 'node_modules\qrcode')) {
    & npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências.' }
  }
  if ($BlockYouTube) { $youtubeLock = Enable-MusicSearchYouTubeBlock }
  & node server.js
  if ($LASTEXITCODE -ne 0) { throw 'O serviço não pôde iniciar. Confira a mensagem acima.' }
} finally {
  try { if ($null -ne $youtubeLock) { Disable-MusicSearchYouTubeBlock -Lock $youtubeLock } }
  finally { Pop-Location }
}
