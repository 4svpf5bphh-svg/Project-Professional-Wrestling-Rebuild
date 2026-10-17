import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/browser",timeout:30_000,reporter:"line",
 use:{baseURL:"http://127.0.0.1:4173",browserName:"chromium",
  viewport:{width:390,height:844},isMobile:true,hasTouch:true},
 webServer:{command:"npm run web:preview",url:"http://127.0.0.1:4173",
  reuseExistingServer:!process.env.CI,timeout:30_000}
});
