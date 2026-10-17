param([string]$RuntimePath = (Join-Path $PSScriptRoot '..\.runtime'))
. (Join-Path $PSScriptRoot 'media.ps1') -RuntimePath $RuntimePath -Once
if ($media -and $media.Thumbnail) {
    $stream = Await ($media.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    [Console]::WriteLine('Thumbnail type: ' + $stream.GetType().FullName)
    [Console]::WriteLine('Thumbnail size: ' + $randomStreamType.GetProperty('Size').GetValue($stream, $null))
    [Console]::WriteLine('Thumbnail content: ' + $contentTypeProvider.GetProperty('ContentType').GetValue($stream, $null))
    [Console]::WriteLine('Stream members: ' + (($stream | Get-Member -MemberType Property,Method | Select-Object -ExpandProperty Name) -join ', '))
} else { [Console]::WriteLine('No system thumbnail published by Apple Music.') }
