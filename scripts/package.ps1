$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $Root "dist"
$JarPath = Join-Path $DistDir "KaramonLauncher.jar"

& (Join-Path $PSScriptRoot "compile.ps1")
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

$JarExe = $null
$Command = Get-Command jar -ErrorAction SilentlyContinue
if ($Command) {
    $JarExe = $Command.Source
}

if (-not $JarExe) {
    $Javac = Get-Command javac -ErrorAction SilentlyContinue
    if ($Javac) {
        $Candidate = Join-Path (Split-Path -Parent $Javac.Source) "jar.exe"
        if (Test-Path $Candidate) {
            $JarExe = $Candidate
        }
    }
}

if (-not $JarExe) {
    $JarExe = Get-ChildItem "C:\Program Files\Java", "C:\Program Files\Oracle" -Recurse -Filter "jar.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $JarExe) {
    throw "jar.exe introuvable. Installe un JDK complet pour generer le .jar."
}

& $JarExe --create --file $JarPath --main-class fr.karamon.launcher.KaramonLauncher -C (Join-Path $Root "build\classes") .
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Jar genere: $JarPath"
