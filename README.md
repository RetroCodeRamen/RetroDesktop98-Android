# Retro Desktop 98

> **Source baseline:** Android v2.7, including the installation resource-alignment repair. v2.8 fullscreen and joypad remapping are planned, not implemented. See [Roadmap](docs/ROADMAP.md) and [release security notes](docs/SECURITY_AND_RELEASES.md).

An Android home launcher with a teal desktop, original pixel-art icons, a classic Start menu, and movable Explorer-style windows.

## Install

1. Open `RetroDesktop98.apk` on an Android 8.0 or later device with an up-to-date Android System WebView. If Android asks, allow your file manager or browser to install this APK.
2. Open **Retro Desktop 98 (Resizable)**, tap **Open Settings**, and select **Retro Desktop 98 (Resizable)** in Android's Home app list. You can also get there from **Start → Settings → Home App…**.
3. Press Android's Home button or use the Home gesture to open the desktop. You can switch launchers in **Settings → Apps → Default apps → Home app**.

Version 2.7 updates versions 1.3 through 2.6 in place with the supplied signing key. This edition installs alongside versions 1.0–1.2 and has its own desktop layout. Select either launcher in Android's Home app settings.

## Use the desktop

- Open **Start → Programs** for the built-in Accessories and Games, followed by your installed Android apps. Use the search field to find either kind. Tap **…** next to a program to add a shortcut to the desktop or a folder.
- Touch and hold an empty spot on the desktop to create a folder, add app shortcuts, arrange icons, or open Display Properties. Touch and hold an icon for its context menu. With a mouse, right-click for those menus and double-click to open a desktop icon.
- Drag a shortcut into a folder or the Recycle Bin. The Recycle Bin stores launcher shortcuts and folders. Open a folder's **File** menu to make another folder or add an app directly.
- Drag a window by its title bar. Drag its edges or the bottom-right grip to resize it. The taskbar restores minimized windows, and the square title-bar button toggles between maximized and normal size. Built-in windows remember their size, position, and maximized state separately in portrait and landscape. Installed Android apps open in Android and are available through its Recents gesture or button.
- **Control Panel** opens Android Settings. **My Computer** and **My Documents** link to Windows Explorer. **Network Neighborhood** opens Android's Internet controls. The taskbar clock opens Calendar or date settings.
- **Start → Run…** accepts exact app names, HTTP/HTTPS URLs, and commands including `control`, `explorer`, `calc`, `notepad`, and `wifi`.
- Open **Display Properties** for individual appearance settings or apply the **Classic**, **Science Fiction**, or **Underwater** theme pack. Each pack sets its wallpaper, colors, system icons, sounds, and screen saver. You can still choose a personal wallpaper. Preview **Flying Windows**, **Starfield**, or **Bubbles** before applying. An enabled screen saver keeps the screen awake while the launcher is visible.
- **Start → Documents** shows recently opened workspace files. **Start → Find → Files or Folders…** searches workspace names, including nested folders. **Start → Shut Down…** ends or restarts the launcher session. Use **Start Windows** on the shutdown screen to return.
- Tap the tray speaker for Android media volume, the battery for charge status, or the network icon for Android Internet controls. Use an app’s **…** menu under Programs to pin it to **Quick Launch**. Touch and hold or right-click its Quick Launch icon to unpin it.
- Use **Start → Settings → Active Desktop…** to show any combination of the **QuietSeek Channel**, **Scratch Note**, and **Now Playing**. The note matches Notepad’s scratch note, and Now Playing follows RetroAMP.
- Use **Start → Settings → Desktop Backup…** to export or restore shortcuts, folders, icon positions, built-in window layouts, display settings, and custom wallpaper. The backup covers the desktop configuration. Account sign-in, workspace files, mail, and the Clippy model are stored separately.

## Windowed programs

