$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BuildDir = Join-Path $Root "build\classes"
$SourcesFile = Join-Path $Root "build\sources.txt"

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SourcesFile) | Out-Null

$Sources = Get-ChildItem -Path (Join-Path $Root "src\main\java") -Recurse -Filter "*.java" | Sort-Object FullName | ForEach-Object { $_.FullName }
if (-not $Sources -or $Sources.Count -eq 0) {
    throw "Aucun fichier Java trouve."
}

[System.IO.File]::WriteAllText($SourcesFile, ($Sources -join [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
& javac -encoding UTF-8 -d $BuildDir "@$SourcesFile"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
