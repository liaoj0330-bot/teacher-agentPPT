param(
  [string]$VenvPath = ".venv-parser"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RequirementsPath = Join-Path $RepoRoot "requirements-parser.txt"
$VenvFullPath = Join-Path $RepoRoot $VenvPath

Write-Host "Sandun parser Python setup"
Write-Host "Repo: $RepoRoot"

if (-not (Test-Path -LiteralPath $RequirementsPath)) {
  throw "requirements-parser.txt not found: $RequirementsPath"
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
  throw "Python was not found on PATH. Install Python 3.10+ from https://www.python.org/downloads/ and re-run this script."
}

$pythonVersion = & $pythonCommand.Source --version 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Python exists but did not run successfully: $pythonVersion"
}
Write-Host "Python: $pythonVersion"

if (-not (Test-Path -LiteralPath $VenvFullPath)) {
  Write-Host "Creating parser virtual environment: $VenvFullPath"
  & $pythonCommand.Source -m venv $VenvFullPath
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create parser virtual environment at $VenvFullPath"
  }
} else {
  Write-Host "Reusing parser virtual environment: $VenvFullPath"
}

$VenvPython = Join-Path $VenvFullPath "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $VenvPython)) {
  throw "Virtual environment python.exe not found: $VenvPython"
}

Write-Host "Upgrading pip"
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "pip upgrade failed. Check network access and Python installation."
}

Write-Host "Installing parser requirements from requirements-parser.txt"
& $VenvPython -m pip install -r $RequirementsPath
if ($LASTEXITCODE -ne 0) {
  throw "Parser dependency installation failed. Check the package error above, proxy/network settings, or Python version."
}

Write-Host ""
Write-Host "Parser Python setup complete."
Write-Host "Use this runtime by setting PYTHON_BIN or let the app auto-detect:"
Write-Host "  `$env:PYTHON_BIN='$VenvPython'"
Write-Host "Then verify with:"
Write-Host "  npm run p1g:parser-check"
