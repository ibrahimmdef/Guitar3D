; Guitar3D NSIS customisation.
; The default "is the app running?" check calls Windows tools (tasklist / PowerShell); keep it simple:
; the installer asks the user to close Guitar3D itself if files are in use.
!macro customCheckAppRunning
!macroend
