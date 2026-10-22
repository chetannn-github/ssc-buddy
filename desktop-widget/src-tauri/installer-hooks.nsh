; The finish-page checkbox is the desktop-shortcut option in Tauri's installer.
; Keep the choice available, but require the user to opt in.
!ifndef MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!endif
