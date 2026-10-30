# Kill the lead's own :3410 Chrome + agent (exact PIDs found by their :3410 command line), keep vite; the caller relaunches the agent.
$c = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'localhost:3410' -and $_.CommandLine -notmatch '--type=' }
$a = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'agent.mjs --port 3410' }
foreach ($p in @($c) + @($a)) { if ($p) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; "killed $($p.ProcessId) $($p.Name)" } }