- **Internet Explorer** opens HTTP and HTTPS sites in a desktop window. It starts at QuietSeek. Enter a web address or search with QuietSeek from the address bar. Select **Home** to return to quietseek.com. The toolbar can send the current page to your Android browser. Confirm a direct HTTP/HTTPS download to save it under **Windows Explorer → Downloads**. Sites that require their own signed-in download session are best opened in your Android browser.
- **Windows Explorer** opens the built-in workspace. Tap a folder to enter it. Text opens in Notepad, RTF opens in WordPad, supported images open in Paint, audio opens in RetroAMP, and ZIP files open in Compressed Folders.
- **Calculator** supports basic arithmetic, decimals, percentages, and sign changes.
- **Notepad** automatically saves the scratch note on the device. Open a text file to edit it separately and use **Save to My Documents** to save a copy.
- **WordPad** edits and saves rich text as RTF.
- **Sound Recorder** captures audio, previews a selected range, and exports it as WAV.
- **RetroAMP** plays local audio in a window and keeps playing across other launcher windows.
- **Lua Studio** is a VB6-style form designer and Lua IDE.
- **Paint** has a pencil, eraser, fill, lines, rectangles, ellipses, undo, and 16 colors. Open an image, save the drawing as a PNG, or set it as launcher wallpaper.
- **Outlook Express** reads the recent inbox and sends plain-text mail through an IMAP/SMTP account.
- **HyperTerminal** connects to Telnet and raw TCP services, displays ANSI art and text, and includes an offline BBS.
- **Character Map** copies DOS box-drawing characters, accented letters, and other symbols to Android’s clipboard or inserts them in HyperTerminal.
- **MS-DOS Prompt** runs file commands against the workspace on C: and opens plain text in Notepad.
- **DOSBox** runs imported DOS games offline in a resizable launcher window.
- **DOSBox Store** downloads selected DOS demos and freeware and gives you a shortcut to your GOG library.
- **ANSI Viewer** opens .ANS artwork with its DOS palette, layout, and available SAUCE metadata.
- **Minesweeper** has a 9-by-9 board, a safe first move, and Flag Mode for touchscreens.
- **Solitaire** is one-card-draw Klondike. Tap a card or sequence and then its destination.

Programs lists Android apps visible in the current user profile. The browser uses Android's Internet permission. The desktop and games run locally.

## HyperTerminal and Character Map

Open **Start → Programs → HyperTerminal** and choose **Offline BBS** to try the bulletin and ANSI gallery. For a network session, choose **Connect…**, enter a host and port, and choose **Telnet** or **Raw TCP**. **Save Connection** keeps the host, port, transport, encoding, and line ending in the connection directory. Telnet and raw TCP send unencrypted data.

HyperTerminal uses an 80×24 ANSI display with DOS/CP437 and UTF-8 support. **Fit 80 Columns** displays the whole row on a narrow screen. With **Live Keys** enabled, keys are sent as you type. **Keys** provides arrows, Escape, Ctrl+C, Ctrl+D, and other keys on touchscreens. **Local Echo** can show typed characters when the remote host is quiet. **File → Save Transcript…** saves visible text and recent scrollback to My Documents. A network session disconnects when you close the terminal window or Android takes the launcher out of the foreground.

**Character Map** is under Programs and HyperTerminal’s **Edit** menu. Select a character to see its Unicode and available CP437 code. Use **Add** to compose a sequence, **Copy** to put it on the clipboard, or **Insert in Terminal** to put it in the input field.

## MS-DOS Prompt and ANSI Viewer

Open **Start → Programs → MS-DOS Prompt**, or run `COMMAND` from **Start → Run…**. Use `HELP` for commands. Use the arrow keys or the **Previous** and **Next** buttons for recent commands. Press **Tab** or use its toolbar button to complete a command or file name. Quote paths containing spaces.

For example, save a HyperTerminal transcript, then run:

```text
CD "C:\My Documents"
DIR *.TXT
TYPE HyperTerminal.txt
EDIT HyperTerminal.txt
```

**Save Changes** in a DOS-opened Notepad document writes to the original file after checking whether it changed. **Save to My Documents** makes a copy. `MKDIR`, `COPY`, `MOVE`, and `REN` operate on the same workspace Explorer displays. In Explorer, select items and use **Edit → Copy** or **Cut**, then go to a destination and choose **Paste**. **Edit → Rename…** renames one selection. The operations leave existing destinations intact when names collide.

