; Custom NSIS hooks for GoWorks — uninstall-time data-wipe prompt.
;
; On uninstall, offer to also delete the user's local data. GoWorks stores sensitive
; material under %APPDATA%\GoWorks: the master-password vault (Service Account key +
; OAuth refresh token), the SQLite database (which holds the plaintext OAuth client
; secret, institutions, signature templates, branding) and operation logs. A plain
; uninstall leaves all of this on disk.
;
; IMPORTANT (electron-builder#8240): electron-builder's oneClick uninstaller calls
; `SetSilent silent` in un.onInit — AFTER its own "are you sure?" confirm — which
; suppresses every MessageBox during uninstall (the /SD default is auto-picked, so
; our prompt never showed). `customUnInit` runs AFTER that SetSilent, so we restore
; interactive mode here when the user did NOT request a silent uninstall (/S).
!macro customUnInit
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/S" $R1
  ${If} ${Errors}
    ; No /S on the command line → interactive uninstall. Undo the forced silent
    ; mode so the data-wipe prompt below can actually show.
    SetSilent normal
  ${EndIf}
!macroend

; Defaults to KEEP (No) so an accidental uninstall — or an uninstall/reinstall to
; upgrade — does not wipe a working configuration. A genuine silent uninstall (/S)
; also keeps data (the /SD IDNO default), and ${isUpdated} skips the prompt entirely
; during an in-place upgrade.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "GoWorks'e ait kayıtlı verilerinizi ve kimlik bilgilerinizi de silmek istiyor musunuz?$\r$\n$\r$\nSilinecekler: kasa (Service Account anahtarı + Google oturumu), veritabanı ve loglar.$\r$\nBu işlem GERİ ALINAMAZ. Yeniden kuracaksanız 'Hayır' seçin." \
      /SD IDNO IDNO GoWorksKeepData
      RMDir /r "$APPDATA\GoWorks"
    GoWorksKeepData:
  ${EndIf}
!macroend
