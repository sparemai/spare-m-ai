$b=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);([BitConverter]::ToString($b)).Replace('-','').ToLower()
