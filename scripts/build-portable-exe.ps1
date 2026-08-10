param(
    [string]$OutputDir = "",
    [string]$BuildPython = "",
    [switch]$SkipFrontendBuild,
    [switch]$SkipNuitkaCheck,
    [switch]$SkipEnvironmentArchive,
    [switch]$UseExistingCore
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Resolve-NodeExecutable([string]$ProjectRoot) {
    $candidates = @(
        (Join-Path $ProjectRoot "node\node.exe"),
        (Join-Path $ProjectRoot "runtime\node\node.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        return $nodeCommand.Source
    }

    throw "Node.js was not found. Install Node.js or place a portable runtime at node/node.exe or runtime/node/node.exe."
}

function Resolve-BuildPython([string]$ProjectRoot, [string]$RequestedPath) {
    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        if (-not (Test-Path -LiteralPath $RequestedPath)) {
            throw "Requested build Python was not found: $RequestedPath"
        }
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $packagingPython = Join-Path $ProjectRoot ".packaging-tools\py311\Scripts\python.exe"
    if (Test-Path -LiteralPath $packagingPython) {
        return (Resolve-Path -LiteralPath $packagingPython).Path
    }

    $python311 = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0 -and $python311) {
        return $python311.Trim()
    }

    throw "Python 3.11 was not found. Create .packaging-tools\py311 or pass -BuildPython explicitly."
}

function Resolve-CSharpCompiler {
    $candidates = @(
        (Get-Command csc.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    throw "csc.exe was not found. The portable folder picker cannot be built."
}

function Resolve-MinGWToolchain {
    $gccRoot = Join-Path $env:LOCALAPPDATA "Nuitka\Nuitka\Cache\downloads\gcc\x86_64"
    $gccExe = Get-ChildItem -LiteralPath $gccRoot -Recurse -Filter gcc.exe -File -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -like "*\mingw64\bin" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName

    if (-not $gccExe) {
        throw "Nuitka's MinGW64 toolchain was not found after compilation: $gccRoot"
    }

    $windresExe = Join-Path (Split-Path $gccExe -Parent) "windres.exe"
    if (-not (Test-Path -LiteralPath $windresExe)) {
        throw "MinGW64 windres.exe was not found beside gcc.exe: $windresExe"
    }

    return [pscustomobject]@{
        Gcc = $gccExe
        Windres = $windresExe
    }
}

function Copy-NodeRuntime([string]$NodeExe, [string]$TargetDir) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Copy-Item -Path $NodeExe -Destination (Join-Path $TargetDir "node.exe") -Force

    $nodeDir = Split-Path $NodeExe -Parent
    Get-ChildItem -Path $nodeDir -Filter *.dll -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $TargetDir $_.Name) -Force
    }
}

function Get-NodeInclusionArgs([string]$NodeDir) {
    $result = @()
    Get-ChildItem -Path $NodeDir -File -ErrorAction Stop | ForEach-Object {
        $target = "runtime/node/{0}" -f $_.Name
        $result += "--include-data-file=$($_.FullName)=$target"
    }
    return $result
}

function Copy-WindowsRuntimeDlls([string]$PythonExe, [string]$TargetDir) {
    $pythonDir = Split-Path $PythonExe -Parent
    $pythonBasePrefix = (& $PythonExe -c "import sys; print(sys.base_prefix)").Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($pythonBasePrefix)) {
        throw "Unable to resolve the base Python runtime directory from: $PythonExe"
    }

    $sourceDirs = @(
        $pythonDir,
        $pythonBasePrefix,
        (Join-Path $pythonBasePrefix "DLLs")
    ) | Select-Object -Unique
    $dllNames = @(
        "vcruntime140.dll",
        "vcruntime140_1.dll"
    )

    foreach ($dllName in $dllNames) {
        $source = $sourceDirs |
            ForEach-Object { Join-Path $_ $dllName } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
        if ($source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $TargetDir $dllName) -Force
        }
    }
}

function Copy-DirectoryContents([string]$SourceDir, [string]$TargetDir) {
    if (-not (Test-Path $SourceDir)) {
        throw "Required runtime directory was not found: $SourceDir"
    }
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    & robocopy $SourceDir $TargetDir /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Failed to copy runtime directory: $SourceDir (exit code $LASTEXITCODE)"
    }
}

