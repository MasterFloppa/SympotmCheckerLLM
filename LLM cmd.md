Invoke-RestMethod -Uri http://localhost:11434/api/generate `
   -Method Post `
   -Body $json `
   -ContentType "application/json"