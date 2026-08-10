[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:PayloadZip = Join-Path $PSScriptRoot "Lmentor-payload.zip"
$script:PythonInstaller = "G:\Download\python-3.11.9-amd64_2.exe"
$script:DefaultInstallDir = Join-Path $env:LOCALAPPDATA "Programs\Lmentor"
$script:LogPath = Join-Path $env:TEMP "LmentorInstaller.log"
$script:ProgressForm = $null
$script:ProgressLabel = $null

function Write-Log([string]$Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $script:LogPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Show-Info([string]$Message, [string]$Title = "Lmentor 安装程序") {
    Write-Log "INFO: $Message"
    [void][System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    )
}

function Show-ErrorAndExit([string]$Message, [int]$Code = 1) {
    Write-Log "ERROR: $Message"
    [void][System.Windows.Forms.MessageBox]::Show(
        $Message,
        "Lmentor 安装程序",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit $Code
}

function Confirm-Action([string]$Message, [string]$Title = "Lmentor 安装程序") {
    Write-Log "CONFIRM: $Message"
    $result = [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question
    )
    return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

function Test-Python311Installed {
    $checks = @(
        @{ FilePath = "py"; Args = @("-3.11", "-c", "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)") },
        @{ FilePath = "python"; Args = @("-c", "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)") }
    )

    foreach ($check in $checks) {
        try {
            $process = Start-Process -FilePath $check.FilePath -ArgumentList $check.Args -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop
            if ($process.ExitCode -eq 0) {
                return $true
            }
        } catch {
        }
    }

    return $false
}

function Show-ProgressWindow([string]$InitialText) {
    if ($script:ProgressForm -ne $null) {
        Update-ProgressWindow -Text $InitialText
        return
    }

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Lmentor 安装程序"
    $form.StartPosition = "CenterScreen"
    $form.Width = 520
    $form.Height = 170
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ControlBox = $false
    $form.TopMost = $true

    $label = New-Object System.Windows.Forms.Label
    $label.AutoSize = $false
    $label.Left = 20
    $label.Top = 22
    $label.Width = 460
    $label.Height = 48
    $label.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
    $label.Text = $InitialText

    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Left = 20
    $progressBar.Top = 84
    $progressBar.Width = 460
    $progressBar.Height = 20
    $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
    $progressBar.MarqueeAnimationSpeed = 30

    $hint = New-Object System.Windows.Forms.Label
    $hint.AutoSize = $false
    $hint.Left = 20
    $hint.Top = 112
    $hint.Width = 460
    $hint.Height = 20
    $hint.ForeColor = [System.Drawing.Color]::DimGray
    $hint.Text = "请勿关闭此窗口，安装流程结束后会自动进入下一步。"

    $form.Controls.Add($label)
    $form.Controls.Add($progressBar)
    $form.Controls.Add($hint)
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()

    $script:ProgressForm = $form
    $script:ProgressLabel = $label
    Write-Log "PROGRESS WINDOW OPEN: $InitialText"
}

function Update-ProgressWindow([string]$Text) {
    if ($script:ProgressLabel -eq $null -or $script:ProgressForm -eq $null) {
        return
    }

    $script:ProgressLabel.Text = $Text
    $script:ProgressForm.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
    Write-Log "PROGRESS: $Text"
}

function Close-ProgressWindow {
    if ($script:ProgressForm -ne $null) {
        Write-Log "PROGRESS WINDOW CLOSED"
        $script:ProgressForm.Close()
        $script:ProgressForm.Dispose()
        $script:ProgressForm = $null
        $script:ProgressLabel = $null
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Select-InstallDirectory {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "请选择 Lmentor 的安装目录"
    $dialog.SelectedPath = $script:DefaultInstallDir
    $dialog.ShowNewFolderButton = $true
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        return $null
    }
    return $dialog.SelectedPath
}

function Assert-SafeInstallDirectory([string]$InstallDir) {
    if ([string]::IsNullOrWhiteSpace($InstallDir)) {
        throw "安装目录不能为空。"
    }

    $fullPath = [System.IO.Path]::GetFullPath($InstallDir)
    $rootPath = [System.IO.Path]::GetPathRoot($fullPath)
    $trimChars = @([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    if ($fullPath.TrimEnd($trimChars) -eq $rootPath.TrimEnd($trimChars)) {
        throw "不能直接安装到磁盘根目录。"
    }

    return $fullPath
}

function Clear-InstallDirectory([string]$InstallDir) {
    if (-not (Test-Path -LiteralPath $InstallDir)) {
        return
    }

    Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
    }
}

function Expand-Payload([string]$ZipPath, [string]$InstallDir) {
    if (-not (Test-Path -LiteralPath $ZipPath)) {
        throw "安装载荷不存在：$ZipPath"
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $InstallDir)
}

function New-Shortcut([string]$ShortcutPath, [string]$TargetPath, [string]$WorkingDirectory, [string]$Description) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.Description = $Description
    $shortcut.IconLocation = $TargetPath
    $shortcut.Save()
}

function Create-Shortcuts([string]$InstallDir) {
    $appExe = Join-Path $InstallDir "Lmentor.exe"
    $timestampedIcon = Get-ChildItem -LiteralPath $InstallDir -Filter 'app-icon-*.ico' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    $appIcon = if ($timestampedIcon) { $timestampedIcon } else { Join-Path $InstallDir "app-icon.ico" }
    $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Lmentor.lnk"
    $startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Lmentor"
    $startMenuShortcut = Join-Path $startMenuDir "Lmentor.lnk"

    New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
    New-Shortcut -ShortcutPath $desktopShortcut -TargetPath $appExe -WorkingDirectory $InstallDir -Description "Lmentor"
    New-Shortcut -ShortcutPath $startMenuShortcut -TargetPath $appExe -WorkingDirectory $InstallDir -Description "Lmentor"

    if (Test-Path -LiteralPath $appIcon) {
        $shell = New-Object -ComObject WScript.Shell
        foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $shortcut.IconLocation = "$appIcon,0"
            $shortcut.Save()
        }
    }
}

function Ensure-PythonRuntime {
    if (Test-Python311Installed) {
        Show-Info "Lmentor 运行依赖 Python 3.11。已检测到本机存在可用 Python 3.11，安装程序将继续执行。"
        return
    }

    if (-not (Test-Path -LiteralPath $script:PythonInstaller)) {
        Show-ErrorAndExit "未找到随安装包附带的 Python 安装程序：`n$script:PythonInstaller"
    }

    $agreed = Confirm-Action @"
Lmentor 运行依赖 Python 3.11。

安装程序现在需要启动以下组件：
$([System.IO.Path]::GetFileName($script:PythonInstaller))

如果你不同意安装 Python，Lmentor 将无法继续安装。

是否继续？
"@

    if (-not $agreed) {
        exit 1602
    }

    Show-ProgressWindow "正在启动 Python 3.11 安装程序。`r`n请先在弹出的 Python 安装界面中完成安装，然后 Lmentor 安装会自动继续。"
    $process = Start-Process -FilePath $script:PythonInstaller -ArgumentList @("PrependPath=1", "Include_launcher=1") -Wait -PassThru
    Close-ProgressWindow
    if ($process.ExitCode -notin @(0, 1641, 3010)) {
        Show-ErrorAndExit "Python 安装未成功完成，安装程序将退出。`n退出代码：$($process.ExitCode)" $process.ExitCode
    }

    Show-Info "Python 安装流程已结束，Lmentor 安装将继续。"
}

try {
    Write-Log "INSTALLER START"
    if (-not (Test-Path -LiteralPath $script:PayloadZip)) {
        throw "安装载荷不存在：$script:PayloadZip"
    }

    $continueInstall = Confirm-Action @"
欢迎安装 Lmentor。

本安装程序会按以下顺序执行：
1. 检查 Python 3.11 运行环境
2. 如未安装，则启动随包附带的 Python 安装程序
3. 让你选择 Lmentor 的安装目录
4. 释放主程序并创建快捷方式

若你现在不想继续，可以直接退出。

是否开始安装？
"@

    if (-not $continueInstall) {
        exit 1602
    }

    Ensure-PythonRuntime

    $selectedDir = Select-InstallDirectory
    if (-not $selectedDir) {
        exit 1602
    }

    $installDir = Assert-SafeInstallDirectory -InstallDir $selectedDir

    if (Test-Path -LiteralPath $installDir) {
        $existingEntries = Get-ChildItem -LiteralPath $installDir -Force -ErrorAction SilentlyContinue
        if ($existingEntries.Count -gt 0) {
            $overwrite = Confirm-Action "目标目录已存在文件。继续安装将覆盖该目录中的现有内容。`n`n$installDir`n`n是否继续？"
            if (-not $overwrite) {
                exit 1602
            }
            Clear-InstallDirectory -InstallDir $installDir
        }
    }

    Show-Info "即将开始安装 Lmentor。`n`n安装目录：`n$installDir"

    Show-ProgressWindow "正在释放 Lmentor 主程序文件。"
    Expand-Payload -ZipPath $script:PayloadZip -InstallDir $installDir
    Update-ProgressWindow "正在创建桌面与开始菜单快捷方式。"
    Create-Shortcuts -InstallDir $installDir
    Close-ProgressWindow

    $launchNow = Confirm-Action "Lmentor 已安装完成。`n`n是否立即启动？"
    if ($launchNow) {
        Start-Process -FilePath (Join-Path $installDir "Lmentor.exe") -WorkingDirectory $installDir
    }

    Write-Log "INSTALLER FINISHED"
    exit 0
} catch {
    Close-ProgressWindow
    Show-ErrorAndExit ($_.Exception.Message)
}
