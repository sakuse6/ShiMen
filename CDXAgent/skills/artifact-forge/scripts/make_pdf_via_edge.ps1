param(
  [Parameter(Mandatory = $true)]
  [string]$InputHtml,
  [Parameter(Mandatory = $true)]
  [string]$OutputPdf
)

$ErrorActionPreference = "Stop"

function Resolve-BrowserPath {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  throw "No supported Edge or Chrome browser was found for PDF export."
}

$browser = Resolve-BrowserPath
$inputPath = (Resolve-Path $InputHtml).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputPdf)
$outputDir = Split-Path $outputPath -Parent
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$inputUri = [System.Uri]::new($inputPath).AbsoluteUri
$args = @(
  "--headless=new",
  "--disable-gpu",
  "--print-to-pdf=$outputPath",
  $inputUri
)

$process = Start-Process -FilePath $browser -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) {
  throw "Browser PDF export failed with exit code: $($process.ExitCode)"
}
if (-not (Test-Path $outputPath)) {
  throw "Browser process finished but no PDF was created: $outputPath"
}

Write-Output $outputPath
