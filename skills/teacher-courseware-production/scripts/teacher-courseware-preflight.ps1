param(
  [switch]$SkipBuild,
  [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
Push-Location $repo
try {
  function Invoke-NativeStep([string]$Name, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) {
      throw "teacher-courseware-preflight: $Name failed with exit code $LASTEXITCODE"
    }
  }

  Invoke-NativeStep 'lint' { npm run lint }
  Invoke-NativeStep 'material package regression' { node --experimental-strip-types scripts/teacher-material-package-regression.ts }
  Invoke-NativeStep 'subject visual policy regression' { node --experimental-strip-types scripts/teacher-subject-visual-policy-regression.ts }
  Invoke-NativeStep 'scene render regression' { node --experimental-strip-types scripts/teacher-render-scene-regression.ts }
  Invoke-NativeStep 'visual QA regression' { node --experimental-strip-types scripts/teacher-visual-qa-v2-regression.ts }
  Invoke-NativeStep 'dynamic page strategy regression' { node --experimental-strip-types scripts/teacher-dynamic-page-strategy-regression.mjs }
  if (-not $SkipBuild) { Invoke-NativeStep 'production build' { npm run build } }
  if (-not $SkipBrowser) {
    Invoke-NativeStep 'browser golden flow' { npm run teacher-two-subject-browser:e2e }
  }
  Write-Output 'teacher-courseware-preflight: PASS'
}
finally {
  Pop-Location
}
