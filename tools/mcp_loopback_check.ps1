# Windows/PS7 behavioral gate. RED stops before starting a missing policy.
[CmdletBinding()]
param([switch]$SkipEditor)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 is required'}
$checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$build=Join-Path $checkout 'build'
$run=Join-Path $build ('mcp-loopback-'+[guid]::NewGuid().ToString('N'))
$engine='C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
$checks=[Collections.Generic.List[object]]::new()
$children=[Collections.Generic.List[object]]::new()
$failure=''

function Check([string]$Name,[bool]$Condition) {
    $checks.Add(@{name=$Name;passed=$Condition})
    if(-not $Condition){throw $Name}
    Write-Output "PASS: $Name"
}
function Assert-Owned([string]$Path) {
    $full=[IO.Path]::GetFullPath($Path)
    if(-not $full.StartsWith($build+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture escapes build'}
    for($p=$full;$p;$p=Split-Path -Parent $p){
        if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse fixture ancestor refused'}
    }
}
function List-Endpoints([int]$Owner) {
    $found=@(& netstat.exe -ano | ForEach-Object {
        if($_ -match '^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$' -and [int]$Matches[2] -eq $Owner){$Matches[1]}
    })
    return ,$found
}
function WebSocket-RoundTrip([int]$Port,[bool]$Editor) {
    $ws=[Net.WebSockets.ClientWebSocket]::new()
    $timeout=[Threading.CancellationTokenSource]::new(5000)
    try {
        [void]$ws.ConnectAsync([uri]"ws://127.0.0.1:$Port",$timeout.Token).GetAwaiter().GetResult()
        $request=if($Editor){'{"jsonrpc":"2.0","id":"loopback-proof","method":"ping"}'}else{'{"type":"fixture_ping","value":17}'}
        $bytes=[Text.Encoding]::UTF8.GetBytes($request)
        [void]$ws.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,$timeout.Token).GetAwaiter().GetResult()
        for($attempt=0;$attempt -lt 3;$attempt++) {
            $buffer=[byte[]]::new(16384)
            $reply=$ws.ReceiveAsync([ArraySegment[byte]]::new($buffer),$timeout.Token).GetAwaiter().GetResult()
            if(-not $reply.EndOfMessage){throw 'Unexpected fragmented fixture reply'}
            $message=[Text.Encoding]::UTF8.GetString($buffer,0,$reply.Count) | ConvertFrom-Json -AsHashtable
            if($Editor -and $message.ContainsKey('id')) { return ($message.id -ceq 'loopback-proof' -and $message.ContainsKey('result') -and $null -eq $message.result) }
            if(-not $Editor){return ($message.Count -eq 2 -and $message.fixture -ceq 'loopback' -and $message.value -eq 17)}
        }
        return $false
    } finally { $ws.Abort();$ws.Dispose();$timeout.Dispose() }
}
function Run-Stage([string]$Mode) {
    $folder=Join-Path $run $Mode
    $app=Join-Path $folder 'profile/Roaming'; $local=Join-Path $folder 'profile/Local'
    Assert-Owned $folder
    New-Item -ItemType Directory -Path $app,$local | Out-Null
    $arguments=@('--headless','--path',(Join-Path $checkout 'game'))
    if($Mode -eq 'editor'){$arguments+=@('--editor','--max-fps','60','--quit-after','600')}
    else{$arguments+=@('--script',(Join-Path $checkout 'tools/tests/mcp_loopback_fixture.gd'),'--',"--mode=$Mode","--fixture=$folder")}
    $record=@{mode=$Mode;APPDATA=$app;LOCALAPPDATA=$local;arguments=$arguments;pid=0;exit_code=$null;exited=$false;endpoints=@()}
    $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $folder 'environment.json')
    $out=Join-Path $folder 'stdout.log'; $err=Join-Path $folder 'stderr.log'
    $oldA=$env:APPDATA;$oldL=$env:LOCALAPPDATA;$process=$null
    try {
        $env:APPDATA=$app;$env:LOCALAPPDATA=$local
        if($env:APPDATA -cne $app -or $env:LOCALAPPDATA -cne $local){throw 'Profile assignment failed'}
        $quoted=foreach($argument in $arguments){'"'+$argument+'"'}
        $process=Start-Process -FilePath $engine -ArgumentList $quoted -WorkingDirectory $checkout -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
        $record.pid=$process.Id
        $children.Add($record)
        $watch=[Diagnostics.Stopwatch]::StartNew();$ready=$null
        while($null -eq $ready -and $watch.Elapsed.TotalSeconds -lt 25 -and -not $process.HasExited) {
            if($Mode -eq 'editor') {
                $log=Get-Content -LiteralPath $out -Raw
                if($log -match 'MCP LOOPBACK READY port=(\d+) pid=(\d+)'){$ready=@{port=[int]$Matches[1];pid=[int]$Matches[2]}}
            } elseif(Test-Path -LiteralPath (Join-Path $folder 'ready.json')) {
                try{$ready=Get-Content -LiteralPath (Join-Path $folder 'ready.json') -Raw | ConvertFrom-Json -AsHashtable}catch{$ready=$null}
            }
            if($null -eq $ready){Start-Sleep -Milliseconds 25}
        }
        Check "$Mode reaches real listener readiness" ($null -ne $ready)
        $endpoints=List-Endpoints ([int]$ready.pid)
        $record.endpoints=$endpoints
        $record.engine_pid=$ready.pid
        Check "$Mode owns the literal IPv4 loopback endpoint" ($endpoints -contains "127.0.0.1:$($ready.port)")
        Check "$Mode exposes no wildcard or non-loopback TCP listener" (@($endpoints | Where-Object {$_ -notmatch '^(127\.0\.0\.1:|\[::1\]:)'}).Count -eq 0)
        if($Mode -eq 'policy') {
            $client=[Net.Sockets.TcpClient]::new()
            try{$client.Connect('127.0.0.1',[int]$ready.port);Check 'policy local TCP connection succeeds' $client.Connected}finally{$client.Dispose()}
        } else {Check "$Mode local websocket exchange succeeds" (WebSocket-RoundTrip ([int]$ready.port) ($Mode -eq 'editor'))}
        if($Mode -ne 'editor'){'{"checked":true}' | Set-Content -LiteralPath (Join-Path $folder 'release.json')}
        if(-not $process.WaitForExit(45000)){throw "$Mode did not exit in bounded time"}
        Check "$Mode exits successfully" ($process.ExitCode -eq 0)
        $all=(Get-Content -LiteralPath $out -Raw)+(Get-Content -LiteralPath $err -Raw)
        Check "$Mode has no engine/script/parse/leak errors" ($all -notmatch '(?im)SCRIPT ERROR|Parse Error|^ERROR:|leaked at exit|resources still in use')
        if($Mode -ne 'editor'){Check "$Mode runtime stderr is empty" ((Get-Item -LiteralPath $err).Length -eq 0)}
    } finally {
        $env:APPDATA=$oldA;$env:LOCALAPPDATA=$oldL
        if($null -ne $process) {
            if(-not $process.HasExited){$process.Kill($true);if(-not $process.WaitForExit(5000)){throw 'Owned process cleanup failed'}}
            $record.exited=$process.HasExited;$record.exit_code=$process.ExitCode
            $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $folder 'process.json')
            $process.Dispose()
        }
    }
}
Assert-Owned $run
New-Item -ItemType Directory -Path $run | Out-Null
try {
    Run-Stage 'policy'
    Run-Stage 'websocket'
    if(-not $SkipEditor){Run-Stage 'editor'}
} catch {$failure=$_.Exception.Message;Write-Output "FAIL: $failure"}
@{checks=@($checks);children=@($children);failure=$failure;evidence=$run} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $run 'acceptance.json')
Write-Output "Evidence: $run"
if($failure){exit 1}
Write-Output "MCP LOOPBACK: $($checks.Count) passed, 0 failed"
