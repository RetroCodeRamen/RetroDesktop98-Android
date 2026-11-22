# Permanent APK signing — Retro Desktop 98

This repository uses **the original Retro Desktop 98 v2.7 signing certificate** for all update-capable APKs. It must never silently fall back to a temporary development certificate.

## Signing identity (public information)

- Android app ID: `com.retrodesktop.launcher.resizable`
- Signing certificate SHA-256 (hex): `3aef553e3b4218b5d4e4a44365c93b6a0f0d11c94088b976563b0c7766094433`
- Alias: `retro98`
- Reference: original verified v2.7 package

The GitHub Actions job **fails without the two signing secrets**, and verifies the signing certificate **before and after** building the APK. It never exports a development-signed artifact under the release/update name. The workflow does **not** run untrusted pull-request code with signing secrets.

## One-time owner setup — GitHub Actions secrets

A preserved original keystore has been rewrapped with a new password. The key pair and certificate were **not changed**, so it remains compatible with earlier v2.7 builds signed by the original certificate. Keep the `.p12` file and its new password in a secure personal backup. Do **not** commit them to GitHub.

1. Open the repository's **Settings → Secrets and variables → Actions** page: `https://github.com/RetroCodeRamen/RetroDesktop98-Android/settings/secrets/actions`.
2. Add **New repository secret** named `RETRO98_KEYSTORE_B64`. Its value is the entire content of the separately provided file `RETRO98_KEYSTORE_B64.txt` (one base64 line, no whitespace).
3. Add **New repository secret** named `RETRO98_KEY_PASSWORD`. Its value is the entire content of `RETRO98_KEY_PASSWORD.txt` (one strong password, no newline).
4. **Do not** add these files as repository files, issues, PR comments, Actions logs, or public release assets.
5. Re-run the failed **Android APK — permanent signing** workflow. It will verify the correct signing certificate before it builds.

If the key file or password is lost, you cannot generate new signed updates with the original signing identity. Back them up in a password manager/secure backup. **Changing a keystore password does not revoke earlier copies of the same private key**; never share the original low-password keystore publicly either.

## Version numbers and update behavior

GitHub Actions assigns a monotonic APK `versionCode` of `100000 + GITHUB_RUN_NUMBER` for builds of this workflow. Version codes must always increase for installs that preserve app data. **Do not rename/recreate the workflow without reviewing version-code continuity.** Source/Gradle default version is only a fallback for a local build. The GH built artifact includes a run suffix in `versionName`.

From the working original-signed **v2.7**, the next permanent-signature APK should install over the top and preserve data. An APK previously installed from CI with a **temporary, different certificate** (e.g. v2.9.2 development APK) **cannot** be upgraded in place by this key: uninstall that development version exactly once, then install the new update APK. All subsequent update APKs must use this exact signing certificate.

Android does not permit signing-key mismatch updates under the same app ID. Never lower version codes in future builds.

## Verification

```bash
python3 tests/verify_release_identity.py --self-test
# In Android SDK build environment, after signing:
python3 tests/verify_release_identity.py RetroDesktop98.apk "$ANDROID_HOME/build-tools/35.0.1/apksigner" "$ANDROID_HOME/build-tools/35.0.1/aapt2"
```

The verification script checks package ID, certificate SHA-256, and versionCode; `tests/check_apk_package.py` checks ZIP/resource/native-library alignment.