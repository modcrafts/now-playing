param([ValidateSet('apple','system')][string]$Mode='apple', [int]$Seconds=0, [switch]$SelfTest, [switch]$Diagnose)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'AudioCapture.cs')
    if ($Diagnose) { [Console]::WriteLine((@([NowPlayingAudio.Capture]::AppleSessions()) | ConvertTo-Json -Compress)) }
    elseif ($SelfTest) {
        $fft=New-Object NowPlayingAudio.Spectrum(44100)
        for ($i=0;$i -lt 8192;$i++) { $fft.AddSample([Math]::Sin(2*[Math]::PI*1000*$i/44100)*0.5) }
        [Console]::WriteLine($fft.Json())
        $fft.Clear()
        for ($i=0;$i -lt 25;$i++) { $silence=$fft.Json() }
        [Console]::WriteLine($silence)
        $quiet=New-Object NowPlayingAudio.Spectrum(44100)
        for ($i=0;$i -lt 8192;$i++) { $quiet.AddSample([Math]::Sin(2*[Math]::PI*1000*$i/44100)*0.002) }
        [Console]::WriteLine($quiet.Json())
        $mixed=New-Object NowPlayingAudio.Spectrum(44100)
        for ($i=0;$i -lt 8192;$i++) {
            $mixed.AddSample(0.35*[Math]::Sin(2*[Math]::PI*1000*$i/44100)+0.035*[Math]::Sin(2*[Math]::PI*4000*$i/44100))
        }
        for ($i=0;$i -lt 12;$i++) { $twoTones=$mixed.Json() }
        [Console]::WriteLine($twoTones)
        $mixed.Clear()
        for ($i=0;$i -lt 8;$i++) { $release=$mixed.Json() }
        [Console]::WriteLine($release)
        # Feed real 10 ms chunks so the regression covers the analysis window
        # as well as the smoothing, rather than only clearing the sample ring.
        $transient=New-Object NowPlayingAudio.Spectrum(44100)
        $attackFrames=@()
        for ($chunk=0;$chunk -lt 8;$chunk++) {
            for ($j=0;$j -lt 441;$j++) {
                $sampleIndex=$chunk*441+$j
                $transient.AddSample(0.5*[Math]::Sin(2*[Math]::PI*1000*$sampleIndex/44100))
            }
            $attackFrames+=($transient.Json() | ConvertFrom-Json)
        }
        $releaseFrames=@()
        for ($chunk=0;$chunk -lt 8;$chunk++) {
            for ($j=0;$j -lt 441;$j++) { $transient.AddSample(0) }
            $releaseFrames+=($transient.Json() | ConvertFrom-Json)
        }
        [Console]::WriteLine((@{attack=$attackFrames;release=$releaseFrames} | ConvertTo-Json -Depth 5 -Compress))
    } else { [NowPlayingAudio.Capture]::Run($Mode,$Seconds) }
} catch {
    [Console]::WriteLine((@{type='audio-status';status='error';source=$Mode;message=$_.Exception.Message} | ConvertTo-Json -Compress))
    exit 1
}
