import {defineConfig} from "@playwright/test";
// Proof-only fallback: use Chrome already installed on the GitHub-hosted runner.
// Real PPW Vite build, real bundled cards, existing authenticated game routes.
export default defineConfig({
 testDir:"./tests/browser",
 testMatch:["phase32-legend-tier-review.spec.ts","phase32-all-legend-reveals.spec.ts","phase32-collection-album.spec.ts"],
 timeout:45_000,
 reporter:"line",
 use:{baseURL:"http://127.0.0.1:4173",browserName:"chromium",channel:"chrome",
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,video:"on"},
 webServer:{command:"npm run web:preview",url:"http://127.0.0.1:4173",
  reuseExistingServer:false,timeout:60_000}
});
