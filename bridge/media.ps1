param([Parameter(Mandatory=$true)][string]$RuntimePath, [switch]$Once)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
[IO.Directory]::CreateDirectory((Join-Path $RuntimePath 'commands')) | Out-Null
function Emit($data) { [Console]::WriteLine(($data | ConvertTo-Json -Depth 8 -Compress)) }
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $randomStreamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $contentTypeProvider = [Windows.Storage.Streams.IContentTypeProvider, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    function Await($operation, [Type]$resultType) {
        $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
        try { if (-not $task.Wait(4000)) { throw 'Windows media operation timed out' } }
        catch { if ($task.Exception) { throw $task.Exception.GetBaseException().Message }; throw }
        return $task.GetAwaiter().GetResult()
    }
    $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $artwork = $null
    $artworkType = $null
    $artworkError = $null
    $lastKey = ''
    $lastMetadata = [DateTime]::MinValue
    $media = $null
    $lastSession = ''
    do {
        try {
            $sessions = @($manager.GetSessions())
            $ids = @($sessions | ForEach-Object { $_.SourceAppUserModelId })
            # Never attach to a browser, Spotify, or another application's session.
            $session = $sessions | Where-Object { $_.SourceAppUserModelId -match '(?i)(AppleInc\.AppleMusic|AppleMusic|Apple Music)' } | Sort-Object @{ Expression = { if ($_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { 0 } else { 1 } } } | Select-Object -First 1
            if ($null -eq $session) {
                $media = $null; $lastKey = ''; $lastSession = ''; $artwork = $null
                Emit @{type='state';status='waiting';message='Open Apple Music and play a song';sessions=$ids;track=@{connected=$false;playing=$false;title='';artist='';album='';position=0;duration=0;artwork=$null}}
            } else {
                $sourceId = $session.SourceAppUserModelId
                if ($sourceId -ne $lastSession -or (([DateTime]::UtcNow - $lastMetadata).TotalMilliseconds -ge 1200)) {
                    $media = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                    $lastSession = $sourceId
                    $lastMetadata = [DateTime]::UtcNow
                    $key = "$sourceId|$($media.Title)|$($media.Artist)|$($media.AlbumTitle)"
                    if ($key -ne $lastKey -or -not $artwork) {
                        $artwork = $null; $artworkType = $null; $artworkError = $null
                        if ($media.Thumbnail) {
                            $stream = $null; $reader = $null
                            try {
                                $stream = Await ($media.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                                # Interface results are __ComObject in Windows PowerShell 5.1.
                                # Invoke through the declared WinRT interface instead of dynamic COM members.
                                $size = $randomStreamType.GetProperty('Size').GetValue($stream, $null)
                                if ($size -gt 0 -and $size -le 10485760) {
                                    $inputStream = $randomStreamType.GetMethod('GetInputStreamAt').Invoke($stream, @([uint64]0))
                                    $reader = [Windows.Storage.Streams.DataReader]::new($inputStream)
                                    $null = Await ($reader.LoadAsync([uint32]$size)) ([uint32])
                                    $bytes = New-Object byte[] ([int]$size)
                                    $reader.ReadBytes($bytes)
                                    $md5 = [Security.Cryptography.MD5]::Create()
                                    try { $hash = [BitConverter]::ToString($md5.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() } finally { $md5.Dispose() }
                                    $artwork = "$hash.img"
                                    $artworkType = $contentTypeProvider.GetProperty('ContentType').GetValue($stream, $null)
                                    if ($artworkType -notmatch '^image/(jpeg|png|webp|gif|bmp)$') { $artworkType = 'image/jpeg' }
                                    $target = Join-Path $RuntimePath $artwork
                                    if (-not [IO.File]::Exists($target)) { [IO.File]::WriteAllBytes($target, $bytes) }
                                    # Keep disk usage bounded; currently served art is excluded.
                                    Get-ChildItem -LiteralPath $RuntimePath -Filter '*.img' | Where-Object { $_.Name -ne $artwork } | Sort-Object LastWriteTime -Descending | Select-Object -Skip 4 | Remove-Item -Force -ErrorAction SilentlyContinue
                                }
                            } catch { $artwork = $null; $artworkError = $_.Exception.Message } finally {
                                # WinRT Close is projected through IDisposable, not an exposed COM Dispose method.
                                if ($reader) { try { ([System.IDisposable]$reader).Dispose() } catch {} }
                                if ($stream) { try { ([System.IDisposable]$stream).Dispose() } catch {} }
                            }
                        }
                        $lastKey = $key
                    }
                }
                $playback = $session.GetPlaybackInfo()
                $timeline = $session.GetTimelineProperties()
                $playing = $playback.PlaybackStatus.ToString() -eq 'Playing'
                $rate = 1
                if ($null -ne $playback.PlaybackRate -and $playback.PlaybackRate -gt 0) { $rate = [double]$playback.PlaybackRate }
                $duration = [Math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalSeconds)
                $position = [Math]::Max(0, ($timeline.Position - $timeline.StartTime).TotalSeconds)
                if ($playing -and $timeline.LastUpdatedTime) {
                    $delta = [Math]::Max(0, ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalSeconds)
                    $position += $delta * $rate
                }
                if ($duration -gt 0) { $position = [Math]::Min($position, $duration) } else { $position = 0 }
                Emit @{type='state';status='connected';message='Apple Music connected';sessions=$ids;track=@{connected=$true;playing=$playing;title=$media.Title;artist=$media.Artist;album=$media.AlbumTitle;position=$position;duration=$duration;rate=$rate;artwork=$artwork;artworkType=$artworkType;artworkError=$artworkError;source=$sourceId}}
            }
            foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $RuntimePath 'commands') -Filter '*.json')) {
                $command = $null
                try {
                    $command = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                    if (-not $session) { throw 'No Apple Music session' }
                    $operation = switch ($command.action) {
                        'toggle' { $session.TryTogglePlayPauseAsync() }
                        'next' { $session.TrySkipNextAsync() }
                        'previous' { $session.TrySkipPreviousAsync() }
                        default { throw 'Unknown command' }
                    }
                    $ok = Await $operation ([bool])
                    Emit @{type='command';id=$command.id;ok=[bool]$ok;error=$(if (-not $ok) {'Apple Music rejected the command'} else {$null})}
                } catch { if ($command) { Emit @{type='command';id=$command.id;ok=$false;error=$_.Exception.Message} } }
                finally { Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue }
            }
        } catch {
            $media = $null; $lastSession = ''; $lastKey = ''; $artwork = $null
            Emit @{type='state';status='error';message=$_.Exception.Message;sessions=@();track=@{connected=$false;playing=$false;title='';artist='';album='';position=0;duration=0;artwork=$null}}
        }
        if (-not $Once) { Start-Sleep -Milliseconds 700 }
    } while (-not $Once)
} catch {
    Emit @{type='state';status='error';message=$_.Exception.Message;sessions=@();track=@{connected=$false;playing=$false;title='';artist='';position=0;duration=0}}
    exit 1
}