function Get-DirectorySnapshot([string]$SourceDir) {
    if (-not (Test-Path -LiteralPath $SourceDir)) {
        throw "Required environment directory was not found: $SourceDir"
    }

    $count = 0L
    $bytes = 0L
    $latestTicks = 0L
    Get-ChildItem -LiteralPath $SourceDir -File -Recurse -Force -ErrorAction Stop | ForEach-Object {
        $count++
        $bytes += $_.Length
        $ticks = $_.LastWriteTimeUtc.Ticks
        if ($ticks -gt $latestTicks) {
            $latestTicks = $ticks
        }
    }

    return [ordered]@{
        path = (Resolve-Path -LiteralPath $SourceDir).Path
        file_count = $count
        total_bytes = $bytes
        latest_write_ticks = $latestTicks
    }
}

function Get-EnvironmentArchiveSignature(
    [string]$PythonEnvironmentDir,
    [string]$RLibraryDir,
    [string]$RRuntimeDir,
    [string]$RequirementsPath,
    [string]$RRequirementsPath
) {
    $details = [ordered]@{
        format_version = 1
        python = Get-DirectorySnapshot -SourceDir $PythonEnvironmentDir
        r_library = Get-DirectorySnapshot -SourceDir $RLibraryDir
        r_runtime = Get-DirectorySnapshot -SourceDir $RRuntimeDir
        requirements_sha256 = (Get-FileHash -LiteralPath $RequirementsPath -Algorithm SHA256).Hash
        r_requirements_sha256 = (Get-FileHash -LiteralPath $RRequirementsPath -Algorithm SHA256).Hash
    }
    $json = $details | ConvertTo-Json -Depth 6 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $signature = ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace("-", "")
    } finally {
        $sha256.Dispose()
    }

    return [pscustomobject]@{
        signature = $signature
        details = $details
    }
}

function Add-DirectoryToEnvironmentArchive(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$SourceDir,
    [string]$ArchivePrefix
) {
    $sourceRoot = (Resolve-Path -LiteralPath $SourceDir).Path.TrimEnd("\")
    Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force -ErrorAction Stop | ForEach-Object {
        $relativePath = $_.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $entryName = $ArchivePrefix.TrimEnd("/") + "/" + $relativePath.Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $Archive,
            $_.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Fastest
        ) | Out-Null
    }
}