Tap an **.ANS** file in Explorer or use **ANSI Viewer → Open ANSI File…**. The viewer uses CP437 for classic artwork and can switch to UTF-8. It displays SAUCE titles and author names when present, and **Fit Width** fits the image to the window.

## Workspace and ZIP files

Open **My Computer → Local Disk (C:)** to find **My Documents**, **Downloads**, **My Pictures**, **Recordings**, **Lua Projects**, and **DOS Games**. The launcher creates these folders automatically. **My Documents** on the desktop goes straight to its folder. **New Folder…** adds a folder inside the current workspace location. Use Explorer’s **Folders** button to see the folder tree or type a location such as `C:\My Documents` into the address bar. Choose **View → Details** for sortable columns or **View → as Web Page** for a file’s size, date, and available image thumbnail. Tap a file in Web Page view to preview it, then choose **Open**.

Built-in apps use the folder for their file type when saving. Saving another file with the same name adds a number to the new copy. Workspace files stay with the launcher across updates and are removed when you uninstall it. To take a file out of the workspace, use **Select → Send To… → Export Copy…** or **Android Share…** in Explorer. Use **File → Copy Android File to My Documents…** to bring a file in, or **Go → Browse Android Folder…** to browse a folder separately.

In Explorer, use **Select**, check files or folders, then choose **Send To… → Compressed Folder…**. The ZIP is saved in the current workspace folder. The share option saves the ZIP and opens Android's share sheet. When browsing an Android folder, created ZIPs go to **My Documents**.

Outside **DOS Games**, tap a ZIP to view its folders and open its files. Use **Extract All…** or select specific items and use **Extract Selected…**. Extraction creates a new folder beside a workspace ZIP. For a ZIP opened from Android storage or from mail, the new folder goes in **My Documents**. In Explorer, select one workspace file or folder and use **Send To… → Desktop (create shortcut)** for quick access.

## DOSBox

Open **Start → Programs → DOSBox** in the Games group. **Demo** opens a small DOS program. **Import Game…** accepts a ZIP, DOSZ, or JSDOS file and copies it into `C:\DOS Games`. You can reopen an imported game from **My DOS Games** or select it in Explorer and choose **Send To… → Desktop (DOSBox shortcut)**. Packages in other workspace folders can also be started through **Send To… → Open in DOSBox**.

A JSDOS bundle can provide its DOSBox configuration. A plain archive runs a root-level `DOSBOX.BAT`, `START.BAT`, or `PLAY.BAT` if present. Otherwise you start at the DOS prompt and can use `DIR` and `CD` to find and launch the game's executable. Packages can be up to 64 MiB compressed and 96 MiB expanded.

Use the touchscreen arrow and action buttons, tap the picture for mouse input, or use a physical keyboard. Select **Right Click**, then tap the picture to send the right mouse button. Enter a DOS command in the text field and tap **Send**. Resize the window from its bottom-right grip. Before closing a game, use its own save menu, then tap **Save Game Files** to keep changes to its DOS drive. DOSBox saves the drive files for that package on this device.

### DOSBox audio and touch controls (v2.7)

Games open in the embedded DOSBox window. Touch the game display or its on-screen controls once to enable Web Audio; alternatively tap **Enable Sound**. The **Test Speaker** button plays a short tone through the phone's normal media output, allowing a separate check of the Android output path before configuring the DOS game. **Sound On** mutes audio if tapped again; touch controls respect that choice until sound is explicitly re-enabled. Audio is suspended while DOSBox is paused or hidden. The output queue is resynchronized if timing drifts instead of continuously dropping buffered chunks.

DOSBox emulates **Sound Blaster 16** with the classic settings **I/O 220, IRQ 7, DMA 1, high DMA 5**, plus AdLib/OPL3 music. In a game's sound setup, select Sound Blaster 16 for digital effects and AdLib/OPL3 or Sound Blaster for music. The device's media volume and Android audio output must be on. The game package may still require its own SETUP.EXE/SOUND.EXE selection. This doesn't emulate Roland MT-32 or guarantee General MIDI soundfonts.

