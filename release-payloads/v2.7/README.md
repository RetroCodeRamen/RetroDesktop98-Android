# v2.7 APK release payload

This directory holds the original, phone-tested 53,545,256-byte APK compressed with XZ and split into eight Git blobs. It is **not source code**. The GitHub Actions release workflow joins the numbered parts, decompresses them, checks SHA-256 against `518fdc2727bbb86d776dc9409071c9850a13d75b8d9f18348c0619d2bd0f76e5`, then publishes the APK on GitHub Releases.

Signing credentials are NOT committed. Do not alter the parts or re-sign the APK. For future releases, replace this archival approach with standard signed Android CI builds and durable signing-key management.
