"""Drive studio/index.html in headless Chromium (GPU) to render stills and video frames.
usage: python render.py preview|stills|video [names...]"""
import sys, os, base64, io, threading, http.server, functools, json, subprocess, shutil, time
from playwright.sync_api import sync_playwright
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.join(HERE, 'studio')
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
PORT = 8765

def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=STUDIO)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), h).serve_forever()
threading.Thread(target=serve, daemon=True).start()

# name: (scene, opts, outW, outH)
JOBS = {
  'facility-cau-giay-exterior': ('exterior', {'variant': 'cg'}, 1600, 1000),
  'facility-quan-7-exterior': ('exterior', {'variant': 'q7'}, 1600, 1000),
  'facility-thu-duc-exterior': ('exterior', {'variant': 'td'}, 1600, 1000),
  'facility-cau-giay-corridor': ('corridor', {'pal': 'brand', 'zone': 'A', 'seed': 7, 'x': 0.5, 'lx': -0.4, 'y': 1.5}, 1600, 1000),
  'facility-quan-7-corridor': ('corridor', {'pal': 'warm', 'zone': 'D', 'seed': 11, 'x': -0.6, 'lx': 0.5, 'y': 1.3, 'pattern': [['open', 'closed', 'closed'], ['closed', 'open', 'closed']]}, 1600, 1000),
  'facility-thu-duc-corridor': ('corridor', {'pal': 'navy', 'zone': 'B', 'seed': 5, 'x': 0.2, 'y': 1.7, 'fov': 60}, 1600, 1000),
  'facility-lobby-a': ('lobby', {'variant': 'a'}, 1600, 1000),
  'facility-lobby-b': ('lobby', {'variant': 'b'}, 1600, 1000),
  'scene-keypad': ('keypad', {}, 1600, 1000),
  'scene-moving': ('moving', {}, 1600, 1000),
  'scene-business': ('business', {}, 1600, 1000),
  **{f'unit-{k.lower()}': ('unit', {'kind': k}, 1200, 900) for k in ['LOCKER', 'XS', 'S', 'M', 'MG', 'L', 'XL', 'VEHICLE']},
}

# Seamless loops for the cinematic site (one per visual environment). name: (scene, opts, seconds)
VIDEOS = {
  'hero-corridor': ('corridor', {'pal': 'brand', 'zone': 'A', 'seed': 7, 'y': 1.6}, 16),
  'street-night': ('exterior', {'variant': 'cg', 'drift': {'amp': [1.6, 0.18, 3.0], 'dist': 40, 'look': 0.2}}, 12),
  'keypad-glow': ('keypad', {'drift': {'amp': [0.035, 0.012, 0.05], 'dist': 0.65, 'look': 0.4}}, 10),
  'moving-dawn': ('moving', {'drift': {'amp': [0.35, 0.05, 0.45], 'dist': 4.5, 'look': 0.3}}, 12),
}

def page_for(p, w, h):
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': min(w, 4000), 'height': min(h, 4000)})
    pg.on('console', lambda m: print('   [js]', m.text[:200]) if m.type in ('error', 'warning') and 'too many' not in m.text else None)
    pg.on('pageerror', lambda e: print('   [pageerror]', e))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?w={w}&h={h}')
    pg.wait_for_function('window.studioReady === true', timeout=60000)
    return b, pg

def decode(url):
    return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')

def stills(names, scale):
    with sync_playwright() as p:
        for n in names:
            scene, opts, ow, oh = JOBS[n]
            rw, rh = int(ow * scale), int(oh * scale)
            t0 = time.time()
            b, pg = page_for(p, rw, rh)
            pg.evaluate('([n,o]) => studio.setup(n,o)', [scene, opts])
            pg.evaluate('() => studio.frame(0,0)')  # warm-up (shader compile)
            img = decode(pg.evaluate("() => studio.frame(0,1,'image/png')"))
            b.close()
            if scale != 1: img = img.resize((ow, oh) if scale > 1 else (rw, rh), Image.LANCZOS)
            if scale < 1:
                img.save(os.path.join(OUT, f'preview-{n}.jpg'), quality=85)
            else:
                img.save(os.path.join(OUT, f'{n}.webp'), quality=84, method=6)
                img.resize((ow // 2, oh // 2), Image.LANCZOS).save(os.path.join(OUT, f'{n}-sm.webp'), quality=80, method=6)
            print(f'{n}: {time.time() - t0:.1f}s', flush=True)

def video(name, scene, opts, ow=1280, oh=720, seconds=16, fps=24, ss=1.5):
    frames = os.path.join(OUT, 'frames'); shutil.rmtree(frames, ignore_errors=True); os.makedirs(frames)
    rw, rh = int(ow * ss), int(oh * ss); n = seconds * fps
    with sync_playwright() as p:
        b, pg = page_for(p, rw, rh)
        pg.evaluate('([n,o]) => studio.setup(n,o)', [scene, opts]); pg.evaluate('() => studio.frame(0,0)')
        t0 = time.time()
        for i in range(n):
            img = decode(pg.evaluate(f"() => studio.frame({i / n},{i},'image/png')")).resize((ow, oh), Image.LANCZOS)
            img.save(os.path.join(frames, f'{i:04d}.png'))
            if i == 0: img.save(os.path.join(OUT, f'{name}-poster.jpg'), quality=86); img.save(os.path.join(OUT, f'{name}-poster.webp'), quality=82)
            if i % 48 == 0: print(f'  frame {i}/{n} {time.time() - t0:.0f}s', flush=True)
        b.close()
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'encode.py'), name, str(fps)], cwd=HERE, check=True)
    print('video done', os.path.getsize(os.path.join(OUT, f'{name}.webm')) // 1024, 'KB')

if __name__ == '__main__':
    mode = sys.argv[1]; names = sys.argv[2:] or list(JOBS)
    if mode == 'preview': stills(names, 0.4)
    elif mode == 'stills': stills(names, 2)
    elif mode == 'video':
        for n in (sys.argv[2:] or list(VIDEOS)):
            scene, opts, secs = VIDEOS[n]
            video(n, scene, opts, seconds=secs, ss=1.25)
