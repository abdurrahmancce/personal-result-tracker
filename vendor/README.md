# vendor/

Optional: put the PDF libraries here so the app does not need any outside server for PDF export.

Run this once in PowerShell, inside the project folder:

```powershell
Invoke-WebRequest https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js -OutFile vendor/jspdf.umd.min.js
Invoke-WebRequest https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js -OutFile vendor/jspdf.plugin.autotable.min.js
```

Then commit and push. The app uses these files first and falls back to cdnjs when they are missing.
