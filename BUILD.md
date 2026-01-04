# Build Instructions

This document provides instructions for building the **Auto Sorter** Firefox Extension from source.

## Prerequisites

1.  **Operating System**: Windows 10/11 (Script is PowerShell)
2.  **Software**:
    *   [7-Zip](https://www.7-zip.org/) must be installed.
    *   The build script looks for `7z.exe` in `C:\Program Files\7-Zip\` or in your system PATH.

## Build Steps

1.  Open PowerShell in the project root directory.
2.  Run the build script:
    ```powershell
    .\build.ps1
    ```
3.  The script will:
    *   Verify 7-Zip is available.
    *   Create a clean zip archive (e.g., `ff-auto-sorter-1.2.zip`).
    *   **Exclude** the `tests/` directory and development artifacts (`.git`, `*.ps1`, etc.) as per submission requirements.

## Output

The final package will be a `.zip` file in the root directory, ready for upload to Mozilla Add-ons.
