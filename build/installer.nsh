; Custom NSIS hook for GoWorks (electron-builder customUnInstall macro).
;
; On uninstall, offer to also delete the user's local data. GoWorks stores sensitive
; material under %APPDATA%\GoWorks: the master-password vault (Service Account key +
; OAuth refresh token), the SQLite database (which holds the plaintext OAuth client
; secret, institutions, signature templates, branding) and operation logs. A plain
; uninstall leaves all of this on disk.
;
; Defaults to KEEP (No) so an accidental uninstall — or an uninstall/reinstall to
; upgrade — does not wipe a working configuration. Silent uninstalls also keep data.
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "GoWorks'e ait kayıtlı verilerinizi ve kimlik bilgilerinizi de silmek istiyor musunuz?$\r$\n$\r$\nSilinecekler: kasa (Service Account anahtarı + Google oturumu), veritabanı ve loglar.$\r$\nBu işlem GERİ ALINAMAZ. Yeniden kuracaksanız 'Hayır' seçin." \
    /SD IDNO IDNO GoWorksKeepData
    RMDir /r "$APPDATA\GoWorks"
  GoWorksKeepData:
!macroend
