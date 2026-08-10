param(
    [string]$BaselineDir = "",
    [string]$ReleaseDir = "",
    [string]$OutputDir = "",
    [string]$Version = "",
    [string]$BaselineVersion = "1.0.0",
    [string[]]$ReleaseNotes = @("Completed program update and integrity verification.")
)

$ErrorActionPreference = "Stop"

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Test-UpdatablePath([string]$RelativePath) {
    $normalized = $RelativePath.Replace('/', '\')
    if ($normalized -in @("Lmentor.exe", "app-icon.ico", "1554.png", "START.txt", "requirements.txt", "r-requirements.txt", "uninstall.exe")) {
        return $true
    }
    return $normalized -match "^(core|tools|CDXAgent\\bin|CDXAgent\\codex-path|CDXAgent\\codex-resources)\\" -or $normalized -eq "CDXAgent\\codex-package.json"
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = Join-Path $projectRoot "build"
if ([string]::IsNullOrWhiteSpace($Version)) { throw "Version is required." }
if ([string]::IsNullOrWhiteSpace($BaselineDir)) { $BaselineDir = Join-Path $buildRoot "portable\Lmentor" }
if ([string]::IsNullOrWhiteSpace($ReleaseDir)) { $ReleaseDir = Join-Path $buildRoot ("release-{0}\Lmentor" -f $Version) }
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $buildRoot ("update-{0}" -f $Version) }

$baselineRoot = (Resolve-Path -LiteralPath $BaselineDir).Path
$releaseRoot = (Resolve-Path -LiteralPath $ReleaseDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $baselineRoot "Lmentor.exe"))) { throw "Baseline release is invalid: $baselineRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot "Lmentor.exe"))) { throw "Target release is invalid: $releaseRoot" }

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

if ($files.Count -eq 0) { throw "No permitted application files differ from the baseline release." }

$manifest = [pscustomobject]@{
    product = "ShiMen"
    version = $Version
    baselineVersion = $BaselineVersion
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
    "ShiMen $Version update payload",
    "Use scripts\\build-update-installer.ps1 to embed this payload into the single-file upgrade installer.",
    "Only verified application files are included; user data remains outside the payload."
) | Set-Content -LiteralPath (Join-Path $OutputDir "README.txt") -Encoding UTF8

$archive = Join-Path $buildRoot ("Lmentor-Update-{0}.zip" -f $Version)
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
$items = Get-ChildItem -LiteralPath $OutputDir -Force | Select-Object -ExpandProperty FullName
Compress-Archive -Path $items -DestinationPath $archive -CompressionLevel Optimal -Force

Write-Host "Changed files: $($files.Count)" -ForegroundColor Green
Write-Host "Update directory: $OutputDir" -ForegroundColor Green
Write-Host "Update archive: $archive" -ForegroundColor Green
