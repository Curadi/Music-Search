$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
foreach ($file in @("$repo/windows/Launcher.ps1", "$repo/windows/Bootstrap.psm1")) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw ($errors | Out-String) }
}
Import-Module "$repo/windows/Bootstrap.psm1" -Force -DisableNameChecking
$module = Get-Module Bootstrap
$root = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
[System.IO.Directory]::CreateDirectory($root) | Out-Null
try {
  & $module {
    param($Root)
    foreach ($version in @('v22.0.0', 'v24.19.0')) { if (-not (Test-NodeVersion $version)) { throw 'Versão compatível recusada.' } }
    foreach ($version in @('v20.0.0', 'invalid')) { if (Test-NodeVersion $version) { throw 'Versão inválida aceita.' } }
    $archive = Join-Path $Root 'archive.zip'
    [System.IO.File]::WriteAllText($archive, 'pacote de teste')
    $correct = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    Assert-ArchiveChecksum $archive $correct
    $rejected = $false
    try { Assert-ArchiveChecksum $archive ('0' * 64) } catch { $rejected = $true }
    if (-not $rejected) { throw 'Pacote com checksum incorreto foi aceito.' }
    if ((Get-PinnedNodeChecksum 'x64') -ne '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73') { throw 'Pin x64 alterado.' }
    if ((Get-PinnedNodeChecksum 'arm64') -ne '8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f') { throw 'Pin ARM64 alterado.' }
  } $root
  $config = Join-Path $root 'config/settings.json'
  Save-MusicSearchSettings $config ([pscustomobject]@{ VideoFolder = 'D:\Vídeos com espaços'; Port = 3000; Custom = 'preservar' })
  $saved = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($saved.VideoFolder -ne 'D:\Vídeos com espaços') { throw 'Caminho não preservado.' }
  $saved.Port = 4000
  Save-MusicSearchSettings $config $saved
  $saved = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($saved.Port -ne 4000 -or $saved.Custom -ne 'preservar') { throw 'Configuração não atualizada corretamente.' }
  if (@(Get-ChildItem -LiteralPath (Split-Path $config -Parent) -Filter '*.tmp').Count -ne 0) { throw 'Arquivo temporário remanescente.' }
  Write-Host 'Bootstrap: sintaxe válida; versões compatíveis; checksum obrigatório; pins oficiais; configuração persistida com espaços e acentos; atualização atômica.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
