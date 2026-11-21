# Android APK builds and signing

## Downloading CI builds

Open **Actions → Android APK → most recent successful run → Artifacts → RetroDesktop98-Android-apk**.

The workflow compiles the source using Android SDK 35 and runs the packaging checks before uploading the APK to Actions Artifacts. The artifact is retained for 30 days. This is a CI build, not necessarily the exact v2.7 APK that was installed and tested on a physical phone.

## Signing an update compatible with the existing launcher

The working Android v2.7 APK is signed with the original development signing certificate. Android will not let a new key update that installation.

Never add any keystore or passwords to Git history. To enable matching CI builds, set these repository **Actions secrets** (Settings → Secrets and variables → Actions):

- `RETRO98_KEYSTORE_B64`: base64-encoded content of the original .p12 signing keystore
- `RETRO98_KEY_PASSWORD`: original keystore password
- `RETRO98_KEY_ALIAS`: original signing alias (defaults to `retro98`)

The workflow decodes the keystore only inside its runner and does not publish it. Keep an offline backup of the original keystore. If you do not configure those secrets, CI generates a fresh development key, so its APK **will not install as an update** to your existing Retro Desktop 98 installation.

Only a tagged build with those signing secrets configured is published automatically as a GitHub Release APK. Other builds appear in GitHub Actions Artifacts.

## Important verification

A valid signature is not proof of installability. The v2.7 install fix was needed to align `resources.arsc` at 4 bytes and uncompressed native libraries to 16 KiB. The packaging check is in `tests/check_apk_package.py`. Validate all future versions on an Android phone before distributing them.
