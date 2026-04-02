$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git command failed: git $($Args -join ' ')"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $repoRoot "frontend\dist"

if (!(Test-Path $distPath)) {
  throw "Build output not found: $distPath"
}

$originUrl = (& git -C $repoRoot config --get remote.origin.url).Trim()
if ([string]::IsNullOrWhiteSpace($originUrl)) {
  throw "Git remote origin.url not found."
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "hackaton-gh-pages"

if (Test-Path $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  Copy-Item -Path (Join-Path $distPath "*") -Destination $tempRoot -Recurse -Force
  New-Item -ItemType File -Path (Join-Path $tempRoot ".nojekyll") -Force | Out-Null

  Invoke-Git -C $tempRoot init
  Invoke-Git -C $tempRoot checkout -b gh-pages
  Invoke-Git -C $tempRoot add .

  Invoke-Git -C $tempRoot -c user.name="Deploy Bot" -c user.email="deploy@example.com" commit -m "Deploy GitHub Pages"

  Invoke-Git -C $tempRoot remote add origin $originUrl
  Invoke-Git -C $tempRoot push --force origin HEAD:gh-pages

  Write-Host "GitHub Pages branch updated successfully." -ForegroundColor Green
} finally {
  if (Test-Path $tempRoot) {
    try {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction Stop
    } catch {
      Write-Warning "Temporary deploy folder could not be fully removed: $tempRoot"
    }
  }
}
