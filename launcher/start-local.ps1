param([switch]$NoBrowser,[switch]$CheckOnly,[switch]$Rebuild,[ValidateRange(1024,65535)][int]$Port=8089)
$ErrorActionPreference='Stop'
$started=[Diagnostics.Stopwatch]::StartNew()
$projectRoot=Split-Path -Parent $PSScriptRoot
$backendRoot=Join-Path $projectRoot 'backend'
$frontendRoot=Join-Path $projectRoot 'frontend'
$cacheRoot=Join-Path $PSScriptRoot '.cache'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
$statePath=Join-Path $cacheRoot 'build-state.json'
$state=@{}
if(Test-Path -LiteralPath $statePath) {
  try { $saved=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json; foreach($property in $saved.PSObject.Properties) { $state[$property.Name]=$property.Value } } catch {}
}
function Get-Fingerprint([string[]]$Paths) {
  $files=foreach($item in $Paths) {
    if(Test-Path -LiteralPath $item -PathType Container) { Get-ChildItem -LiteralPath $item -Recurse -File }
    elseif(Test-Path -LiteralPath $item -PathType Leaf) { Get-Item -LiteralPath $item }
  }
  $entries=foreach($file in ($files | Sort-Object FullName)) { $file.FullName+':'+(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
  $hasher=[Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($entries -join [Environment]::NewLine))))).Replace('-','') } finally { $hasher.Dispose() }
}
function Save-State {
  $temporary=Join-Path $cacheRoot 'build-state.tmp'
  $state | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $statePath -Force
}
function Find-Instance([int]$Candidate) {
  try { $health=Invoke-RestMethod -Uri "http://127.0.0.1:$Candidate/api/health" -TimeoutSec 1; return $health.application -eq 'pressflow' } catch { return $false }
}
function Open-Existing([int]$Candidate) {
  $url="http://127.0.0.1:$Candidate"
  Write-Host "PressFlow is already running: $url" -ForegroundColor Green
  if(!$NoBrowser -and !$CheckOnly) { Start-Process $url }
}
if(!$Rebuild -and (Find-Instance $Port)) { Open-Existing $Port; return }
$mutexHasher=[Security.Cryptography.SHA256]::Create()
try { $mutexId=([BitConverter]::ToString($mutexHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-','').Substring(0,20) } finally { $mutexHasher.Dispose() }
$mutex=New-Object Threading.Mutex($false,("Local\PressFlowLaunch-"+$mutexId))
$ownsMutex=$false
$process=$null
try {
  Write-Host 'Checking PressFlow...' -ForegroundColor Cyan
  try { $ownsMutex=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex=$true }
  if(!$ownsMutex) {
    Write-Host 'Another launcher is preparing this project. Waiting for it to finish...'
    try { $ownsMutex=$mutex.WaitOne(120000) } catch [Threading.AbandonedMutexException] { $ownsMutex=$true }
    if(!$ownsMutex) { throw 'Another startup is still running. Check its terminal for progress.' }
  }
  $requestedPort=$Port; $availablePort=$null
  foreach($candidatePort in $requestedPort..([Math]::Min(65535,$requestedPort+20))) {
    if(Find-Instance $candidatePort) {
      if($Rebuild) { throw "PressFlow is running on $candidatePort. Close its launcher before forcing a rebuild." }
      Open-Existing $candidatePort; return
    }
    $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$candidatePort)
    try { $listener.ExclusiveAddressUse=$true; $listener.Start(); $availablePort=$candidatePort; break } catch {} finally { $listener.Stop() }
  }
  if($null -eq $availablePort) { throw 'No free local port was found. Run this script with -Port 18089.' }
  $Port=$availablePort
  if($Port -ne $requestedPort) { Write-Host "Port $requestedPort is occupied. Using $Port automatically." }
  $compiler=Get-Command javac.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  $candidates=@($env:JAVA_HOME)
  if($compiler) { $candidates+=Split-Path -Parent (Split-Path -Parent $compiler.Source) }
  $javaPath=$null
  foreach($candidate in $candidates) {
    if(!$candidate) { continue }
    $javaCandidate=Join-Path $candidate 'bin/java.exe'; $javacCandidate=Join-Path $candidate 'bin/javac.exe'
    if((Test-Path -LiteralPath $javaCandidate) -and (Test-Path -LiteralPath $javacCandidate)) {
      $version=& $javacCandidate -version
      if($version -match '^javac (17|21|25)(\.|$)') { $env:JAVA_HOME=$candidate; $javaPath=$javaCandidate; break }
    }
  }
  if(!$javaPath) { throw 'JDK 17, 21, or 25 is required. Set JAVA_HOME or put javac on PATH.' }
  if(!(Test-Path -LiteralPath (Join-Path $frontendRoot 'package-lock.json'))) { throw 'The frontend is incomplete: package-lock.json is missing.' }
  $frontInputs=@('src','public','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts') | ForEach-Object { Join-Path $frontendRoot $_ }
  $frontendHash=Get-Fingerprint $frontInputs
  $backendHash=Get-Fingerprint @((Join-Path $backendRoot 'pom.xml'),(Join-Path $backendRoot 'src/main'))
  $lockHash=(Get-FileHash -LiteralPath (Join-Path $frontendRoot 'package-lock.json') -Algorithm SHA256).Hash
  $index=Join-Path $frontendRoot 'dist/index.html'
  $jar=Join-Path $backendRoot 'target/pressflow-1.0.0.jar'
  $needsFrontend=$Rebuild -or !(Test-Path -LiteralPath $index) -or $state.frontend -ne $frontendHash
  $needsBackend=$Rebuild -or !(Test-Path -LiteralPath $jar) -or $state.backend -ne $backendHash
  if($needsFrontend) {
    $npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
    if(!$npm) { throw 'Install Node.js 24 or newer to build React.' }
    Push-Location -LiteralPath $frontendRoot
    try {
      if(!(Test-Path -LiteralPath 'node_modules/.bin/vite.cmd') -or $state.dependencies -ne $lockHash) {
        Write-Host 'Installing locked dependencies (needed only after dependency changes)...'
        & $npm.Source ci --no-fund --no-audit
        if($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        $state.dependencies=$lockHash; Save-State
      }
      Write-Host 'Building the changed React frontend...'
      & $npm.Source run build
      if($LASTEXITCODE -ne 0) { throw 'Frontend build failed. Fix the reported error before restarting.' }
      $state.frontend=$frontendHash; Save-State
    } finally { Pop-Location }
  } else { Write-Host 'Frontend unchanged: using the cached production build.' }
  if($needsBackend) {
    $maven=Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if(!$maven) { throw 'Maven 3.9 or newer is required when backend source changes.' }
    Write-Host 'Building the changed Java backend...'
    Push-Location -LiteralPath $backendRoot
    try {
      & $maven.Source --batch-mode -DskipTests package
      if($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
      $state.backend=$backendHash; Save-State
    } finally { Pop-Location }
  } else { Write-Host 'Backend unchanged: using the cached application JAR.' }
  # Extract nested libraries once: subsequent starts avoid slow random JAR reads on G:.
  $jarHash=(Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash
  $runtimeRoot=Join-Path $env:LOCALAPPDATA ('PressFlow\'+$mutexId+'\'+$jarHash.Substring(0,16))
  $applicationRoot=Join-Path $runtimeRoot 'application'
  $runtimeJar=Join-Path $applicationRoot 'application.jar'
  if(!(Test-Path -LiteralPath $runtimeJar)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $cachedJar=Join-Path $runtimeRoot 'application.jar'
    Copy-Item -LiteralPath $jar -Destination $cachedJar -Force
    Write-Host 'Preparing the faster local Java runtime (once per backend change)...'
    & $javaPath '-Djarmode=tools' -jar $cachedJar extract --destination $applicationRoot
    if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $runtimeJar)) { throw 'Java runtime preparation failed. Check the extraction error above.' }
  }
  $env:PRESSFLOW_PORT="$Port"; $env:PRESSFLOW_HOST='127.0.0.1'
  $env:PRESSFLOW_FRONTEND=Join-Path $frontendRoot 'dist'
  if(!$env:PRESSFLOW_DATABASE) { $env:PRESSFLOW_DATABASE=Join-Path $backendRoot 'data/pressflow.sqlite' }
  $databaseParent=Split-Path -Parent ([IO.Path]::GetFullPath($env:PRESSFLOW_DATABASE))
  New-Item -ItemType Directory -Path $databaseParent -Force | Out-Null
  $logRoot=Join-Path ([IO.Path]::GetTempPath()) ('pressflow-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $logRoot | Out-Null
  Write-Host 'Starting frontend and backend together...'
  $process=Start-Process -FilePath $javaPath -ArgumentList @('-jar','application.jar') -WorkingDirectory $applicationRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'server.log') -RedirectStandardError (Join-Path $logRoot 'server.err.log')
  $url="http://127.0.0.1:$Port"; $ready=$false; $deadline=[DateTime]::UtcNow.AddSeconds(100)
  do {
    if($process.HasExited) { throw "Java stopped before startup completed. Logs: $logRoot" }
    if(Find-Instance $Port) { $ready=$true; break }
    Start-Sleep -Milliseconds 300
  } while([DateTime]::UtcNow -lt $deadline)
  if(!$ready) { throw "Startup timed out. Inspect $logRoot" }
  Write-Host ("PressFlow ready in {0:N1}s: {1}" -f $started.Elapsed.TotalSeconds,$url) -ForegroundColor Green
  Write-Host "Logs: $logRoot"
  $mutex.ReleaseMutex(); $ownsMutex=$false
  if($CheckOnly) { return }
  if(!$NoBrowser) { Start-Process $url }
  Write-Host 'Keep this terminal open. Ctrl+C stops this instance.'
  while(!$process.HasExited) { Start-Sleep -Seconds 1 }
  throw "PressFlow stopped. Logs: $logRoot"
} finally {
  if($process -and !$process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue; $process.WaitForExit(5000) | Out-Null }
  if($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
