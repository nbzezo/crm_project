$ErrorActionPreference = "SilentlyContinue"

$projectPath = $PSScriptRoot
$webUrl = "http://localhost:5173"
$apiUrl = "http://localhost:3001/api/health"

function Test-WorkFlowEndpoint {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

$apiReady = Test-WorkFlowEndpoint -Url $apiUrl
$webReady = Test-WorkFlowEndpoint -Url $webUrl

if (-not $apiReady -and -not $webReady) {
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $projectPath -WindowStyle Hidden
}
elseif (-not $apiReady) {
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "-w", "server") -WorkingDirectory $projectPath -WindowStyle Hidden
}
elseif (-not $webReady) {
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "-w", "client") -WorkingDirectory $projectPath -WindowStyle Hidden
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-WorkFlowEndpoint -Url $webUrl) {
        Start-Process $webUrl
        exit 0
    }

    Start-Sleep -Seconds 1
}

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "WorkFlow khong the khoi dong. Hay kiem tra Node.js va thu lai.",
    "WorkFlow",
    "OK",
    "Error"
) | Out-Null
exit 1