The directional buttons are arranged in the familiar WASD/D-pad shape with **▲** above **◀ ▼ ▶**. Buttons still send DOS arrow keys, not typed W/A/S/D letters, and they support touch-and-hold for movement.

### DOSBox Store

Open **DOSBox Store** from Programs or choose **Store…** in the DOSBox window. **Get Game** or **Get Demo** downloads the ZIP to `C:\DOS Games` and adds a startup script for that release. Use **Play** to start it offline and **Desktop Shortcut** to add an icon. On first launch, MechWarrior 2 unpacks its game files inside DOSBox. Complete setup and choose **Save Game Files** to keep them for the next session.

**GOG Library…** opens your account in the Android browser. Follow GOG’s offline download instructions and install the game on a PC to access the files. For a DOS release, put those files in a ZIP and use **Import Game…**. Some GOG editions, including its release of The Dig, use a different player such as ScummVM. The Store offers the original DOS demo of The Dig separately. Sign-in and purchasing happen on GOG.

The DOSBox runtime and corresponding source information are included under [vendor-source](vendor-source/README.md).

## WordPad

Open **Start → Programs → WordPad**. Use the toolbar for fonts, sizes, headings, bold, italic, underline, strikethrough, paragraph alignment, bullets, and numbering. Open an RTF in Windows Explorer to edit it in WordPad. **Open…** goes to My Documents. Use **Import…** for an RTF or plain text file on Android. **Save RTF** writes to My Documents. WordPad keeps a local draft across launcher restarts. Its RTF support covers the editing features listed here and Unicode text. Use a full document editor for embedded pictures, tables, and page layout.

## Sound Recorder

Open **Start → Programs → Sound Recorder** and press **Record** to capture up to five minutes of microphone audio. Android asks for microphone permission when you first record. **Stop** finishes the clip and saves a local recording draft. Closing the window or leaving the foreground also stops capture.

Adjust **Trim start** and **Trim end** to select a portion of the waveform. **Play Selection** auditions it. **Save WAV** writes a 16-bit mono PCM WAV to Recordings, and **Open in RetroAMP** plays a temporary copy of the selection in the music player. The two trim handles leave the original draft available for another selection. 

## RetroAMP

Open **Start → Programs → RetroAMP** and choose **Add Tracks…** to pick one or more audio files. You can also open an audio file directly from Windows Explorer. Select a track, seek with the position slider, set the player volume, or toggle **Repeat Off / Repeat All / Repeat One**. The on-screen spectrum is computed from decoded track audio. Supported file formats depend on Android's media decoders.

The taskbar **Now Playing** button reopens the player. Closing or minimizing the window keeps audio playing while you use the launcher. Playback pauses when you switch away from the launcher or Android takes audio focus. Tracks keep their playlist positions across sessions when Android grants persistent access through the picker.

## Lua Studio

Open **Start → Programs → Lua Studio**. **Run** starts the Click Counter sample. **Examples → Two-Form Project** demonstrates a menu opening a settings window, a function from a shared module, and an update to another form. **Project** opens Project Explorer, where you add forms and modules and choose the startup form. Projects saved by v1.7 open as single-form projects and are saved in the current format.

**Layout → Automatic Density** uses tighter spacing when the Studio window is narrow or short. Use **Compact Density** to keep the tighter layout or **Standard Density** for the regular spacing. The choice is saved with the desktop preferences. Form dimensions and the running preview use the project's own layout.

