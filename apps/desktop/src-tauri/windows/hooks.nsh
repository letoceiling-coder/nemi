; The packaged backend (api\nemi-api.exe) may still be running during an update:
; stop it before files are replaced, and on uninstall.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM nemi-api.exe'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM nemi-api.exe'
!macroend
