#!/usr/bin/env python3
"""Fail release builds whose uncompressed ZIP entries are not page/data aligned.

Android 11+ refuses targetSdk>=30 APKs whose resources.arsc is not STORED
and 4-byte aligned. For APKs with extractNativeLibs=false, native libraries
also need suitable zip page alignment (16KiB for modern devices).
"""
import sys,zipfile,struct

def check(apk):
    with zipfile.ZipFile(apk) as z,open(apk,'rb') as raw:
        if z.testzip() is not None:
            raise RuntimeError('APK ZIP CRC failed')
        resources=z.getinfo('resources.arsc')
        if resources.compress_type!=zipfile.ZIP_STORED:
            raise RuntimeError('resources.arsc is compressed')
        for member in z.infolist():
            if member.compress_type!=zipfile.ZIP_STORED:
                continue
            raw.seek(member.header_offset+26)
            filename_len,extra_len=struct.unpack('<HH',raw.read(4))
            data_start=member.header_offset+30+filename_len+extra_len
            alignment=16384 if member.filename.startswith('lib/') and member.filename.endswith('.so') else 4
            if data_start%alignment:
                raise RuntimeError('%s offset %d is not aligned to %d' % (member.filename,data_start,alignment))
        print('APK layout OK: resources.arsc 4-byte aligned, stored entries aligned, native libs 16KiB aligned')

if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('Usage: check_apk_package.py /path/to/app.apk')
    check(sys.argv[1])
