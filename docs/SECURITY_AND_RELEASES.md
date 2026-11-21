# Security and release signing

This repository intentionally omits the Android release keystore and any account credentials. **Never commit the PKCS#12 file, passwords, email accounts, downloaded LLMs, or paid DOS game files.**

The bundled `build-apk.sh` will generate a new development keystore if none is provided. An APK signed with that new key cannot update an APK installed with the earlier v1.3–v2.7 signing certificate. To build updates for existing users, provide the *existing* signing key and password locally using `RETRO98_KEYSTORE`, `RETRO98_KEY_ALIAS`, `RETRO98_KEY_PASSWORD` per `build-apk.sh`. Keep those credentials outside the repository.

Package integrity and cryptographic signature verification do not prove that an APK installs on Android. Earlier v2.7 packages were rejected due to incorrect ZIP resource alignment. Run `tests/check_apk_package.py` on the final signed APK, verify with Android `apksigner`, and install-test an actual phone before distributing updates.

The repository includes third-party Lua, LiteRT, mail and DOSBox components: review their notices and redistribution requirements before changing visibility to public or publishing a release.
