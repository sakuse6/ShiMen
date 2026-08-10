param(
    [string]$UpdatePackageDir = "",
    [string]$BackgroundImagePath = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CSharpCompiler {
    $candidates = @(
        (Get-Command csc.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    throw "csc.exe was not found on this system."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($UpdatePackageDir)) { $UpdatePackageDir = Join-Path $projectRoot "build\update-1.1.0" }
if ([string]::IsNullOrWhiteSpace($BackgroundImagePath)) { $BackgroundImagePath = Join-Path $projectRoot "1554.png" }
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $projectRoot "build\update-installer" }

$updateDir = (Resolve-Path -LiteralPath $UpdatePackageDir).Path
$background = (Resolve-Path -LiteralPath $BackgroundImagePath).Path
$source = Join-Path $projectRoot "scripts\installer\LmentorUpdateSetupApp.cs"
$icon = Join-Path $projectRoot ".packaging\app-icon.ico"
$manifestPath = Join-Path $updateDir "update-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Update manifest was not found: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($manifest.version)) { throw "Update manifest does not declare a version." }
$archive = Join-Path $projectRoot (".packaging\Lmentor-Update-{0}-installer-payload.zip" -f $manifest.version)
$target = Join-Path $OutputDir ("ShiMen-Update-{0}-Setup.exe" -f $manifest.version)

foreach ($path in @($updateDir, $background, $source)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required build input was not found: $path" }
}

New-Item -ItemType Directory -Path (Split-Path -Parent $archive) -Force | Out-Null
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
$items = Get-ChildItem -LiteralPath $updateDir -Force | Select-Object -ExpandProperty FullName
Compress-Archive -Path $items -DestinationPath $archive -CompressionLevel Optimal -Force

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }

$arguments = @(
    "/nologo", "/target:winexe", "/optimize+", "/platform:anycpu", "/out:$target",
    "/resource:$archive,Lmentor.UpdateArchive",
    "/resource:$background,Lmentor.BackgroundImage",
    "/r:System.dll", "/r:System.Core.dll", "/r:System.Drawing.dll", "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll", "/r:System.IO.Compression.FileSystem.dll", "/r:System.Web.Extensions.dll",
    $source
)
if (Test-Path -LiteralPath $icon) { $arguments += "/win32icon:$icon" }

& (Resolve-CSharpCompiler) @arguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) { throw "Update installer compilation failed." }

$test = Start-Process -FilePath $target -ArgumentList "--self-test" -Wait -PassThru
if ($test.ExitCode -ne 0) { throw "Update installer self-test failed with exit code $($test.ExitCode)." }

Write-Host "Update installer: $target" -ForegroundColor Green
