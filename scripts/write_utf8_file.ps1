[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Text
)

$targetPath = [System.IO.Path]::GetFullPath($Path)
$parentPath = [System.IO.Path]::GetDirectoryName($targetPath)
if (-not [string]::IsNullOrWhiteSpace($parentPath)) {
    [System.IO.Directory]::CreateDirectory($parentPath) | Out-Null
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($targetPath, $Text, $utf8NoBom)
$written = [System.IO.File]::ReadAllText($targetPath, $utf8NoBom)
if ($written -cne $Text) {
    throw "UTF-8 写入校验失败：$targetPath"
}

Write-Output $targetPath
