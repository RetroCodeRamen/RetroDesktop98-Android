# Retro Desktop 98 v2.7 — 4-byte resource alignment repair

Earlier v2.7 release packages were rejected by Android. The ZIP repack did not align
`resources.arsc` to a 4-byte data offset (it was at 12447, modulo 4 = 3), even after
native libraries were separately 16KiB aligned. Android 11+ rejects APKs with
targetSdk 30+ when `resources.arsc` is uncompressed but not 4-byte aligned.

This build explicitly aligns **all** uncompressed ZIP entries to 4 bytes and the
native `.so` libraries to 16KiB. It is signed with the same development certificate
as previous resizable releases, and v1/v2/v3 cryptographic signatures were verified.
The built APK was not tested through Android's package manager in this environment.

Run `python3 tests/check_apk_package.py path/to/RetroDesktop98.apk` on future release
candidates and use Android SDK `apksigner verify` and `adb install -r` when available.

If Android still rejects the build, collect the specific ADB error using wireless
ADB or an installation manager; a generic 'App not installed' dialog does not
provide the underlying failure code.
