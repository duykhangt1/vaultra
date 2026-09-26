"""Encode out/frames/*.png into a looping WebM (desktop 1280x720 + mobile 640x360). usage: encode.py name fps"""
import os, subprocess, io, sys
from PIL import Image
name = sys.argv[1] if len(sys.argv) > 1 else 'hero-corridor'; fps = sys.argv[2] if len(sys.argv) > 2 else '24'
OUT = 'out'; fr = os.path.join(OUT, 'frames'); files = sorted(os.listdir(fr))
ff = os.path.join(os.path.expanduser('~'), 'AppData', 'Local', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe')
for suffix, size, br, mx in (('', None, '1700k', '2600k'), ('-mobile', (640, 360), '520k', '800k')):
    mj = os.path.join(OUT, 'frames.mjpeg')
    with open(mj, 'wb') as o:
        for f in files:
            im = Image.open(os.path.join(fr, f)).convert('RGB')
            if size: im = im.resize(size, Image.LANCZOS)
            b = io.BytesIO(); im.save(b, 'JPEG', quality=96, subsampling=0); o.write(b.getvalue())
    dst = os.path.join(OUT, f'{name}{suffix}.webm')
    r = subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', fps, '-i', mj, '-c:v', 'libvpx', '-b:v', br, '-maxrate', mx, '-bufsize', '4000k', '-qmin', '4', '-qmax', '44', '-auto-alt-ref', '0', '-deadline', 'good', '-cpu-used', '1', '-g', '96', '-pix_fmt', 'yuv420p', '-an', dst])
    print('rc', r.returncode, dst, os.path.getsize(dst) // 1024 if os.path.exists(dst) else 0, 'KB', len(files), 'frames')
