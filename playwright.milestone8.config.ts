import {defineConfig} from "@playwright/test";

export default defineConfig({
 testDir:"./tests/browser",
 testMatch:"milestone8-*.spec.ts",
 outputDir:process.env.PPW_M8_REPORT_DIR??"test-results/milestone8",
 timeout:180_000,
 workers:1,
 reporter:"line",
 use:{
  browserName:process.env.PPW_M8_BROWSER==="webkit"?"webkit":"chromium",
  launchOptions:process.env.PPW_M8_CHROMIUM?{executablePath:process.env.PPW_M8_CHROMIUM}:undefined,
  viewport:{width:Number(process.env.PPW_M8_WIDTH??390),height:844},
  isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,
  reducedMotion:process.env.PPW_M8_REDUCED_MOTION==="1"?"reduce":"no-preference",
  actionTimeout:10_000,
  trace:"retain-on-failure",
 }
});
