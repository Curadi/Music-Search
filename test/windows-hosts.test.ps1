$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
foreach ($file in @("$repo/start-windows.ps1", "$repo/windows/YouTubeBlock.psm1")) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw ($errors | Out-String) }
}
Import-Module "$repo/windows/YouTubeBlock.psm1" -Force
$module = Get-Module YouTubeBlock
$root = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
[System.IO.Directory]::CreateDirectory($root) | Out-Null
try {
  & $module {
    param($Root)
    $script:TestHostsPath = Join-Path $Root 'hosts'
    function script:Get-HostsFile { return $script:TestHostsPath }
    function Assert-Bytes([byte[]]$Expected, [byte[]]$Actual) {
      if ([Convert]::ToBase64String($Expected) -ne [Convert]::ToBase64String($Actual)) { throw 'Os bytes do arquivo hosts foram alterados indevidamente.' }
    }
    $original = [System.Text.Encoding]::UTF8.GetBytes("# Configuração pré-existente`r`n127.0.0.1 localhost")
    [System.IO.File]::WriteAllBytes($script:TestHostsPath, $original)
    Edit-HostsBlock $true
    $blocked = [System.IO.File]::ReadAllText($script:TestHostsPath)
    if (-not $blocked.Contains('0.0.0.0 www.youtube.com') -or -not $blocked.Contains('::1 youtube.com')) { throw 'Bloqueio IPv4/IPv6 ausente.' }
    Assert-Bytes $original ([System.IO.File]::ReadAllBytes("$script:TestHostsPath.musicsearch.original.bak"))
    Edit-HostsBlock $true
    $blocked = [System.IO.File]::ReadAllText($script:TestHostsPath)
    if ([regex]::Matches($blocked, 'MUSICSEARCH_YOUTUBE_BLOCK_BEGIN').Count -ne 1) { throw 'Bloco duplicado.' }
    $otherChange = [System.Text.Encoding]::UTF8.GetBytes("`r`n# Alteração de outra ferramenta`r`n10.0.0.1 interno.local`r`n")
    $stream = [System.IO.File]::Open($script:TestHostsPath, [System.IO.FileMode]::Append)
    try { $stream.Write($otherChange, 0, $otherChange.Length) } finally { $stream.Dispose() }
    Edit-HostsBlock $false
    Assert-Bytes ([byte[]]($original + $otherChange)) ([System.IO.File]::ReadAllBytes($script:TestHostsPath))
    Edit-HostsBlock $false
    Assert-Bytes ([byte[]]($original + $otherChange)) ([System.IO.File]::ReadAllBytes($script:TestHostsPath))
    $broken = [System.Text.Encoding]::UTF8.GetBytes("# original" + $script:MarkerStart + 'bloco incompleto')
    [System.IO.File]::WriteAllBytes($script:TestHostsPath, $broken)
    $rejected = $false
    try { Edit-HostsBlock $false } catch { $rejected = $true }
    if (-not $rejected) { throw 'Marcadores incompletos deveriam ser rejeitados.' }
    Assert-Bytes $broken ([System.IO.File]::ReadAllBytes($script:TestHostsPath))
    $utf16 = [byte[]](255, 254, 35, 0)
    [System.IO.File]::WriteAllBytes($script:TestHostsPath, $utf16)
    $rejected = $false
    try { Edit-HostsBlock $true } catch { $rejected = $true }
    if (-not $rejected) { throw 'UTF-16 deveria ser rejeitado.' }
    Assert-Bytes $utf16 ([System.IO.File]::ReadAllBytes($script:TestHostsPath))
  } $root
  Write-Host 'PowerShell: sintaxe válida; bloqueio e restauração em arquivo temporário; backup; edições externas preservadas; recuperação; marcadores inválidos e UTF-16 rejeitados.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