function New-ReusableEnvironmentArchive(
    [string]$PythonEnvironmentDir,
    [string]$RLibraryDir,
    [string]$RRuntimeDir,
    [string]$RequirementsPath,
    [string]$RRequirementsPath,
    [string]$ArchivePath,
    [string]$ManifestPath
) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $snapshot = Get-EnvironmentArchiveSignature `
        -PythonEnvironmentDir $PythonEnvironmentDir `
        -RLibraryDir $RLibraryDir `
        -RRuntimeDir $RRuntimeDir `
        -RequirementsPath $RequirementsPath `
        -RRequirementsPath $RRequirementsPath

    if ((Test-Path -LiteralPath $ArchivePath) -and (Test-Path -LiteralPath $ManifestPath)) {
        try {
            $previous = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($previous.signature -eq $snapshot.signature) {
                Write-Step "Reusing unchanged environment archive"
                return
            }
        } catch {
            Write-Host "Environment archive manifest is invalid; rebuilding it." -ForegroundColor Yellow
        }
    }

    Write-Step "Building reusable environment archive"
    $archiveDir = Split-Path $ArchivePath -Parent
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    $temporaryArchive = $ArchivePath + ".tmp"
    if (Test-Path -LiteralPath $temporaryArchive) {
        Remove-Item -LiteralPath $temporaryArchive -Force
    }

    $archive = [System.IO.Compression.ZipFile]::Open($temporaryArchive, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        Add-DirectoryToEnvironmentArchive -Archive $archive -SourceDir $PythonEnvironmentDir -ArchivePrefix ".venv"
        Add-DirectoryToEnvironmentArchive -Archive $archive -SourceDir $RLibraryDir -ArchivePrefix ".Rlib"
        Add-DirectoryToEnvironmentArchive -Archive $archive -SourceDir $RRuntimeDir -ArchivePrefix "runtime/R-4.5.3"
    } finally {
        $archive.Dispose()
    }

    Move-Item -LiteralPath $temporaryArchive -Destination $ArchivePath -Force
    $snapshot | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
}

function New-IcoFromPng([string]$PngPath, [string]$IcoPath) {
    Add-Type -AssemblyName System.Drawing

    $iconSizes = @(16, 32, 48, 64, 128, 256)
    $sourceImage = [System.Drawing.Image]::FromFile($PngPath)
    try {
        $frames = New-Object System.Collections.Generic.List[object]
        foreach ($iconSize in $iconSizes) {
            $bitmap = New-Object System.Drawing.Bitmap $iconSize, $iconSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                try {
                    $graphics.Clear([System.Drawing.Color]::Transparent)
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $graphics.DrawImage($sourceImage, 0, 0, $iconSize, $iconSize)
                } finally {
                    $graphics.Dispose()
                }

                $memoryStream = New-Object System.IO.MemoryStream
                try {
                    $bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
                    $frames.Add([pscustomobject]@{
                        Size = $iconSize
                        Data = $memoryStream.ToArray()
                    }) | Out-Null
                } finally {
                    $memoryStream.Dispose()
                }
            } finally {
                $bitmap.Dispose()
            }
        }
    } finally {
        $sourceImage.Dispose()
    }

    $fileStream = [System.IO.File]::Open($IcoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
        $writer = New-Object System.IO.BinaryWriter $fileStream
        try {
            $writer.Write([UInt16]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]$frames.Count)

            $offset = 6 + (16 * $frames.Count)
            foreach ($frame in $frames) {
                $dimension = if ($frame.Size -ge 256) { 0 } else { [byte]$frame.Size }
                $writer.Write([byte]$dimension)
                $writer.Write([byte]$dimension)
                $writer.Write([byte]0)
                $writer.Write([byte]0)
                $writer.Write([UInt16]1)
                $writer.Write([UInt16]32)
                $writer.Write([UInt32]$frame.Data.Length)
                $writer.Write([UInt32]$offset)
                $offset += $frame.Data.Length
            }

            foreach ($frame in $frames) {
                $writer.Write($frame.Data)
            }
        } finally {
            $writer.Dispose()
        }
    } finally {
        $fileStream.Dispose()
    }
}

function New-LauncherRcFile([string]$RcPath, [string]$IconPath) {
    $iconLiteral = $IconPath.Replace("\", "\\")
    @(
        '1 ICON "' + $iconLiteral + '"'
    ) | Set-Content -Path $RcPath -Encoding ASCII
}

function Copy-ExternalRuntime([string]$SourceDir, [string]$TargetDir) {
    if (-not (Test-Path $SourceDir)) {
        throw "CDXAgent directory was not found: $SourceDir"
    }

    if (Test-Path $TargetDir) {
        Remove-Item -Path $TargetDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

    $dirWhitelist = @(
        "bin",
        "codex-path",
        "codex-resources",
        "skills"
    )

    foreach ($entry in $dirWhitelist) {
        $sourcePath = Join-Path $SourceDir $entry
        if (Test-Path $sourcePath) {
            Copy-Item -Path $sourcePath -Destination (Join-Path $TargetDir $entry) -Recurse -Force
        }
    }

    $fileWhitelist = @(
        "codex-package.json",
        "config.toml"
    )

    foreach ($entry in $fileWhitelist) {
        $sourcePath = Join-Path $SourceDir $entry
        if (Test-Path $sourcePath) {
            Copy-Item -Path $sourcePath -Destination (Join-Path $TargetDir $entry) -Force
        }
    }

    Get-ChildItem -Path $TargetDir -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq "__pycache__" } |
        ForEach-Object {
            Remove-Item -Path $_.FullName -Recurse -Force
        }

    Write-PackagedConfigTemplate -TargetDir $TargetDir

    Get-ChildItem -Path $TargetDir -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        ForEach-Object {
            if (-not (Get-ChildItem -Path $_.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
                Remove-Item -Path $_.FullName -Force
            }
        }
}

function Write-PackagedConfigTemplate([string]$TargetDir) {
    # Release builds must never inherit the packager's active model, model list,
    # or credentials. Keep the seven supported provider definitions available for
    # first-run setup while resetting every user-specific value.
    $configPath = Join-Path $TargetDir "config.toml"
    @(
        "# Lmentor initial runtime configuration template.",
        "# Configure an API key and model from Provider Management after launch.",
        'model = ""',
        'approval_policy = "never"',
        'sandbox_mode = "danger-full-access"',
        'model_provider = "linkbus"',
        'provider_id = "linkbus"',
        'model_reasoning_effort = "medium"',
        'review_model = ""',
        'models = []',
        "",
        '["model_providers"]',
        '["model_providers"."linkbus"]',
        'name = "LinkBus"',
        'provider_id = "linkbus"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "pure_api"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://www.linkbus.net/v1"',
        "",
        '["model_providers"."lingshi"]',
        'name = "Lingshi"',
        'provider_id = "lingshi"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "pure_api"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://api.lingshi.chat/v1"',
        "",
        '["model_providers"."Infinity"]',
        'name = "Infinity"',
        'provider_id = "Infinity"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "mixed_api"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "http://192.69.93.161:8080"',
        "",
        '["model_providers"."juapi"]',
        'name = "JuAPI"',
        'provider_id = "juapi"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "pure_api"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://www.juapi.net/v1"',
        "",
        '["model_providers"."qiniu"]',
        'name = "Qiniu"',
        'provider_id = "qiniu"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "aggregate"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://api.qnaigc.com"',
        "",
        '["model_providers"."aionly"]',
        'name = "AIOnly"',
        'provider_id = "aionly"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "aggregate"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://api.aiionly.com"',
        "",
        '["model_providers"."siliconflow"]',
        'name = "SiliconFlow"',
        'provider_id = "siliconflow"',
        'wire_api = "responses"',
        'protocol = "responses"',
        'mode = "aggregate"',
        'model = ""',
        'models = []',
        'reasoning_effort = "medium"',
        'base_url = "https://api.siliconflow.cn"'
    ) | Set-Content -Path $configPath -Encoding utf8

    # Never copy the packager's credentials. A new release always starts with
    # an empty auth file, while the editable provider template remains in config.toml.
    "{}" | Set-Content -Path (Join-Path $TargetDir "auth.json") -Encoding utf8
}

function Trim-PackagedSkills([string]$SkillsRoot) {
    if (-not (Test-Path $SkillsRoot)) {
        return
    }

    $trimDirs = @(".github", "docs", "tests", "evals", "examples")
    foreach ($name in $trimDirs) {
        Get-ChildItem -Path $SkillsRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq $name } |
            ForEach-Object {
                Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
    }

    Get-ChildItem -Path $SkillsRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq ".lmentor-skill-source.json" -or $_.Name -eq ".gitattributes" -or $_.Name -eq ".gitleaks.toml" } |
        ForEach-Object {
            Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
        }
}

$projectRoot = Resolve-ProjectRoot
$frontendRoot = Join-Path $projectRoot "frontend-shell"
$mainPy = Join-Path $projectRoot "main.py"
$launcherSource = Join-Path $projectRoot "scripts\portable-launcher.c"
$folderPickerSource = Join-Path $projectRoot "scripts\folder-picker\LmentorFolderPicker.cs"
$bridgeScript = Join-Path $frontendRoot "scripts\lmentor-codex-bridge.mjs"
$pythonDependencyInstaller = Join-Path $projectRoot "scripts\ensure_python_package.py"
$rDependencyInstaller = Join-Path $projectRoot "scripts\ensure_r_package.R"
$utf8Writer = Join-Path $projectRoot "scripts\write_utf8_file.ps1"
$distDir = Join-Path $frontendRoot "dist"
$cdxAgentDir = Join-Path $projectRoot "CDXAgent"
$projectVenvDir = Join-Path $projectRoot ".venv"
$projectRlibDir = Join-Path $projectRoot ".Rlib"
$installedRDir = "C:\Program Files\R\R-4.5.3"
$appIconPng = "C:\Users\A\Pictures\155.png"
$pythonExe = Resolve-BuildPython -ProjectRoot $projectRoot -RequestedPath $BuildPython
$nodeExe = Resolve-NodeExecutable -ProjectRoot $projectRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "build\portable"
}

$outputDirResolved = $OutputDir
$releaseDir = Join-Path $outputDirResolved "Lmentor"
$releaseCoreDir = Join-Path $releaseDir "core"
$buildWorkDir = Join-Path $outputDirResolved "_nuitka-build"
$environmentCacheDir = Join-Path $outputDirResolved "_environment-cache"
$environmentArchiveCache = Join-Path $environmentCacheDir "Lmentor-Environment.zip"
$environmentManifest = Join-Path $environmentCacheDir "Lmentor-Environment.manifest.json"
$portableZip = Join-Path $outputDirResolved "Lmentor-Portable.zip"
$stagingDir = Join-Path $projectRoot ".packaging"
$stagingNodeDir = Join-Path $stagingDir "runtime\node"
$stagingIconIco = Join-Path $stagingDir "app-icon.ico"
$stagingLauncherRc = Join-Path $stagingDir "portable-launcher.rc"
$stagingLauncherRes = Join-Path $stagingDir "portable-launcher.res.obj"
$stagingFolderPickerExe = Join-Path $stagingDir "LmentorFolderPicker.exe"
$iconVersionStamp = (Get-Date).ToString("yyyyMMddHHmmss")
$releaseIconName = "app-icon-$iconVersionStamp.ico"

Write-Step "Project root: $projectRoot"
Write-Step "Output dir: $outputDirResolved"
Write-Step "Build Python: $pythonExe"

if (-not $SkipFrontendBuild) {
    Write-Step "Building frontend dist"
    Push-Location $frontendRoot
    try {
        & npm.cmd run build
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $distDir)) {
    throw "Frontend dist directory was not found: $distDir"
}

if (-not (Test-Path $bridgeScript)) {
    throw "Bridge script was not found: $bridgeScript"
}

if (-not (Test-Path $launcherSource)) {
    throw "Launcher source was not found: $launcherSource"
}

if (-not (Test-Path $folderPickerSource)) {
    throw "Folder picker source was not found: $folderPickerSource"
}

if (-not $SkipNuitkaCheck) {
    Write-Step "Checking Nuitka"
    & $pythonExe -m nuitka --version | Out-Null
}

Write-Step "Preparing vendored Node runtime"
if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}
Copy-NodeRuntime -NodeExe $nodeExe -TargetDir $stagingNodeDir

if (-not (Test-Path $appIconPng)) {
    throw "App icon source was not found: $appIconPng"
}

Write-Step "Generating Windows app icon"
New-IcoFromPng -PngPath $appIconPng -IcoPath $stagingIconIco
New-LauncherRcFile -RcPath $stagingLauncherRc -IconPath ((Resolve-Path $stagingIconIco).Path)

Write-Step "Compiling native folder picker"
$csharpCompiler = Resolve-CSharpCompiler
& $csharpCompiler `
    /nologo `
    /target:exe `
    /optimize+ `
    /platform:anycpu `
    "/out:$stagingFolderPickerExe" `
    /r:System.dll `
    /r:System.Core.dll `
    /r:System.Drawing.dll `
    /r:System.Windows.Forms.dll `
    $folderPickerSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $stagingFolderPickerExe)) {
    throw "Folder picker build failed with exit code $LASTEXITCODE."
}
$folderPickerSelfTest = Start-Process -FilePath $stagingFolderPickerExe -ArgumentList "--self-test" -Wait -PassThru
if ($folderPickerSelfTest.ExitCode -ne 0) {
    throw "Folder picker self-test failed with exit code $($folderPickerSelfTest.ExitCode)."
}

if ($UseExistingCore) {
    Write-Step "Reusing existing Nuitka core"
    if (-not (Test-Path (Join-Path $buildWorkDir "Lmentor-core.exe"))) {
        throw "UseExistingCore was requested but no completed core exists: $buildWorkDir\\Lmentor-core.exe"
    }
} else {
    Write-Step "Running Nuitka onefile build"
    New-Item -ItemType Directory -Path $outputDirResolved -Force | Out-Null
    if (Test-Path $buildWorkDir) {
        Remove-Item -Path $buildWorkDir -Recurse -Force
    }

    $nodeInclusionArgs = Get-NodeInclusionArgs -NodeDir $stagingNodeDir
    if (-not $nodeInclusionArgs -or $nodeInclusionArgs.Count -eq 0) {
        throw "No Node runtime files were prepared for Nuitka inclusion."
    }

    $nuitkaArgs = @(
        "-m", "nuitka",
        "--onefile",
        "--standalone",
        "--mingw64",
        "--lto=no",
        "--assume-yes-for-downloads",
        "--remove-output",
        "--windows-console-mode=force",
        "--windows-icon-from-ico=$stagingIconIco",
        "--output-dir=$buildWorkDir",
        "--output-filename=Lmentor-core.exe",
        "--include-data-dir=$distDir=frontend-shell/dist",
        "--include-data-file=$bridgeScript=frontend-shell/scripts/lmentor-codex-bridge.mjs",
        "--include-data-file=$pythonDependencyInstaller=scripts/ensure_python_package.py",
        "--include-data-file=$rDependencyInstaller=scripts/ensure_r_package.R",
        "--include-data-file=$utf8Writer=scripts/write_utf8_file.ps1"
    ) + $nodeInclusionArgs + @(
        $mainPy
    )

    & $pythonExe @nuitkaArgs
}

Write-Step "Preparing release layout"
if (Test-Path $releaseDir) {
    Remove-Item -Path $releaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
New-Item -ItemType Directory -Path $releaseCoreDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseDir "tools") -Force | Out-Null

$builtExe = Join-Path $buildWorkDir "Lmentor-core.exe"
if (-not (Test-Path $builtExe)) {
    throw "Build result was not found: $builtExe"
}

Copy-Item -Path $builtExe -Destination (Join-Path $releaseCoreDir "Lmentor-core.exe") -Force
Copy-Item -Path $stagingFolderPickerExe -Destination (Join-Path $releaseDir "tools\LmentorFolderPicker.exe") -Force
Copy-WindowsRuntimeDlls -PythonExe $pythonExe -TargetDir $releaseCoreDir
Copy-ExternalRuntime -SourceDir $cdxAgentDir -TargetDir (Join-Path $releaseDir "CDXAgent")
if ($SkipEnvironmentArchive) {
    Write-Step "Skipping optional Python and R environment archive"
} else {
    New-ReusableEnvironmentArchive `
        -PythonEnvironmentDir $projectVenvDir `
        -RLibraryDir $projectRlibDir `
        -RRuntimeDir $installedRDir `
        -RequirementsPath (Join-Path $projectRoot "requirements.txt") `
        -RRequirementsPath (Join-Path $projectRoot "r-requirements.txt") `
        -ArchivePath $environmentArchiveCache `
        -ManifestPath $environmentManifest
    Copy-Item -LiteralPath $environmentArchiveCache -Destination (Join-Path $releaseDir "Lmentor-Environment.zip") -Force
}
Copy-Item -Path (Join-Path $projectRoot "requirements.txt") -Destination (Join-Path $releaseDir "requirements.txt") -Force
Copy-Item -Path (Join-Path $projectRoot "r-requirements.txt") -Destination (Join-Path $releaseDir "r-requirements.txt") -Force
Copy-Item -Path $stagingIconIco -Destination (Join-Path $releaseDir "app-icon.ico") -Force
Copy-Item -Path $stagingIconIco -Destination (Join-Path $releaseDir $releaseIconName) -Force
Copy-Item -Path (Join-Path $projectRoot "1554.png") -Destination (Join-Path $releaseDir "1554.png") -Force
Trim-PackagedSkills -SkillsRoot (Join-Path $releaseDir "CDXAgent\skills")

