param(
    [string]$BaselineDir,
    [string]$ReleaseDir,
    [string]$OutputDir,
    [string[]]$ReleaseNotes = @("Completed program update and integrity verification.")
)

$ErrorActionPreference = "Stop"

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Test-UpdatablePath([string]$RelativePath) {
    $normalized = $RelativePath.Replace('/', '\\')
    if ($normalized -in @("Lmentor.exe", "app-icon.ico", "1554.png", "START.txt", "requirements.txt", "r-requirements.txt", "uninstall.exe")) {
        return $true
    }
    return $normalized -match "^(core|tools|CDXAgent\\bin|CDXAgent\\codex-path|CDXAgent\\codex-resources)\\" -or $normalized -eq "CDXAgent\\codex-package.json"
}

foreach ($required in @($BaselineDir, $ReleaseDir, $OutputDir)) {
    if ([string]::IsNullOrWhiteSpace($required)) { throw "BaselineDir, ReleaseDir, and OutputDir are required." }
}

$baselineRoot = (Resolve-Path -LiteralPath $BaselineDir).Path
$releaseRoot = (Resolve-Path -LiteralPath $ReleaseDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $baselineRoot "Lmentor.exe"))) { throw "Baseline release is invalid." }
if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot "Lmentor.exe"))) { throw "Target release is invalid." }

if (Test-Path -LiteralPath $OutputDir) { Remove-Item -LiteralPath $OutputDir -Recurse -Force }
$payloadRoot = Join-Path $OutputDir "payload\files"
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

$releasePrefix = $releaseRoot.TrimEnd('\') + '\'
$files = @()
foreach ($file in Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Sort-Object FullName) {
    $relativePath = $file.FullName.Substring($releasePrefix.Length).Replace('\', '/')
    if (-not (Test-UpdatablePath $relativePath)) { continue }

    $targetHash = Get-Sha256 $file.FullName
    $baselinePath = Join-Path $baselineRoot $relativePath
    $baselineHash = if (Test-Path -LiteralPath $baselinePath) { Get-Sha256 $baselinePath } else { $null }
    if ($baselineHash -eq $targetHash) { continue }

    $payloadPath = Join-Path $payloadRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $payloadPath) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $payloadPath -Force
    $files += [pscustomobject]@{
        relativePath = $relativePath
        sha256 = $targetHash
        baselineSha256 = $baselineHash
        length = $file.Length
    }
}

if ($files.Count -eq 0) { throw "No permitted application files differ from the 1.0.0 baseline." }

$manifest = [pscustomobject]@{
    product = "ShiMen"
    version = "1.0.1"
    baselineVersion = "1.0.0"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    releaseNotes = @($ReleaseNotes)
    preserve = @(
        "CDXAgent/auth.json", "CDXAgent/config.toml", "CDXAgent/sessions/",
        "CDXAgent/archived_sessions/", "CDXAgent/lmentor-bridge-state.json",
        "CDXAgent/lmentor-runtime/", "CDXAgent/sqlite/", "CDXAgent/skills/",
        ".lmentor/", ".Rlib/", "logs/"
    )
    files = @($files)
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "update-manifest.json") -Encoding UTF8

@(
    "ShiMen 1.0.1 update package",
    "Only verified application files are included.",
    "User configuration, sessions, projects, skills, environments, and logs are preserved."
) | Set-Content -LiteralPath (Join-Path $OutputDir "README.txt") -Encoding UTF8

$zipPath = Join-Path (Split-Path -Parent $OutputDir) "Lmentor-Update-1.0.1.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$items = Get-ChildItem -LiteralPath $OutputDir -Force | Select-Object -ExpandProperty FullName
Compress-Archive -Path $items -DestinationPath $zipPath -CompressionLevel Optimal -Force

Write-Host "Changed files: $($files.Count)" -ForegroundColor Green
Write-Host "Package: $OutputDir" -ForegroundColor Green
Write-Host "Archive: $zipPath" -ForegroundColor Green