- **Design.** Tap a Toolbox control and tap the form, or drag it onto the form. Drag controls and resize them with their corner grips. Inspect a control in **Properties** or select the form to change its background, dimensions, startup position, and menus. The **Layout** menu supports grid snap, multiple selection, alignment, matching sizes, and duplication. Use Shift-click or **Layout → Select Multiple** to build a selection.
- **Controls.** Label, CommandButton, single-line and multiline TextBox, CheckBox, OptionButton, ComboBox, ListBox, Frame, horizontal and vertical ScrollBar, ProgressBar, Timer, Shape, Line, Image, and PictureBox. Image and PictureBox embed an image selected through Android. Enable a Timer in Properties and set its interval. Option buttons use a named group. Keyboard tab order is editable on input controls.
- **Code.** Double-click a control or open an event from **Code**. Each form and module has its own Lua source. Use **Find…** to search, replace, or jump to a line. Use **Immediate** to see output and errors. **Help → Object Browser…** searches the controls, events, and Lua interface.
- **Debugging.** Click the code gutter or use **Debug → Toggle Breakpoint**. **Run** honors breakpoints, and **Step Into** can start on the first executable line. When paused, inspect locals, named watches, and the call stack. Continue or step into, over, or out. Set breakpoints and simple variable-name watches before starting a run. **Stop** ends the program. F5 runs or continues, F8 steps into, F7 opens code, Shift+F7 opens the form, F4 opens Properties, and F9 toggles a breakpoint.
- **Files.** The working project autosaves. **Save Project** writes a portable `.luaform.json` file. **Export Project ZIP** adds the complete project, individual Lua scripts, and image assets to a ZIP in **Lua Projects**. Use **Open Project…** to browse that folder, or **Import Project…** to open a project from Android storage. For a project ZIP in Explorer, open it and choose **Open Lua Project**. **Export Lua Source** saves just the active script, and **Import Lua Source…** imports one from Android storage.

### Publish a launcher program

In Lua Studio, choose **File → Add to Programs…**, enter a name, and press **OK**. A saved copy appears under **Start → Programs → Lua Programs**. Launch it as a normal windowed program, use its options to create a shortcut on the desktop or in a folder, or choose **Edit in Lua Studio**. Publish again from the linked project to update the same entry. A running copy uses the version it opened. Close and reopen it to run the update. Published programs and Studio previews have independent runtime state.

Use **Remove from Programs…** to remove a published copy and its shortcuts. Keep portable project files with **Save Project** or **Export Project ZIP**. The launcher desktop backup stores shortcut layout, and project files can be exported separately.

### Events and the Lua interface

A form calls `Form_Load()` the first time it is shown, `Form_Activate()` on each show, and `Form_Unload()` when unloaded. A button or menu command calls the corresponding `Name_Click()`. Inputs use `Name_Change(value)`, and timers use `Name_Timer()`.

```lua
function Command1_Click()
  local name = ui.get("Text1", "text")
  ui.set("Label1", "text", "Hello, " .. name .. "!")
  ui.show("Details")
end
```

The optional last argument of `ui.get(name, property, form)` and `ui.set(name, property, value, form)` addresses another form. Two-argument `ui.set(name, value)` uses the main property of the control. Properties include `text`, `checked`, `value`, `interval`, `enabled`, and `visible`. Use `ui.hide()` to preserve a form's state or `ui.unload()` to reset it. The functions accept a form name or default to the current form. Modules load in project order and their global functions are available to all forms. Use the `shared` table for shared state.

Projects run offline in a separate Android process. Scripts use Lua and selected standard-library functions, plus the form API. The isolated runtime has no device file, network, system, or Java access.

### VB6 feature audit

This audit covers the major IDE, authoring, debugging, and deployment areas of Visual Basic 6.0, including the Windows-only runtime and component libraries.

