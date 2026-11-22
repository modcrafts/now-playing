param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
Add-Type -Path $Source
function Session([int]$ProcessId,[string]$Name,[int]$State,[float]$Peak,[string]$Device) {
    New-Object NowPlayingAudio.Capture+SessionInfo -Property @{Pid=$ProcessId;Name=$Name;State=$State;Peak=$Peak;DeviceId=$Device}
}
$routed=@((Session 101 'AppleMusic' 0 0 'default'),(Session 202 'AMPLibraryAgent' 1 .2 'virtual'))
$audible=@((Session 101 'AppleMusic' 1 .3 'speaker'),(Session 202 'AMPLibraryAgent' 1 0 'virtual'))
$paused=@((Session 101 'AppleMusic' 0 0 'default'),(Session 202 'AMPLibraryAgent' 0 0 'virtual'))
$restricted=@((Session 303 'MIXLINE' 1 1 'default'),(Session 202 'AMPLibraryAgent' 2 .5 'virtual'),(Session 101 'AppleMusic' 1 .1 'speaker'))
$duplicates=@((Session 202 'AMPLibraryAgent' 0 0 'default'),(Session 202 'AMPLibraryAgent' 1 .4 'virtual'),(Session 101 'AppleMusic' 0 0 'default'))
@{
    routed=[NowPlayingAudio.Capture]::SelectApplePid($routed)
    audible=[NowPlayingAudio.Capture]::SelectApplePid($audible)
    paused=[NowPlayingAudio.Capture]::SelectApplePid($paused)
    restricted=[NowPlayingAudio.Capture]::SelectApplePid($restricted)
    duplicates=[NowPlayingAudio.Capture]::SelectApplePid($duplicates)
    empty=[NowPlayingAudio.Capture]::SelectApplePid(@())
} | ConvertTo-Json -Compress
