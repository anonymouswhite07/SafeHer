$body = '{"phone":"+916381716235","message":"SafeHer test alert"}'
$headers = @{ "Content-Type" = "application/json" }

try {
    $response = Invoke-WebRequest `
        -Uri "https://safeher-c7ad.onrender.com/send-alert" `
        -Method POST `
        -Headers $headers `
        -Body $body

    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "HTTP Error: $statusCode"
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $errorBody = $reader.ReadToEnd()
    Write-Host "Error body: $errorBody"
}
