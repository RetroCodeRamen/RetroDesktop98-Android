#!/usr/bin/env python3
"""Fail closed unless a signed APK is an upgradable Retro Desktop 98 build.

This validates the signer certificate independently of the presence of
GitHub Actions secrets, so accidental debug-key artifacts cannot ship.
"""
from __future__ import annotations
import re
import subprocess
import sys

EXPECTED_PACKAGE = 'com.retrodesktop.launcher.resizable'
EXPECTED_CERT_SHA256 = '3aef553e3b4218b5d4e4a44365c93b6a0f0d11c94088b976563b0c7766094433'
MIN_VERSION_CODE = 26  # The last development release (2.9.2) uses 25.


def signer_digest(output: str) -> str:
    match = re.search(r'Signer\s+#1\s+certificate\s+SHA-256\s+digest:\s*([A-Fa-f0-9:]{64,96})', output)
    if not match:
        raise ValueError('apksigner did not provide the certificate SHA-256 digest')
    return match.group(1).replace(':', '').lower()


def package_identity(output: str):
    match = re.search(r"^package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'", output, re.MULTILINE)
    if not match:
        raise ValueError('aapt2 did not provide the APK package/version identity')
    return match.group(1), int(match.group(2)), match.group(3)


def verify(apk: str, apksigner: str, aapt2: str) -> None:
    signed = subprocess.run([apksigner, 'verify', '--verbose', '--print-certs', apk],
                            check=True, capture_output=True, text=True).stdout
    cert = signer_digest(signed)
    if cert != EXPECTED_CERT_SHA256:
        raise ValueError(f'Incorrect APK signer: {cert}; expected the original v2.7 certificate')
    package = subprocess.run([aapt2, 'dump', 'badging', apk], check=True,
                             capture_output=True, text=True).stdout
    pkg, code, name = package_identity(package)
    if pkg != EXPECTED_PACKAGE or code < MIN_VERSION_CODE:
        raise ValueError(f'Incorrect package/version: {pkg}, versionCode={code}')
    print(f'RELEASE IDENTITY OK: {pkg}, versionCode={code}, versionName={name}, SHA-256={cert}')


def self_test():
    sample = 'Signer #1 certificate SHA-256 digest: ' + EXPECTED_CERT_SHA256
    assert signer_digest(sample) == EXPECTED_CERT_SHA256
    assert signer_digest(sample.upper().replace('SIGNER', 'Signer').replace('CERTIFICATE', 'certificate').replace('DIGEST', 'digest')) == EXPECTED_CERT_SHA256
    try:
        signer_digest('Signed using a random debug key')
    except ValueError:
        pass
    else:
        raise AssertionError('Missing signer digest accepted')
    sample = "package: name='com.retrodesktop.launcher.resizable' versionCode='100057' versionName='2.9.3-permanent.r57'"
    assert package_identity(sample) == (EXPECTED_PACKAGE, 100057, '2.9.3-permanent.r57')
    print('PASS release identity parser and fail-closed signer check')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif len(sys.argv) == 4:
        verify(*sys.argv[1:])
    else:
        raise SystemExit('Usage: verify_release_identity.py APK APKSIGNER AAPT2 | --self-test')