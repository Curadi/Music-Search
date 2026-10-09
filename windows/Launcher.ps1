param([switch]$Configure, [switch]$OnlyQr, [switch]$RestoreYouTube, [switch]$Resume)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Este iniciador é exclusivo para Windows.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $PSScriptRoot 'Bootstrap.psm1') -Force -DisableNameChecking
$dataFolder = Join-Path $projectRoot 'data'
$settingsFile = Join-Path $dataFolder 'windows-settings.json'

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Restart-AsAdministrator([string]$Mode) {
  Write-Host 'O Windows pedirá permissão de administrador para alterar apenas o bloqueio local do YouTube.'
  $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" ' + $Mode
  $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw 'A sessão administrativa terminou com erro ou a autorização foi cancelada.' }
}

if ($RestoreYouTube) {
  if (-not (Test-Administrator)) { Restart-AsAdministrator '-RestoreYouTube'; return }
  & (Join-Path $projectRoot 'start-windows.ps1') -RestoreYouTube
  return
}

Write-Host ''
Write-Host 'Music Search - Catálogo de karaokê'
Write-Host ''
$settings = [pscustomobject]@{}
if (Test-Path -LiteralPath $settingsFile) {
  try { $settings = Get-Content -LiteralPath $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { throw "A configuração $settingsFile não pôde ser lida. Preserve o arquivo e corrija-o antes de continuar." }
  if ($null -eq $settings -or $settings -isnot [pscustomobject]) { throw 'Configuração inválida; preserve o arquivo antes de corrigir.' }
}
if (-not $OnlyQr -and ($Configure -or -not $settings.VideoFolder -or -not (Test-Path -LiteralPath $settings.VideoFolder -PathType Container))) {
  $folder = Read-Host 'Cole o caminho da pasta de vídeos (ex.: D:\Karaoke\Videos)'
  $folder = $folder.Trim().Trim('"')
  if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'A pasta de vídeos não existe. Execute novamente com o caminho correto.' }
  $folder = (Resolve-Path -LiteralPath $folder).Path
  $rootFull = [IO.Path]::GetFullPath($projectRoot)
  $folderFull = [IO.Path]::GetFullPath($folder).TrimEnd('\')
  if ($rootFull.Equals($folderFull, [StringComparison]::OrdinalIgnoreCase) -or $rootFull.StartsWith($folderFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Coloque o programa fora da pasta de vídeos para preservar a coleção.'
  }
  $settings | Add-Member -NotePropertyName VideoFolder -NotePropertyValue $folder -Force
}
if (-not $OnlyQr -and ($Configure -or $null -eq $settings.BlockYouTube)) {
  $answer = Read-Host 'Bloquear o YouTube neste computador durante o uso? Exige administrador (S/N)'
  if ($answer -notmatch '^[sSnN]$') { throw 'Responda S ou N. Execute novamente.' }
  $settings | Add-Member -NotePropertyName BlockYouTube -NotePropertyValue ($answer -match '^[sS]$') -Force
}
if (-not $OnlyQr) {
  if ($settings.VideoFolder -isnot [string] -or -not (Test-Path -LiteralPath $settings.VideoFolder -PathType Container)) { throw 'A pasta configurada não existe. Use configurar-music-search.bat.' }
  $videoFull = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $settings.VideoFolder).Path).TrimEnd('\')
  $rootFull = [IO.Path]::GetFullPath($projectRoot)
  if ($rootFull.Equals($videoFull, [StringComparison]::OrdinalIgnoreCase) -or $rootFull.StartsWith($videoFull + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Coloque o programa fora da pasta de vídeos.' }
  if ($settings.BlockYouTube -isnot [bool]) { throw 'BlockYouTube deve ser true ou false na configuração.' }
  # Elevation happens before dependency installation to prevent permissions mismatch.
  Save-MusicSearchSettings $settingsFile $settings
  if ($settings.BlockYouTube -and -not (Test-Administrator)) { Restart-AsAdministrator '-Resume'; return }
}

$node = Ensure-MusicSearchNode $projectRoot
$env:PATH = (Split-Path $node -Parent) + ';' + $env:PATH
Ensure-MusicSearchDependencies $projectRoot $node
$addressesJson = & $node (Join-Path $projectRoot 'scripts/export-qr.js') --list
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar os endereços de rede.' }
$addresses = @(Convert-MusicSearchNetworkAddresses ($addressesJson -join "`n"))
if ($addresses.Count -eq 0) { throw 'Conecte o computador à rede do bar e tente novamente. Nenhum IPv4 privado disponível.' }
$savedAddress = @($addresses | Where-Object { $_.address -eq $settings.PublicHost })
if ($addresses.Count -eq 1) { $chosen = $addresses[0].address }
elseif (-not $Configure -and $savedAddress.Count -eq 1) { $chosen = $savedAddress[0].address }
else {
  Write-Host 'Escolha o endereço da rede do bar. Evite VPNs e adaptadores virtuais:'
  for ($i = 0; $i -lt $addresses.Count; $i++) { Write-Host "$($i + 1). $($addresses[$i].address) [$($addresses[$i].name)]" }
  $answer = Read-Host 'Número da rede'
  $selection = 0
  if (-not [int]::TryParse($answer, [ref]$selection) -or $selection -lt 1 -or $selection -gt $addresses.Count) { throw 'Seleção inválida. Execute novamente.' }
  $chosen = $addresses[$selection - 1].address
}
if ($chosen -isnot [string] -or @($addresses | Where-Object { $_.address -ceq $chosen }).Count -eq 0) {
  throw 'O IP escolhido não corresponde a uma rede ativa. Execute configurar-music-search.bat.'
}
$settings | Add-Member -NotePropertyName PublicHost -NotePropertyValue $chosen -Force
if ($null -eq $settings.Port) { $settings | Add-Member -NotePropertyName Port -NotePropertyValue 3000 }
if ($settings.Port -isnot [int] -and $settings.Port -isnot [long]) { throw 'A porta configurada deve ser um número inteiro.' }
if ($settings.Port -lt 1 -or $settings.Port -gt 65535) { throw 'A porta deve estar entre 1 e 65535.' }
Save-MusicSearchSettings $settingsFile $settings
$env:PUBLIC_HOST = $chosen
$env:PORT = [string]$settings.Port
$env:HOST = '0.0.0.0'
$env:OPEN_BROWSER = '1'
if ($OnlyQr) {
  $output = Join-Path $dataFolder 'qr'
  $resultJson = & $node (Join-Path $projectRoot 'scripts/export-qr.js') --host $chosen --port $settings.Port --output $output
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível exportar o QR Code.' }
  $result = $resultJson | ConvertFrom-Json
  Write-Host "PNG para usar nas artes: $($result.pngFile)"
  Write-Host "Cartaz para imprimir: $($result.posterFile)"
  Write-Host 'O catálogo precisa estar em execução e o celular deve estar no Wi-Fi do bar.'
  Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $output + '"')
  return
}
Write-Host "Endereço para os celulares: http://$chosen`:$($settings.Port)/"
Write-Host "QR Code e cartaz serão salvos em $dataFolder\qr quando o serviço iniciar."
Write-Host 'Mantenha esta janela aberta. Encerre com Ctrl+C.'
& (Join-Path $projectRoot 'start-windows.ps1') -VideoFolder $settings.VideoFolder -DataFolder $dataFolder -BlockYouTube:$settings.BlockYouTube
