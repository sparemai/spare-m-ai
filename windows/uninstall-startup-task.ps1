#Requires -RunAsAdministrator
Unregister-ScheduledTask -TaskName 'SPARE-M Collector' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Removed SPARE-M Collector scheduled task.'
