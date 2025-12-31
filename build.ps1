<#
.SYNOPSIS
    Builds the Firefox Extension .zip package using 7-Zip.

.DESCRIPTION
    This script bundles the necessary extension files into a zip archive for submission/installation.
    It deliberately excludes the 'tests' directory and development artifacts.

.NOTES
    Requires 7-Zip to be installed or '7z.exe' to be in the system PATH.
#>

$ErrorActionPreference = "Stop"

# --- Configuration ---
$ProjectName = "ff-auto-sorter"
$Version = (Get-Content "manifest.json" | ConvertFrom-Json).version
$OutputFile = "$ProjectName-$Version.zip"
$SevenZipPath = "$env:ProgramFiles\7-Zip\7z.exe"

# --- Locate 7-Zip ---
if (-not (Test-Path $SevenZipPath)) {
    # Check if in PATH
    if (Get-Command "7z" -ErrorAction SilentlyContinue) {
        $SevenZipPath = "7z"
    } else {
        Write-Error "7-Zip not found! Please install 7-Zip (https://www.7-zip.org/) or ensure 7z.exe is in your PATH."
    }
}

Write-Host "Using 7-Zip at: $SevenZipPath" -ForegroundColor Cyan
Write-Host "Building version: $Version" -ForegroundColor Cyan

# --- Cleanup ---
if (Test-Path $OutputFile) {
    Remove-Item $OutputFile -Force
    Write-Host "Removed old build: $OutputFile" -ForegroundColor Yellow
}

# --- Build Command ---
# -tzip: Type ZIP
# -mx9:  Ultra compression
# -r:    Recursive (careful with excludes)
# -x:    Exclude files/dirs

$ExcludeList = @(
    "tests",
    ".git",
    "*.zip",
    "*.ps1",
    "BUILD.md",
    "PRIVACY.md",
    "LICENSE",
    "README.md"
)

# Construct arguments for 7z
# Note: 7z exclude syntax is -x!path
$ExcludesArgs = $ExcludeList | ForEach-Object { "-x!$_" }

$Files = @(
    "manifest.json",
    "*.js",
    "*.html",
    "*.css",
    "icons",
    "_locales"
)

# We pass * to include everything, then exclude specific folders
# This ensures we don't miss new files, but requires careful exclusion
# Alternatively, we can specify list. 
# Let's specify exact wildcards to be safe and avoid including random things.
# However, the user might add files later.
# Standard practice: Include everything * except excludes.

Write-Host "Creating archive $OutputFile..." -ForegroundColor Cyan

$ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
$ProcessInfo.FileName = $SevenZipPath
# Argument syntax: a <archive_name> <files> <excludes>
$ProcessInfo.Arguments = "a -tzip -mx9 ""$OutputFile"" * $($ExcludesArgs -join ' ')"
$ProcessInfo.RedirectStandardOutput = $true
$ProcessInfo.UseShellExecute = $false

$Process = [System.Diagnostics.Process]::Start($ProcessInfo)
$Process.WaitForExit()

if ($Process.ExitCode -eq 0) {
    Write-Host "✅ Build Success! Created $OutputFile" -ForegroundColor Green
} else {
    Write-Error "❌ Build Failed with exit code $($Process.ExitCode)"
}
