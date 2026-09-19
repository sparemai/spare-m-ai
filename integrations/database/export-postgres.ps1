#Requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$CloudUrl,
 [Parameter(Mandatory=$true)][string]$IntegrationKey,
 [string]$AgentId='postgres',
 [string]$Service='',
 [string]$Psql='psql',
 [string]$Connection='',
 [switch]$IncludeSchema,
 [switch]$IncludeIndexes,
 [switch]$IncludeQueryStats,
 [string]$ExplainQuery=''
)
$ErrorActionPreference='Stop'
if(-not(Get-Command $Psql -ErrorAction SilentlyContinue)){throw 'psql is required'}
$headers=@{'x-sparem-integration-key'=$IntegrationKey}
$base=$CloudUrl.TrimEnd('/')

function Exec-Csv([string]$sql){
 $args=@()
 if($Connection){$args+=$Connection}
 $args+=@('-X','-q','--csv','-c',$sql)
 $raw=& $Psql @args
 if($LASTEXITCODE -ne 0){throw 'psql metadata query failed'}
 if(-not $raw){return @()}
 return @($raw|ConvertFrom-Csv)
}
function Exec-Text([string]$sql){
 $args=@()
 if($Connection){$args+=$Connection}
 $args+=@('-X','-q','-t','-A','-c',$sql)
 $raw=& $Psql @args
 if($LASTEXITCODE -ne 0){throw 'psql command failed'}
 return ($raw -join [Environment]::NewLine)
}
function Normalize-Sql([string]$s){
 if(-not $s){return ''}
 $x=[regex]::Replace($s,"'(?:''|[^'])*'","?")
 $x=[regex]::Replace($x,'\b\d+(?:\.\d+)?\b','?')
 $x=[regex]::Replace($x,'\s+',' ').Trim()
 if($x.Length -gt 2000){$x=$x.Substring(0,2000)}
 return $x
}

$events=@()
$now=(Get-Date).ToUniversalTime().ToString('o')

foreach($r in (Exec-Csv "select current_database() as database, version() as version;")){
 $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;data=@{kind='database_info';system='postgresql';database=$r.database;version=$r.version}}
}

foreach($r in (Exec-Csv "select coalesce(state,'unknown') as state,count(*)::bigint as connections from pg_stat_activity group by 1 order by 2 desc;")){
 $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;data=@{kind='connection_pool';system='postgresql';state=$r.state;connections=[int64]$r.connections}}
}

if($IncludeSchema){
 foreach($r in (Exec-Csv "select table_schema,table_name,table_type from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema,table_name limit 2000;")){
  $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;entity_id="$($r.table_schema).$($r.table_name)";data=@{kind='schema_table';system='postgresql';schema=$r.table_schema;table=$r.table_name;table_type=$r.table_type}}
 }
}

if($IncludeIndexes){
 foreach($r in (Exec-Csv "select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname not in ('pg_catalog','information_schema') order by schemaname,tablename,indexname limit 2000;")){
  $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;entity_id=$r.indexname;data=@{kind='index';system='postgresql';schema=$r.schemaname;table=$r.tablename;index=$r.indexname;definition=(Normalize-Sql $r.indexdef)}}
 }
}

if($IncludeQueryStats){
 try{
  foreach($r in (Exec-Csv "select queryid::text as query_id,calls,total_exec_time,mean_exec_time,rows,query from pg_stat_statements order by total_exec_time desc limit 100;")){
   $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;entity_id=$r.query_id;data=@{kind='query_stats';system='postgresql';query_id=$r.query_id;calls=[double]$r.calls;total_exec_time_ms=[double]$r.total_exec_time;mean_exec_time_ms=[double]$r.mean_exec_time;rows=[double]$r.rows;query_summary=(Normalize-Sql $r.query)}}
  }
 }catch{Write-Warning 'pg_stat_statements unavailable or not permitted'}
}

if($ExplainQuery){
 $q=$ExplainQuery.Trim()
 if($q -notmatch '^(?is)\s*(select|with)\b' -or $q -match ';\s*\S'){throw 'ExplainQuery must be one read-only SELECT/WITH statement'}
 $plan=Exec-Text "EXPLAIN (FORMAT JSON, ANALYZE FALSE, COSTS TRUE, VERBOSE FALSE, BUFFERS FALSE) $q"
 $events+=@{event_time=$now;agent_id=$AgentId;service=$Service;data=@{kind='explain_plan';system='postgresql';query_summary=(Normalize-Sql $q);explain_plan=$plan}}
}

if($events.Count){
 $body=@{type='database';agent_id=$AgentId;events=$events}|ConvertTo-Json -Depth 12 -Compress
 $r=Invoke-RestMethod -Method Post -Uri "$base/api/integrations/events" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 60
 Write-Host "Sent $($r.count) PostgreSQL intelligence records." -ForegroundColor Green
}else{
 Write-Host 'No database records collected.' -ForegroundColor Yellow
}