Write-Step "Compiling native launcher"
$launcherExe = Join-Path $releaseDir "Lmentor.exe"
$mingw = Resolve-MinGWToolchain
& $mingw.Windres -i $stagingLauncherRc -o $stagingLauncherRes -O coff
if ($LASTEXITCODE -ne 0) {
    throw "MinGW64 resource compilation failed with exit code $LASTEXITCODE."
}
& $mingw.Gcc -Os -march=x86-64 -mtune=generic -municode -o $launcherExe $launcherSource $stagingLauncherRes
if ($LASTEXITCODE -ne 0) {
    throw "MinGW64 launcher compilation failed with exit code $LASTEXITCODE."
}
if (-not (Test-Path $launcherExe)) {
    throw "Launcher executable was not created: $launcherExe"
}

$readmePath = Join-Path $releaseDir "START.txt"
@(
    "Lmentor portable build",
    "",
    "1. Double-click Lmentor.exe to launch the app.",
    "2. CDXAgent\\config.toml, auth.json, and skills remain outside the exe in this folder.",
    "3. core\\Lmentor-core.exe is the packed runtime launched by Lmentor.exe.",
    "4. CDXAgent stays external by design so model config and skills remain editable.",
    "5. Python and Node.js are checked by the installer. Optional analysis environments can be added separately.",
    "6. Rebuild from source with scripts\\build-portable-exe.ps1."
) | Set-Content -Path $readmePath -Encoding UTF8

Write-Step "Creating portable zip"
if (Test-Path -LiteralPath $portableZip) {
    Remove-Item -LiteralPath $portableZip -Force
}
$releaseItems = Get-ChildItem -LiteralPath $releaseDir -Force | Select-Object -ExpandProperty FullName
Compress-Archive -Path $releaseItems -DestinationPath $portableZip -CompressionLevel NoCompression -Force

Write-Step "Done"
Write-Host "Release dir: $releaseDir" -ForegroundColor Green
Write-Host "Portable zip: $portableZip" -ForegroundColor Green
