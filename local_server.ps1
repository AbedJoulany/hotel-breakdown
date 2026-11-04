$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$prefix = 'http://127.0.0.1:8000/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
    Write-Host ''
    Write-Host 'Hotel Group Audit is running locally.' -ForegroundColor Green
    Write-Host 'Open http://127.0.0.1:8000 in your browser.'
    Write-Host 'Your files are served from this folder; PDF processing happens in the browser.'
    Write-Host 'Keep this window open while using the app. Press Ctrl+C to stop.'
    Write-Host ''
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $path))
            if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $context.Response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
            } elseif (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            } else {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $mime = switch ($ext) {
                    '.html' { 'text/html; charset=utf-8' }
                    '.css'  { 'text/css; charset=utf-8' }
                    '.js'   { 'text/javascript; charset=utf-8' }
                    '.mjs'  { 'text/javascript; charset=utf-8' }
                    '.json' { 'application/json; charset=utf-8' }
                    '.svg'  { 'image/svg+xml' }
                    '.png'  { 'image/png' }
                    '.jpg'  { 'image/jpeg' }
                    '.jpeg' { 'image/jpeg' }
                    '.ico'  { 'image/x-icon' }
                    default { 'application/octet-stream' }
                }
                $context.Response.ContentType = $mime
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $context.Response.StatusCode = 200
            }
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            try {
                $context.Response.StatusCode = 500
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Local server error')
                $context.Response.ContentLength64 = $bytes.Length
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {}
        } finally {
            $context.Response.Close()
        }
    }
} catch {
    Write-Host 'Could not start the local server. Port 8000 may already be in use.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host 'Close any other Hotel Audit server window and try again.'
    Read-Host 'Press Enter to close'
} finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
}
