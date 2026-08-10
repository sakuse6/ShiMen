param(
    [string]$PortableDir = "",
    [string]$PythonInstallerPath = "",
    [string]$NodeInstallerPath = "",
    [string]$BackgroundImagePath = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Resolve-CSharpCompiler {
    $candidates = @(
        (Get-Command csc.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    throw "csc.exe was not found on this system."
}

function Invoke-CSharpBuild {
    param(
        [string]$CompilerExe,
        [string[]]$CompilerArgs,
        [string]$FailureMessage
    )

    & $CompilerExe @CompilerArgs
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage + " Exit code: " + $LASTEXITCODE
    }
}

$projectRoot = Resolve-ProjectRoot

if ([string]::IsNullOrWhiteSpace($PortableDir)) {
    $PortableDir = Join-Path $projectRoot "build\portable\Lmentor"
}

if ([string]::IsNullOrWhiteSpace($PythonInstallerPath)) {
    $PythonInstallerPath = "G:\Download\python-3.11.9-amd64_2.exe"
}

if ([string]::IsNullOrWhiteSpace($NodeInstallerPath)) {
    $NodeInstallerPath = "G:\Download\node-v24.18.1-x64.msi"
}

if ([string]::IsNullOrWhiteSpace($BackgroundImagePath)) {
    $BackgroundImagePath = Join-Path $projectRoot "1554.png"
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "build\installer"
}

$portableDirResolved = (Resolve-Path $PortableDir).Path
$pythonInstallerResolved = (Resolve-Path $PythonInstallerPath).Path
$nodeInstallerResolved = (Resolve-Path $NodeInstallerPath).Path
$backgroundImageResolved = (Resolve-Path $BackgroundImagePath).Path
$outputDirResolved = $OutputDir
$compilerExe = Resolve-CSharpCompiler
$stagingDir = Join-Path $projectRoot ".packaging\wizard-installer"
$portableMirrorDir = Join-Path $stagingDir "portable-root"
$payloadZip = Join-Path $stagingDir "Lmentor-payload.zip"
$sourceFile = Join-Path $projectRoot "scripts\installer\LmentorSetupApp.cs"
$uninstallerSource = Join-Path $projectRoot "scripts\installer\UninstallApp.cs"
$uninstallerTarget = Join-Path $portableDirResolved "uninstall.exe"
$portableZip = Join-Path (Split-Path $portableDirResolved -Parent) "Lmentor-Portable.zip"
$targetExe = Join-Path $outputDirResolved "Lmentor-Setup.exe"
$iconPath = Join-Path $projectRoot ".packaging\app-icon.ico"

Write-Step "Project root: $projectRoot"
Write-Step "Portable dir: $portableDirResolved"
Write-Step "Python installer: $pythonInstallerResolved"
Write-Step "Node.js installer: $nodeInstallerResolved"
Write-Step "Background image: $backgroundImageResolved"
Write-Step "Output dir: $outputDirResolved"

if (-not (Test-Path $portableDirResolved)) {
    throw "Portable release directory was not found: $portableDirResolved"
}

if (-not (Test-Path $pythonInstallerResolved)) {
    throw "Bundled Python installer was not found: $pythonInstallerResolved"
}

if (-not (Test-Path $nodeInstallerResolved)) {
    throw "Bundled Node.js installer was not found: $nodeInstallerResolved"
}

if (-not (Test-Path $backgroundImageResolved)) {
    throw "Installer background image was not found: $backgroundImageResolved"
}

if (-not (Test-Path $sourceFile)) {
    throw "Installer application source file was not found: $sourceFile"
}

if (-not (Test-Path $uninstallerSource)) {
    throw "Uninstaller application source file was not found: $uninstallerSource"
}

Write-Step "Compiling uninstaller"
if (Test-Path $uninstallerTarget) {
    Remove-Item -Path $uninstallerTarget -Force
}

$uninstallerArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$uninstallerTarget",
    "/resource:$backgroundImageResolved,Lmentor.BackgroundImage",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll"
)

if (Test-Path $iconPath) {
    $uninstallerArgs += "/win32icon:$iconPath"
}

$uninstallerArgs += $uninstallerSource

Invoke-CSharpBuild -CompilerExe $compilerExe -CompilerArgs $uninstallerArgs -FailureMessage "Uninstaller build failed."

if (-not (Test-Path $uninstallerTarget)) {
    throw "Uninstaller build failed: $uninstallerTarget was not created."
}

Write-Step "Running uninstaller self-test"
$uninstallerProcess = Start-Process -FilePath $uninstallerTarget -ArgumentList "--self-test" -Wait -PassThru
if ($uninstallerProcess.ExitCode -ne 0) {
    throw "Uninstaller self-test failed with exit code $($uninstallerProcess.ExitCode)."
}

Write-Step "Refreshing portable zip"
if (Test-Path -LiteralPath $portableZip) {
    Remove-Item -LiteralPath $portableZip -Force
}
$portableItemsForZip = Get-ChildItem -LiteralPath $portableDirResolved -Force | Select-Object -ExpandProperty FullName
Compress-Archive -Path $portableItemsForZip -DestinationPath $portableZip -CompressionLevel NoCompression -Force

Write-Step "Preparing installer staging"
if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
New-Item -ItemType Directory -Path $portableMirrorDir -Force | Out-Null
New-Item -ItemType Directory -Path $outputDirResolved -Force | Out-Null

Write-Step "Mirroring portable release into staging"
$mirrorExitCodes = @(0, 1, 2, 3)
& robocopy $portableDirResolved $portableMirrorDir /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -notin $mirrorExitCodes) {
    throw "Robocopy failed while mirroring the portable release. Exit code: $LASTEXITCODE"
}

Write-Step "Creating payload zip"
$portableItems = Get-ChildItem -LiteralPath $portableMirrorDir -Force | Select-Object -ExpandProperty FullName
if (-not $portableItems -or $portableItems.Count -eq 0) {
    throw "Portable mirror directory is empty: $portableMirrorDir"
}
Compress-Archive -Path $portableItems -DestinationPath $payloadZip -CompressionLevel NoCompression -Force

Write-Step "Compiling wizard installer"
if (Test-Path $targetExe) {
    Remove-Item -Path $targetExe -Force
}

$compilerArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$targetExe",
    "/resource:$payloadZip,Lmentor.PayloadZip",
    "/resource:$pythonInstallerResolved,Lmentor.PythonInstaller",
    "/resource:$nodeInstallerResolved,Lmentor.NodeInstaller",
    "/resource:$backgroundImageResolved,Lmentor.BackgroundImage",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll"
)

if (Test-Path $iconPath) {
    $compilerArgs += "/win32icon:$iconPath"
}

$compilerArgs += $sourceFile

Invoke-CSharpBuild -CompilerExe $compilerExe -CompilerArgs $compilerArgs -FailureMessage "Installer build failed."

if (-not (Test-Path $targetExe)) {
    throw "Installer build failed: $targetExe was not created."
}

Write-Step "Running self-test"
$process = Start-Process -FilePath $targetExe -ArgumentList "--self-test" -Wait -PassThru
if ($process.ExitCode -ne 0) {
    throw "Installer self-test failed with exit code $($process.ExitCode)."
}

Write-Step "Done"
Write-Host "Installer: $targetExe" -ForegroundColor Green
