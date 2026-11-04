$ErrorActionPreference = "Stop"
$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$toolsZip = Join-Path $env:TEMP "android-cmdline-tools.zip"
$toolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-12266719_latest.zip"
$latest = Join-Path $sdk "cmdline-tools\latest"

New-Item -ItemType Directory -Force -Path $sdk | Out-Null

if (-not (Test-Path (Join-Path $latest "bin\sdkmanager.bat"))) {
  Write-Host "Downloading Android command-line tools..."
  curl.exe -L --fail --retry 3 -o $toolsZip $toolsUrl
  $extract = Join-Path $env:TEMP "android-cmdline-tools"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $toolsZip -DestinationPath $extract -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $sdk "cmdline-tools") | Out-Null
  if (Test-Path $latest) { Remove-Item $latest -Recurse -Force }
  $inner = Join-Path $extract "cmdline-tools"
  Move-Item $inner $latest
}

$sdkManager = Join-Path $latest "bin\sdkmanager.bat"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Host "Installing platforms;android-35 build-tools;35.0.0 platform-tools"
cmd /c "yes | `"$sdkManager`" --sdk_root=$sdk --licenses"
& $sdkManager --sdk_root=$sdk "platforms;android-35" "build-tools;35.0.0" "platform-tools"
Write-Host "SDK ready at $sdk"
