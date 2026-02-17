!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var runShortcutPageDialog
Var runShortcutDesktopCheckbox
Var runShortcutTaskbarCheckbox
Var runShortcutDesktopState
Var runShortcutTaskbarState
Var runShortcutShouldPrompt

!macro customInit
  StrCpy $runShortcutDesktopState ${BST_CHECKED}
  StrCpy $runShortcutTaskbarState ${BST_UNCHECKED}
  StrCpy $runShortcutShouldPrompt "true"

  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $0 != ""
    StrCpy $runShortcutShouldPrompt "false"
  ${else}
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $0 != ""
      StrCpy $runShortcutShouldPrompt "false"
    ${else}
      ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${if} $0 != ""
        StrCpy $runShortcutShouldPrompt "false"
      ${endif}
    ${endif}
  ${endif}
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutOptionsPageCreate ShortcutOptionsPageLeave
!macroend

Function ShortcutOptionsPageCreate
  ${if} ${isUpdated}
    Abort
  ${endif}
  ${if} $runShortcutShouldPrompt != "true"
    Abort
  ${endif}

  nsDialogs::Create 1018
  Pop $runShortcutPageDialog
  ${If} $runShortcutPageDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose additional Windows shortcuts:"
  Pop $0

  ${NSD_CreateCheckbox} 0 30u 100% 12u "Create a desktop shortcut"
  Pop $runShortcutDesktopCheckbox
  ${NSD_SetState} $runShortcutDesktopCheckbox $runShortcutDesktopState

  ${NSD_CreateCheckbox} 0 48u 100% 12u "Pin Mira to the taskbar"
  Pop $runShortcutTaskbarCheckbox
  ${NSD_SetState} $runShortcutTaskbarCheckbox $runShortcutTaskbarState

  nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
  ${if} ${isUpdated}
    Return
  ${endif}

  ${NSD_GetState} $runShortcutDesktopCheckbox $runShortcutDesktopState
  ${NSD_GetState} $runShortcutTaskbarCheckbox $runShortcutTaskbarState
FunctionEnd

!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $runShortcutShouldPrompt == "true"
    ${if} $runShortcutDesktopState != ${BST_CHECKED}
      Delete "$newDesktopLink"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endif}

    ${if} $runShortcutTaskbarState == ${BST_CHECKED}
      ${StdUtils.InvokeShellVerb} $0 "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" ${StdUtils.Const.ShellVerb.PinToTaskbar}
    ${endif}
    ${endif}
  ${endif}
!macroend
!endif
