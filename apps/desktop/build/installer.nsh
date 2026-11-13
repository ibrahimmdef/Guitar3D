; Guitar3D NSIS customisation.
; The default "is the app running?" check calls Windows tools (tasklist / PowerShell); keep it simple:
; the installer asks the user to close Guitar3D itself if files are in use.
!macro customCheckAppRunning
!macroend

; Full clean-up on uninstall (not when an update replaces the old version): the update cache the
; installer keeps next to the app data. App data itself goes via nsis.deleteAppDataOnUninstall.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\@guitar3ddesktop-updater"
    RMDir /r "$LOCALAPPDATA\guitar3d-updater"
  ${endIf}
!macroend
