#Requires -RunAsAdministrator
Unregister-ScheduledTask -TaskName 'SPARE-M Collector' -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'SPARE-M Extended Sensors' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Removed SPARE-M Collector and Extended Sensors scheduled tasks.'
