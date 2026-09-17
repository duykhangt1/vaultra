$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\ADMIN\Downloads\BOX\vaultra\vaultra"
$esbuild = "$repoRoot\node_modules\.pnpm\@esbuild+win32-x64@0.25.12\node_modules\@esbuild\win32-x64\esbuild.exe"
$ttfDir = "$repoRoot\node_modules\.pnpm\dejavu-fonts-ttf@2.37.3\node_modules\dejavu-fonts-ttf\ttf"
$tempDir = "$env:TEMP\vaultra-vps-bundle"

Set-Location "$repoRoot\packages\shared"
& .\node_modules\.bin\tsc -p tsconfig.json

Set-Location "$repoRoot\apps\api"
& .\node_modules\.bin\tsc -p tsconfig.build.json

if (!(Test-Path "$tempDir\dist")) {
    New-Item -ItemType Directory -Path "$tempDir\dist", "$tempDir\data", "$tempDir\fonts", "$tempDir\tools" -Force | Out-Null
}

& $esbuild dist/main.js --bundle --platform=node --target=node22 --outfile="$tempDir\dist\main.js" --alias:pdfkit=./node_modules/pdfkit/js/pdfkit.standalone.js --external:@nestjs/microservices --external:@nestjs/websockets/socket-module --external:class-transformer --external:class-validator --external:react-native --external:react-native-fs --external:react-native-fetch-blob
if ($LASTEXITCODE -ne 0) { throw "esbuild failed for dist/main.js: the zip would contain a stale backend" }
& $esbuild start-r2-backend.cjs --bundle --platform=node --target=node22 --outfile="$tempDir\start-r2-backend.cjs"
if ($LASTEXITCODE -ne 0) { throw "esbuild failed for start-r2-backend.cjs" }

# Patch fs in bundle
$mainPath = "$tempDir\dist\main.js"
$content = [System.IO.File]::ReadAllText($mainPath, [System.Text.Encoding]::UTF8)
$target = 'src = fs.readFileSync(src);'
$repl = 'src = (typeof fs.readFileSync === "function" ? fs : require("fs")).readFileSync(src);'
if ($content.Contains($target)) {
    $content = $content.Replace($target, $repl)
    [System.IO.File]::WriteAllText($mainPath, $content, [System.Text.Encoding]::UTF8)
    Write-Output "Patched pdfkit in bundle successfully."
}

Copy-Item "$repoRoot\apps\api\.env" "$tempDir\.env" -Force
Copy-Item "$repoRoot\apps\gateway\src\schema-meta.json" "$tempDir\data\schema-meta.json" -Force
Copy-Item "$repoRoot\apps\gateway\src\schema-uniques.json" "$tempDir\data\schema-uniques.json" -Force
Copy-Item "$repoRoot\apps\gateway\src\seed-data.json" "$tempDir\data\seed-data.json" -Force
@("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf") | ForEach-Object {
    Copy-Item "$ttfDir\$_" "$tempDir\fonts\$_" -Force
}
if (Test-Path "$repoRoot\tools\cloudflared.exe") {
    Copy-Item "$repoRoot\tools\cloudflared.exe" "$tempDir\tools\cloudflared.exe" -Force
}

if (Test-Path "$repoRoot\dist-fix") {
    Copy-Item "$tempDir\dist\main.js" "$repoRoot\dist-fix\main.js" -Force
}

$destZip = "$repoRoot\vaultra-vps.zip"
python -c "
import os, zipfile
src = r'$tempDir'
dst = r'$destZip'
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, _, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace('\\\\', '/')
            zi = zipfile.ZipInfo.from_file(full, rel)
            zi.compress_type = zipfile.ZIP_DEFLATED
            if rel.endswith('.sh'):
                zi.external_attr = 0o755 << 16
            with open(full, 'rb') as fp:
                zf.writestr(zi, fp.read())
"
Copy-Item $destZip "C:\Users\ADMIN\Downloads\BOX\vaultra-vps.zip" -Force
$mb = [Math]::Round((Get-Item $destZip).Length / 1MB, 2)
Write-Output "Created updated bundle & zip: $destZip and C:\Users\ADMIN\Downloads\BOX\vaultra-vps.zip ($mb MB)"
