#requires -Version 7.0
<# Local-only disposable realm acceptance. Never starts public listeners. #>
[CmdletBinding()]
param([string]$EnginePath='C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$game=Join-Path $root 'game'
$fixturePaths=@(
    (Join-Path $game 'proto3d/tests/realm_fixture_server.gd'),
    (Join-Path $game 'proto3d/tests/realm_fixture_server.tscn'),
    (Join-Path $game 'proto3d/tests/realm_fixture_client.gd'),
    (Join-Path $game 'proto3d/tests/realm_fixture_client.tscn'),
    (Join-Path $game 'export_presets.cfg')
)
foreach($fixturePath in $fixturePaths) {
    if(-not (Test-Path -LiteralPath $fixturePath -PathType Leaf)) { throw "REALM PROOF missing fixture path: $fixturePath" }
}
if(-not (Test-Path -LiteralPath $EnginePath)){ throw 'Installed Godot is required; no download attempted.' }
$run=Join-Path $root ('build/realm-purchase-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$owned=[Collections.Generic.List[Diagnostics.Process]]::new()
$processLogs=[Collections.Generic.List[object]]::new()
$ownedPids=[Collections.Generic.HashSet[int]]::new()
$checks=[Collections.Generic.List[object]]::new()
$lock=$null
$server=$null
$socket=[Net.Sockets.UdpClient]::new(0)
$port=$socket.Client.LocalEndPoint.Port
$socket.Dispose()
$ledger=Join-Path $run 'authority.json'
Write-Output "REALM PROOF evidence: $run"

function Json-Write([string]$Path,$Value) {
    # Test controller artifacts, never authority writes after server startup.
    $temporary="$Path.tmp.$PID.$([guid]::NewGuid().ToString('N'))"
    $Value | ConvertTo-Json -Depth 32 | Set-Content -LiteralPath $temporary -Encoding utf8NoBOM
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Json-Read([string]$Path) {
    if(-not (Test-Path -LiteralPath $Path -PathType Leaf)){ return $null }
    try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -Depth 32 } catch { return $null }
}
function Wait-For([scriptblock]$Condition,[string]$Label,[int]$Seconds=15) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while($watch.Elapsed.TotalSeconds -lt $Seconds) {
        if(& $Condition){ return }
        Start-Sleep -Milliseconds 50
    }
    throw "Timed out: $Label; evidence: $run"
}
function Check([string]$Name,[bool]$Passed) {
    $checks.Add([ordered]@{name=$Name;passed=$Passed})
    Write-Output ('REALM PROOF '+$(if($Passed){'PASS'}else{'FAIL'})+' '+$Name)
    if(-not $Passed){ throw "Acceptance failed: $Name" }
}
function Token { return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
function Hash([string]$Value) { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Value))).ToLowerInvariant() }
function Now-Ms { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Spawn([string]$Label,[string]$Scene,[string[]]$UserArgs) {
    $profile=Join-Path $run ($Label+'-profile')
    New-Item -ItemType Directory -Path (Join-Path $profile 'Roaming'),(Join-Path $profile 'Local') | Out-Null
    $arguments=@('--headless','--audio-driver','Dummy','--path',$game,"res://proto3d/tests/$Scene.tscn",'--')+$UserArgs
    $quoted=foreach($argument in $arguments) {
        if($argument.Contains('"') -or $argument.EndsWith('\')){throw 'Unsupported process argument'}
        '"'+$argument+'"'
    }
    $oldA=$env:APPDATA; $oldL=$env:LOCALAPPDATA
    try {
        $env:APPDATA=Join-Path $profile 'Roaming'; $env:LOCALAPPDATA=Join-Path $profile 'Local'
        $stdout=Join-Path $run ($Label+'.stdout.log'); $stderr=Join-Path $run ($Label+'.stderr.log')
        $process=Start-Process -FilePath $EnginePath -ArgumentList $quoted -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    } finally { $env:APPDATA=$oldA; $env:LOCALAPPDATA=$oldL }
    if(-not $ownedPids.Add($process.Id)) { Stop-Owned $process; throw "Child PID reused inside one proof: $($process.Id)" }
    $owned.Add($process)
    $processLogs.Add([pscustomobject]@{label=$Label;pid=$process.Id;stdout=$stdout;stderr=$stderr})
    return $process
}
function Stop-Owned([Diagnostics.Process]$Process) {
    if($null -ne $Process -and -not $Process.HasExited) { $Process.Kill($true); $Process.WaitForExit() }
}
function New-Client([string]$Name,[string]$Credential,[bool]$Raw=$false,[string]$AuthOverride='') {
    $commandDir=Join-Path $run ($Name+'-commands')
    New-Item -ItemType Directory -Path $commandDir | Out-Null
    $client=[pscustomobject]@{name=$Name;raw=$Raw;serial=0;command_dir=$commandDir;result=(Join-Path $run ($Name+'.result.json'));stop=(Join-Path $run ($Name+'.stop'));process=$null}
    $config=Join-Path $run ($Name+'.config.json')
    Json-Write $config @{port=$port;credential=$Credential;command_dir=$client.command_dir;result_path=$client.result;stop_path=$client.stop;raw_peer=$Raw;raw_auth_packet=$AuthOverride}
    $client.process=Spawn $Name 'realm_fixture_client' @("--config=$config")
    return $client
}
function Ready($Client) {
    Wait-For {
        $v=Json-Read $Client.result
        $null -ne $v -and $v.authenticated -and @($v.messages | Where-Object kind -eq 'view').Count -gt 0
    } ($Client.name+' admission')
}
function View($Client) { $v=Json-Read $Client.result; if($null -eq $v){return $null}; return @($v.messages | Where-Object kind -eq 'view') | Select-Object -Last 1 }
function Receipt-Count($Client) { $v=Json-Read $Client.result; if($null -eq $v){return 0}; return @($v.messages | Where-Object kind -eq 'receipt').Count }
function Send($Client,$Payload,[long]$At=0,[bool]$ExitAfterSend=$false) {
    $Client.serial++
    Json-Write (Join-Path $Client.command_dir ('{0:D6}.json' -f $Client.serial)) @{serial=$Client.serial;payload=$Payload;not_before_msec=$At;exit_after_send=$ExitAfterSend}
}
function Send-Raw($Client,[string]$Packet,[long]$At=0,[bool]$ExitAfterSend=$false) {
    $Client.serial++
    Json-Write (Join-Path $Client.command_dir ('{0:D6}.json' -f $Client.serial)) @{serial=$Client.serial;raw_packet=$Packet;not_before_msec=$At;exit_after_send=$ExitAfterSend}
}
function Receipt($Client,[int]$Before) {
    Wait-For { (Receipt-Count $Client) -gt $Before } ($Client.name+' receipt')
    $v=Json-Read $Client.result
    return @($v.messages | Where-Object kind -eq 'receipt') | Select-Object -Last 1
}
function Purchase([string]$Id,[string]$Parcel) { return @{version=1;kind='purchase';request_id=$Id;parcel_id=$Parcel} }
function Receipt-Key([string]$Account,[string]$Request) { return "$($Account.Length):${Account}:$Request" }
function State-Bytes { return [IO.File]::ReadAllText($ledger) }
function Assert-Private($Client) {
    $view=View $Client
    $keys=@($view.PSObject.Properties.Name | Sort-Object)
    Check ($Client.name+' receives only private view keys') (($keys -join ',') -eq 'balance,kind,parcels,version')
    foreach($property in $view.parcels.PSObject.Properties) {
        $fields=@($property.Value.PSObject.Properties.Name | Sort-Object)
        Check ($Client.name+' parcel '+$property.Name+' hides account identities') (($fields -join ',') -eq 'can_access,ownership')
    }
    Check ($Client.name+' receives exact parcel projection') ((@($view.parcels.PSObject.Properties.Name | Sort-Object) -join ',') -eq 'roadstead_001,roadstead_002,roadstead_003')
    $wire=$view | ConvertTo-Json -Depth 16 -Compress
    Check ($Client.name+' view excludes authority collections') ($wire -notmatch 'owner_id|accounts|receipts|guests|items')
}

function Test-UdpPortAvailable([int]$Candidate) {
    try {
        $probe=[Net.Sockets.UdpClient]::new([Net.IPEndPoint]::new([Net.IPAddress]::Loopback,$Candidate))
        $probe.Dispose()
        return $true
    } catch { return $false }
}

try {
    $preset=Get-Content -LiteralPath (Join-Path $game 'export_presets.cfg') -Raw
    Check 'release preset excludes realm fixture resources' ($preset -match '(?m)^exclude_filter=.*proto3d/tests/realm_fixture_\*')
    $aliceToken=Token; $bobToken=Token; $soonToken=Token; $expiredToken=Token
    $expires=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+30
    $configPath=Join-Path $run 'server.config.json'
    $config=@{port=$port;ledger_path=$ledger;ready_path=(Join-Path $run 'server.ready.json');stop_path=(Join-Path $run 'server.stop');identities=@(
        @{account_id='alice';token_sha256=(Hash $aliceToken);expires_at=($expires+3600)},
        @{account_id='bob';token_sha256=(Hash $bobToken);expires_at=($expires+3600)},
        @{account_id='soon';token_sha256=(Hash $soonToken);expires_at=$expires},
        @{account_id='expired';token_sha256=(Hash $expiredToken);expires_at=($expires-100)})}
    Json-Write $configPath $config
    $server=Spawn 'server' 'realm_fixture_server' @('--realm-test-server',"--config=$configPath")
    Wait-For { $null -ne (Json-Read $config.ready_path) } 'server ready'
    $soon=New-Client 'soon' $soonToken; Ready $soon
    $alice=New-Client 'alice' $aliceToken; $bob=New-Client 'bob' $bobToken
    Ready $alice; Ready $bob
    Check 'two independent buyer client processes' ($alice.process.Id -ne $bob.process.Id -and $server.Id -ne $alice.process.Id -and $server.Id -ne $bob.process.Id)
    Check 'both buyers initially observe 500 and unowned home' ((View $alice).balance -eq 500 -and (View $bob).balance -eq 500 -and (View $alice).parcels.roadstead_001.ownership -eq 'unowned' -and (View $bob).parcels.roadstead_001.ownership -eq 'unowned')
    $seeded=Json-Read $ledger
    Check 'durable fixture starts with exact accounts and balances' ((@($seeded.accounts.PSObject.Properties.Name | Sort-Object) -join ',') -eq 'alice,bob,expired,soon' -and @($seeded.accounts.PSObject.Properties.Value | Where-Object scrip -ne 500).Count -eq 0)
    $start=(Now-Ms)+500
    Send $alice (Purchase 'race' 'roadstead_001') $start
    Send $bob (Purchase 'race' 'roadstead_001') $start
    $ra=Receipt $alice 0; $rb=Receipt $bob 0
    Check 'exactly one competing network purchase succeeds' ([int]$ra.ok+[int]$rb.ok -eq 1)
    $losingRaceReceipt=if($ra.ok){$rb}else{$ra}
    Check 'race loser receives exact already-owned rejection' (-not $losingRaceReceipt.ok -and $losingRaceReceipt.request_id -eq 'race' -and $losingRaceReceipt.error -eq 'already_owned')
    $state=Json-Read $ledger
    Check 'one durable owner and exactly one 150 debit' ($state.parcels.roadstead_001.owner_id -in @('alice','bob') -and $state.accounts.alice.scrip+$state.accounts.bob.scrip -eq 850)
    $winner=if($ra.ok){$alice}else{$bob}; $loser=if($ra.ok){$bob}else{$alice}
    $winnerToken=if($ra.ok){$aliceToken}else{$bobToken}; $loserToken=if($ra.ok){$bobToken}else{$aliceToken}
    Wait-For { (View $winner).parcels.roadstead_001.ownership -eq 'self' -and (View $loser).parcels.roadstead_001.ownership -eq 'other' } 'both peers ownership update'
    Check 'winner sees 350 and loser keeps 500' ((View $winner).balance -eq 350 -and (View $loser).balance -eq 500)
    Assert-Private $alice; Assert-Private $bob
    $before=State-Bytes; $n=Receipt-Count $winner
    Send $winner (Purchase 'race' 'roadstead_001'); $receipt=Receipt $winner $n
    Check 'successful request replay has no second debit' ($receipt.ok -and (State-Bytes) -ceq $before)
    $n=Receipt-Count $winner
    $lock=[IO.File]::Open($winner.result,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    Send $winner (Purchase 'race' 'roadstead_001')
    Start-Sleep -Milliseconds 300
    $lock.Dispose(); $lock=$null
    $receipt=Receipt $winner $n
    $published=Json-Read $winner.result
    Check 'locked client result retries buffered network receipt and view' ($receipt.ok -and $receipt.request_id -eq 'race' -and $published.publish_failures -gt 0 -and $published.messages_received -eq @($published.messages).Count -and (View $winner).balance -eq 350 -and (State-Bytes) -ceq $before)
    $n=Receipt-Count $winner; Send $winner (Purchase 'race' 'roadstead_002'); $receipt=Receipt $winner $n
    Check 'changed payload under same receipt is rejected' (-not $receipt.ok -and $receipt.error -eq 'receipt_conflict' -and (State-Bytes) -ceq $before)
    $attacker=New-Client 'forged-command' $bobToken $true; Ready $attacker
    foreach($field in @('account_id','funds','cargo','location')) {
        $packet=Purchase ('forge-'+$field) 'roadstead_002'; $packet[$field]='forged'
        $n=Receipt-Count $attacker; Send $attacker $packet; $receipt=Receipt $attacker $n
        Check ('forged '+$field+' rejected without authority mutation') (-not $receipt.ok -and $receipt.request_id -eq '' -and (State-Bytes) -ceq $before)
    }
    foreach($kind in @('credit','unknown')) {
        $packet=Purchase ('invalid-'+$kind) 'roadstead_002'; $packet.kind=$kind
        $n=Receipt-Count $attacker; Send $attacker $packet; $receipt=Receipt $attacker $n
        Check ('unavailable '+$kind+' command cannot mutate authority') (-not $receipt.ok -and $receipt.request_id -eq '' -and (State-Bytes) -ceq $before)
    }
    $bad=New-Client 'invalid' (Token); $expired=New-Client 'expired' $expiredToken
    foreach($client in @($bad,$expired)) {
        Wait-For { $v=Json-Read $client.result; $null -ne $v -and $v.disconnected } ($client.name+' authentication rejection')
        $v=Json-Read $client.result
        Check ($client.name+' credential never receives authority view') (-not $v.authenticated -and @($v.messages).Count -eq 0 -and (State-Bytes) -ceq $before)
    }
    foreach($authProbe in @(@{name='malformed';packet='{broken'},@{name='oversize';packet=('x'*1025)})) {
        $rawAuth=New-Client ('raw-auth-'+$authProbe.name) $bobToken $true $authProbe.packet
        Wait-For { $v=Json-Read $rawAuth.result; $null -ne $v -and $v.disconnected } ('raw auth '+$authProbe.name+' rejection')
        $v=Json-Read $rawAuth.result
        Check ('server rejects actual '+$authProbe.name+' authentication') ($v.auth_packet_sent -and -not $v.authenticated -and @($v.messages).Count -eq 0 -and (State-Bytes) -ceq $before)
    }
    $lock=[IO.File]::Open($ledger,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $n=Receipt-Count $loser; Send $loser (Purchase 'locked-file' 'roadstead_002'); $receipt=Receipt $loser $n
    Check 'failed durable write never acknowledges success' (-not $receipt.ok -and $receipt.error.StartsWith('persistence_failed:'))
    Check 'failed write preserves observed funds and ownership' ((View $loser).balance -eq 500 -and (View $loser).parcels.roadstead_002.ownership -eq 'unowned')
    $lock.Dispose(); $lock=$null
    Check 'failed write preserves exact durable bytes' ((State-Bytes) -ceq $before)
    $n=Receipt-Count $loser; Send $loser (Purchase 'locked-file' 'roadstead_002'); $receipt=Receipt $loser $n
    Check 'same failed request succeeds once after IO recovery' ($receipt.ok -and (Json-Read $ledger).accounts.($loser.name).scrip -eq 275)
    $recovered=State-Bytes
    foreach($probe in @(@{name='malformed';raw='{broken'},@{name='oversize';raw=('x'*2049)})) {
        $raw=New-Client ('raw-'+$probe.name) $bobToken $true; Ready $raw
        Send-Raw $raw $probe.raw
        Wait-For { $v=Json-Read $raw.result; $null -ne $v -and @($v.sent_serials) -contains 1 -and ($v.disconnected -or @($v.messages | Where-Object kind -eq 'receipt').Count -gt 0) } ('raw '+$probe.name+' rejection')
        $rawResult=Json-Read $raw.result
        $rawReceipts=@($rawResult.messages | Where-Object kind -eq 'receipt')
        Check ('server rejects actual '+$probe.name+' packet without mutation') (@($rawResult.sent_serials) -contains 1 -and (State-Bytes) -ceq $recovered -and @($rawReceipts | Where-Object ok -eq $true).Count -eq 0)
    }
    Wait-For { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge $expires+1 } 'admitted identity expiry' 55
    Send $soon (Purchase 'after-expiry' 'roadstead_003')
    Wait-For { $v=Json-Read $soon.result; $null -ne $v -and $v.disconnected } 'expired admitted session rejection'
    Check 'expiry after admission prevents a purchase' ((State-Bytes) -ceq $recovered)
    Stop-Owned $server
    $config.ready_path=Join-Path $run 'server-restart.ready.json'; Json-Write $configPath $config
    $server=Spawn 'server-restart' 'realm_fixture_server' @('--realm-test-server',"--config=$configPath")
    Wait-For { $null -ne (Json-Read $config.ready_path) } 'restarted authority ready'
    $aw=New-Client 'winner-reconnected' $winnerToken; $al=New-Client 'loser-reconnected' $loserToken
    Ready $aw; Ready $al
    Check 'crash recovery preserves exact acknowledged authority' ((State-Bytes) -ceq $recovered)
    Check 'independent reconnections see durable funds and deeds' ((View $aw).balance -eq 350 -and (View $al).balance -eq 275 -and (View $aw).parcels.roadstead_001.ownership -eq 'self' -and (View $al).parcels.roadstead_002.ownership -eq 'self')
    $n=Receipt-Count $aw; Send $aw (Purchase 'race' 'roadstead_001'); $receipt=Receipt $aw $n
    Check 'receipt replays after server process restart' ($receipt.ok -and (State-Bytes) -ceq $recovered)
    $uncertain=New-Client 'interrupted' $winnerToken; Ready $uncertain
    Send $uncertain (Purchase 'uncertain' 'roadstead_003') 0 $true
    Wait-For { $uncertain.process.HasExited } 'client interrupted before receipt consumption'
    $u=Json-Read $uncertain.result
    Check 'interrupted peer sent a real packet from its own process' (@($u.sent_serials) -contains 1 -and $uncertain.process.ExitCode -eq 0)
    Check 'interrupted client did not consume a success receipt' (@($u.messages | Where-Object kind -eq 'receipt' | Where-Object ok -eq $true).Count -eq 0)
    Start-Sleep -Milliseconds 500
    $preRetryState=Json-Read $ledger
    $appliedBeforeRetry=$preRetryState.parcels.roadstead_003.owner_id -eq $winner.name
    Check 'interrupted outcome is coherent before retry' (($appliedBeforeRetry -and $preRetryState.accounts.($winner.name).scrip -eq 50) -or (-not $appliedBeforeRetry -and $preRetryState.parcels.roadstead_003.owner_id -eq '' -and $preRetryState.accounts.($winner.name).scrip -eq 350))
    Json-Write (Join-Path $run 'interrupted-outcome.json') @{applied_before_retry=$appliedBeforeRetry;owner=if($appliedBeforeRetry){'winner'}else{'unowned'};winner_balance=$preRetryState.accounts.($winner.name).scrip}
    $retry=New-Client 'interrupted-retry' $winnerToken; Ready $retry
    $n=Receipt-Count $retry; Send $retry (Purchase 'uncertain' 'roadstead_003'); $receipt=Receipt $retry $n
    $final=Json-Read $ledger
    Check 'uncertain command retry results in exactly one 300 debit' ($receipt.ok -and $final.accounts.($winner.name).scrip -eq 50 -and $final.parcels.roadstead_003.owner_id -eq $winner.name)
    Check 'final authority has exact balances owners and receipt count' ($final.accounts.($winner.name).scrip -eq 50 -and $final.accounts.($loser.name).scrip -eq 275 -and $final.accounts.soon.scrip -eq 500 -and $final.accounts.expired.scrip -eq 500 -and $final.parcels.roadstead_001.owner_id -eq $winner.name -and $final.parcels.roadstead_002.owner_id -eq $loser.name -and $final.parcels.roadstead_003.owner_id -eq $winner.name -and @($final.receipts.PSObject.Properties).Count -eq 7 -and $final.receipts.PSObject.Properties.Name -contains (Receipt-Key $winner.name 'race') -and $final.receipts.PSObject.Properties.Name -contains (Receipt-Key $loser.name 'locked-file') -and $final.receipts.PSObject.Properties.Name -contains (Receipt-Key $winner.name 'uncertain'))
    Stop-Owned $server
    $corruptPath=Join-Path $run 'corrupt-authority.json'; '{broken' | Set-Content -LiteralPath $corruptPath -Encoding utf8
    $corruptBefore=[IO.File]::ReadAllText($corruptPath)
    $config.ledger_path=$corruptPath; $config.ready_path=Join-Path $run 'corrupt.ready.json'; Json-Write $configPath $config
    $broken=Spawn 'server-corrupt' 'realm_fixture_server' @('--realm-test-server',"--config=$configPath")
    Wait-For { $broken.HasExited } 'corrupt authority fail-closed startup'
    Check 'corrupt authority rejects startup without reset' ($broken.ExitCode -ne 0 -and -not (Test-Path -LiteralPath $config.ready_path) -and [IO.File]::ReadAllText($corruptPath) -ceq $corruptBefore)
    $config.ledger_path=Join-Path $run 'must-not-create.json'; $config.ready_path=Join-Path $run 'must-not-ready.json'; Json-Write $configPath $config
    $unguarded=Spawn 'server-no-flag' 'realm_fixture_server' @("--config=$configPath")
    Wait-For { $unguarded.HasExited } 'explicit test server flag guard'
    Check 'headless alone never provisions or starts realm' ($unguarded.ExitCode -ne 0 -and -not (Test-Path -LiteralPath $config.ledger_path) -and -not (Test-Path -LiteralPath $config.ready_path) -and (Test-UdpPortAvailable $port))
    Check 'workflow completed' $true
} catch {
    $checks.Add([ordered]@{name='workflow completed';passed=$false;error=$_.Exception.Message})
    Write-Output ('REALM PROOF FAILURE: '+$_.Exception.Message)
} finally {
    if($null -ne $lock){$lock.Dispose()}
    foreach($process in $owned){Stop-Owned $process}
    $unexpected=[Collections.Generic.List[string]]::new()
    foreach($entry in $processLogs) {
        foreach($path in @($entry.stdout,$entry.stderr)) {
            if(Test-Path -LiteralPath $path) {
                $matches=Select-String -LiteralPath $path -Pattern 'SCRIPT ERROR|Parse Error|^ERROR(?:\s|:)|leaked|leaks at exit|Resources still in use' -CaseSensitive:$false
                foreach($match in $matches){$unexpected.Add("$($entry.label):$([IO.Path]::GetFileName($path)):$($match.LineNumber)")}
            }
        }
    }
    $logsClean=$unexpected.Count -eq 0
    $checks.Add([ordered]@{name='all child logs are free of engine script errors and leaks';passed=$logsClean;details=@($unexpected)})
    Write-Output ('REALM PROOF '+$(if($logsClean){'PASS'}else{'FAIL'})+' all child logs are free of engine script errors and leaks')
    $failures=@($checks | Where-Object { -not $_.passed }).Count
    Json-Write (Join-Path $run 'acceptance.json') @{kind='local-multiprocess-realm-purchase';passed=($checks.Count-$failures);failed=$failures;checks=@($checks);limitations='Loopback test credentials and purchase authority only. No production login, encrypted transport, world authority, backpack/guest/AOI or MMO capacity proof.'}
}
Write-Output "REALM PROOF RESULTS: $($checks.Count-$failures) passed, $failures failed"
if($failures -gt 0){exit 1}
exit 0
