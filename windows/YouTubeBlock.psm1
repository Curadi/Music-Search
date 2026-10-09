$ErrorActionPreference = 'Stop'
$script:MarkerStart = "`r`n# MUSICSEARCH_YOUTUBE_BLOCK_BEGIN`r`n"
$script:MarkerEnd = "# MUSICSEARCH_YOUTUBE_BLOCK_END`r`n"
# Latin-1 is used as a reversible byte mapping to preserve the existing hosts encoding.
$script:ByteEncoding = [System.Text.Encoding]::GetEncoding(28591)
$script:Domains = @(
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'studio.youtube.com', 'gaming.youtube.com', 'youtu.be', 'www.youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtubei.googleapis.com',
  'youtube.googleapis.com', 'www.youtube.googleapis.com'
)

function Assert-Administrator {
  if ($env:OS -ne 'Windows_NT') { throw 'O bloqueio do YouTube requer Windows.' }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como administrador para bloquear ou restaurar o YouTube.'
  }
}

function Get-HostsFile {
  Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
}

function Get-BlockRange([string]$Text) {
  $start = $Text.IndexOf($script:MarkerStart, [StringComparison]::Ordinal)
  $end = $Text.IndexOf($script:MarkerEnd, [StringComparison]::Ordinal)
  if ($start -lt 0 -and $end -lt 0) { return $null }
  if ($start -lt 0 -or $end -lt $start -or
      $Text.IndexOf($script:MarkerStart, $start + 1, [StringComparison]::Ordinal) -ge 0 -or
      $Text.IndexOf($script:MarkerEnd, $end + 1, [StringComparison]::Ordinal) -ge 0) {
    throw 'O bloco Music Search no arquivo hosts foi alterado. Revise somente esse bloco antes de continuar; os outros dados foram preservados.'
  }
  return @{ Start = $start; Length = $end + $script:MarkerEnd.Length - $start }
}

function Edit-HostsBlock([bool]$Enable) {
  $hostsFile = Get-HostsFile
  # Exclusive access keeps read-modify-write from overwriting a concurrent edit.
  $stream = [System.IO.File]::Open($hostsFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  try {
    if ($stream.Length -gt 1048576) { throw 'Arquivo hosts acima de 1 MB; revise-o manualmente antes de continuar.' }
    $bytes = New-Object byte[] ([int]$stream.Length)
    $read = 0
    while ($read -lt $bytes.Length) {
      $count = $stream.Read($bytes, $read, $bytes.Length - $read)
      if ($count -eq 0) { throw 'Não foi possível ler todo o arquivo hosts.' }
      $read += $count
    }
    # Preserve the original file as a recoverable backup before the first alteration.
    $backup = "$hostsFile.musicsearch.original.bak"
    if (-not [System.IO.File]::Exists($backup)) { [System.IO.File]::WriteAllBytes($backup, $bytes) }
    $text = $script:ByteEncoding.GetString($bytes)
    if ($bytes.Length -ge 2 -and (($bytes[0] -eq 255 -and $bytes[1] -eq 254) -or ($bytes[0] -eq 254 -and $bytes[1] -eq 255))) {
      throw 'Hosts em UTF-16 não é compatível com este auxiliar. Nenhuma alteração foi feita.'
    }
    $range = Get-BlockRange $text
    if ($null -ne $range) { $text = $text.Remove($range.Start, $range.Length) }
    if ($Enable) {
      $block = $script:MarkerStart
      foreach ($domain in $script:Domains) { $block += "0.0.0.0 $domain`r`n::1 $domain`r`n" }
      $text += $block + $script:MarkerEnd
    }
    $updated = $script:ByteEncoding.GetBytes($text)
    $stream.Position = 0
    $stream.Write($updated, 0, $updated.Length)
    $stream.SetLength($updated.Length)
    $stream.Flush($true)
  } finally { $stream.Dispose() }
}

function Get-ExclusiveLock {
  $mutex = New-Object System.Threading.Mutex($false, 'Global\MusicSearchYouTubeBlock')
  try {
    $acquired = $false
    try { $acquired = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Já existe uma sessão com bloqueio ativo. Encerre essa sessão antes de iniciar ou restaurar.' }
    return $mutex
  } catch { $mutex.Dispose(); throw }
}

function Update-DnsCache {
  & "$env:SystemRoot\System32\ipconfig.exe" /flushdns | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Não foi possível limpar o cache DNS. Feche e abra o navegador.' }
}

function Enable-MusicSearchYouTubeBlock {
  Assert-Administrator
  $lock = Get-ExclusiveLock
  try {
    Edit-HostsBlock $true
    Update-DnsCache
    Write-Host 'Bloqueio local do YouTube ativado. Feche e abra o navegador; vídeos já carregados podem continuar.'
    Write-Host 'Encerre com Ctrl+C para restaurar. Não feche a janela nem finalize o processo à força.'
    return $lock
  } catch {
    try { Edit-HostsBlock $false } catch { Write-Warning 'Revise o bloco MUSICSEARCH_YOUTUBE no arquivo hosts ou execute -RestoreYouTube como administrador.' }
    $lock.ReleaseMutex()
    $lock.Dispose()
    throw
  }
}

function Disable-MusicSearchYouTubeBlock($Lock) {
  try {
    Edit-HostsBlock $false
    Update-DnsCache
    Write-Host 'Bloco do Music Search removido. Regras anteriores do computador foram preservadas.'
  } finally { $Lock.ReleaseMutex(); $Lock.Dispose() }
}

function Restore-MusicSearchYouTube {
  Assert-Administrator
  $lock = Get-ExclusiveLock
  Disable-MusicSearchYouTubeBlock -Lock $lock
}

Export-ModuleMember -Function Enable-MusicSearchYouTubeBlock, Disable-MusicSearchYouTubeBlock, Restore-MusicSearchYouTube