| VB6 area | Lua Studio v1.8 coverage and remaining differences |
| --- | --- |
| Projects, startup objects, form and code windows | Project Explorer, named forms, a startup form, shared code modules, and separate source per form or module. Project groups, class and resource modules, and simultaneous split code/design documents are outside this build. |
| Form Editor, Form Layout, properties, and menus | Drag, resize, multiple selection, grid snap, align/size, duplicate, background color, start coordinates, tab order, and a two-level Menu Editor. Layout uses coordinates and a scaled preview. It has no separate multi-monitor Form Layout tool, nested control designer, control arrays, or MDI parent/child framework. |
| Toolbox, intrinsic controls, and resources | The standard input controls, timer, sliders, images, and drawing primitives listed above. Frame draws a labeled border. VB6 drive/directory/file controls, OLE and Data controls, third-party OCXs, and the full VB6 resource editor are absent. |
| Code Editor, Object Browser, and help | Per-file editor, event stubs, find/replace, line navigation, and a searchable Lua API/control reference. VB6 IntelliSense, external component type-library browsing, and split editor panes are absent. |
| Run, break, and inspect | Windowed modeless forms, lifecycle events, breakpoints, line stepping, locals, named watches, call stack, and Immediate output. Watches read variable names. VB6-style expression evaluation and variable editing in Immediate, conditional breakpoints, and edit-and-continue are absent. |
| Language, class/object model, and database tools | Lua syntax and modules, with a small isolated interface for forms. VB6 source and binaries, COM/ActiveX, ADO/DAO/RDO, data binding, and Windows DLL declarations require the Windows VB6 ecosystem. |
| Build targets, deployment, and integration | Projects can be published to the launcher’s Programs menu. Launcher projects and Lua source can be exported and moved between devices. Standalone APK or Windows EXE compilation, Package and Deployment Wizard, ActiveX DLL/EXE and UserControl targets, add-ins, and source-control integration are outside this build. |

### References

[Microsoft VB6 documentation](https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-basic-6/visual-basic-6.0-documentation), [Microsoft VB6 runtime and component support](https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-basic-6/visual-basic-6-support-policy), [Programming Microsoft Visual Basic 6.0](https://xxxmen.github.io/vb6/Promsvb6.htm), and [Visual Basic 6 How to Program](https://www.informit.com/store/visual-basic-6-how-to-program-9780134569550).

## Email

Open **Start → Programs → Outlook Express → Account**. Enter an email address, server hostnames and ports, and the password or app password your provider supports. The username defaults to the email address. **Gmail Settings** fills the common Gmail hostnames and ports. Gmail may require an app password, and providers that require OAuth2 need an OAuth2-capable client.

**Get Mail** fetches the latest 50 messages. The reader shows plain text, including text extracted from HTML messages. **New Mail** and **Reply** send plain-text messages. The app saves one account encrypted with Android Keystore, and **Remove Account…** deletes that local sign-in. Incoming mail uses IMAP over TLS. Outgoing mail uses TLS or required STARTTLS. Open attachments of up to 12 MiB or save them to Downloads. With an offline Clippy model installed, open a message and choose **Ask Clippy… → Summarize** or **Draft a reply**. These actions use the opening text of long messages. Clippy opens a draft with space for your response. Press **Send** in Outlook Express when the draft is ready.

## Clippy

Tap the paperclip beside the taskbar clock. **Search Web** opens QuietSeek results in the built-in browser. You can also type a request such as **Search the web for 90s clocks** and press **Ask**.

For offline chat, use **Download Model (343 MB)** to install the 4-bit Qwen3 0.6B model from the LiteRT Community. Use **Import Model…** to choose a compatible CPU-capable `.litertlm` model. The model loads on the first question, and the CPU engine is released after 90 seconds of inactivity. Clippy keeps the most recent two chat exchanges as context in memory. Mail actions run separately on the device. Use **New Chat** to clear them or **Remove Model…** to reclaim storage. The APK supports 64-bit ARM and x86 Android devices.

## Build from source

Open this folder in Android Studio using JDK 17 or newer, Android SDK Platform 35, and Android Gradle Plugin 9.3.0. Use **Build → Build APK(s)** or run `gradle :app:assembleDebug` with Gradle 9.5.0.

For a build without Gradle, use Bash with a JDK, SDK Platform 35, Build-Tools 35.0.1, `curl`, `zip`, and `unzip`. The script downloads pinned compiler and runtime dependencies into `build/dependencies`.

```bash
export ANDROID_HOME=/path/to/android-sdk
./build-apk.sh
```

The script writes `build/RetroDesktop98.apk` and creates a local development key if needed. For updates, retain the signing key used to install the application. Android requires the same key for an in-place update. Local source builds use a different key from the supplied APK unless you provide the existing key with `RETRO98_KEYSTORE`, `RETRO98_KEY_ALIAS`, and `RETRO98_KEY_PASSWORD`.
