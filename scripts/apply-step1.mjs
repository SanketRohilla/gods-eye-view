import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 1. Safely update package.json without losing exports or dependencies
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.homepage = 'https://github.com/SanketRohilla/gods-eye-view#readme';
pkg.repository = {
  type: 'git',
  url: 'https://github.com/SanketRohilla/gods-eye-view.git',
};
pkg.bugs = {
  url: 'https://github.com/SanketRohilla/gods-eye-view/issues',
};
pkg.main = 'desktop/main.mjs';
pkg.engines = {
  node: '>=22.12.0',
};

pkg.scripts = {
  ...pkg.scripts,
  'desktop:dev': 'electron .',
  'desktop:pack': 'npm run build:panel && electron-builder --config desktop/electron-builder.json --dir',
  'desktop:dist:linux': 'npm run build:panel && electron-builder --config desktop/electron-builder.json --linux AppImage deb --publish never',
  'desktop:dist:win': 'npm run build:panel && electron-builder --config desktop/electron-builder.json --win nsis portable --publish never',
  'desktop:release': 'npm run build:panel && electron-builder --config desktop/electron-builder.json --publish always',
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('[Step 1] Updated package.json with SanketRohilla repo links and desktop scripts.');

// 2. Safely patch src/app/viewer.js for Retina / HiDPI Dynamic Resolution Scaling
const viewerPath = path.join(ROOT, 'src', 'app', 'viewer.js');
if (fs.existsSync(viewerPath)) {
  let viewerCode = fs.readFileSync(viewerPath, 'utf8');

  if (!viewerCode.includes('attachHiDpiResolutionGovernor')) {
    // Inject useBrowserRecommendedResolution: false into new Cesium.Viewer options if not present
    if (!viewerCode.includes('useBrowserRecommendedResolution')) {
      viewerCode = viewerCode.replace(
        /new\s+Cesium\.Viewer\s*\(\s*([^,]+)\s*,\s*\{/,
        'new Cesium.Viewer($1, {\n    useBrowserRecommendedResolution: false,'
      );
    }

    // Append helper function and hook before return viewer
    const governorHelper = `
function attachHiDpiResolutionGovernor(viewer) {
  if (!viewer || typeof window === 'undefined') return viewer;
  const getTargetScale = () => {
    const params = new URLSearchParams(window.location?.search || '');
    const maxParam = Number(params.get('maxPixelRatio'));
    const cap = Number.isFinite(maxParam) && maxParam >= 1 ? maxParam : 2.0;
    return Math.min(window.devicePixelRatio || 1, cap);
  };

  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = getTargetScale();
  if (viewer.scene && viewer.resolutionScale >= 1.5 && 'msaaSamples' in viewer.scene) {
    viewer.scene.msaaSamples = 2;
  }

  if (viewer.camera?.moveStart && viewer.camera?.moveEnd) {
    viewer.camera.moveStart.addEventListener(() => {
      if ((window.devicePixelRatio || 1) > 1.25) {
        viewer.resolutionScale = 1.0;
      }
    });
    viewer.camera.moveEnd.addEventListener(() => {
      viewer.resolutionScale = getTargetScale();
      viewer.scene?.requestRender?.();
    });
  }
  return viewer;
}
`;

    viewerCode = viewerCode.replace(
      /return\s+viewer\s*;/,
      'return attachHiDpiResolutionGovernor(viewer);'
    );
    viewerCode += '\n' + governorHelper;

    fs.writeFileSync(viewerPath, viewerCode, 'utf8');
    console.log('[Step 1] Patched src/app/viewer.js with Retina HiDPI Dynamic Resolution Governor.');
  } else {
    console.log('[Step 1] src/app/viewer.js already has the HiDPI Governor.');
  }
}
