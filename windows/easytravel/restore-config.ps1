#Requires -Version 5.1
param([string]$EasyTravelDir='')
if(-not $EasyTravelDir){$c=@('C:\Program Files\Dynatrace\easyTravel (x64)','C:\Program Files (x86)\Dynatrace\easyTravel','C:\Program Files\Dynatrace\easyTravel');foreach($p in $c){if(Test-Path (Join-Path $p 'resources\easyTravelConfig.properties')){$EasyTravelDir=$p;break}}}
$config=Join-Path $EasyTravelDir 'resources\easyTravelConfig.properties';$backup=Get-ChildItem "$config.sparem-backup-*" -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 1;if(-not $backup){throw 'No SPARE-M backup found'};Copy-Item $backup.FullName $config -Force;Write-Host "Restored $($backup.Name). Restart EasyTravel." -ForegroundColor Green
