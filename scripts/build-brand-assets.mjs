/** Static PPW presentation art built from original approved logo WebPs.
 * One intro image; real PNG install icons for iOS; crisp branded news mastheads.
 * All outputs are local build artifacts, never generated per player/session.
 */
import sharp from 'sharp';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const publicDir=join(process.cwd(),'apps/web/public');
const brand=join(publicDir,'branding');
await mkdir(brand,{recursive:true});
const clamp=x=>Math.min(255,Math.max(0,x));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
async function approvedForeground(file,fitWidth,fitHeight){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgba=Buffer.from(data),{width,height,channels}=info;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*channels,r=data[i],g=data[i+1],b=data[i+2];
  const bright=Math.max(r,g,b),chroma=bright-Math.min(r,g,b);
  // Fade the source's dark rectangular background; preserve real chrome logo.
  const base=smooth((bright-39)/111)*255;
  const perimeter=Math.min(x/width,(width-x-1)/width,y/height,(height-y-1)/height);
  const edge=smooth(perimeter/.065);
  const colour=smooth((chroma-22)/72);
  rgba[i+3]=Math.round(clamp(Math.max(base,colour*120)*edge*(data[i+3]/255)));
 }
 return sharp(rgba,{raw:{width,height,channels:4}})
  .resize({width:fitWidth,height:fitHeight,fit:'inside'}).png().toBuffer();
}
// A single full-size WebP: the approved hero logo is blended into the art.
const W=1080,H=2340;
const backdrop=await readFile(join(brand,'intro-backdrop.svg'));
const hero=await approvedForeground(join(brand,'ppw-showcase-hero.webp'),1015,550);
const hm=await sharp(hero).metadata();
const hx=Math.round((W-hm.width)/2),hy=Math.round((H-hm.height)/2-75);
const tagline=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2340"><text x="540" y="'+(hy+hm.height+136)+'" fill="#a8edff" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800" letter-spacing="9" text-anchor="middle">THE LIVING WRESTLING WORLD</text><path d="M310 '+(hy+hm.height+177)+' H770" stroke="#81cfff" stroke-width="2" stroke-opacity=".3"/></svg>');
await sharp(backdrop).composite([{input:hero,left:hx,top:hy},{input:tagline,left:0,top:0}])
 .webp({quality:91,effort:5}).toFile(join(brand,'ppw-intro-stage.webp'));
// iPhone Home Screen must get an actual PNG, not just the SVG manifest fallback.
const badge=await approvedForeground(join(brand,'ppw-showcase-badge.webp'),484,484);
const bm=await sharp(badge).metadata();
const iconBg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><radialGradient id="g" cx=".33" cy=".8" r=".95"><stop stop-color="#12384c"/><stop offset=".52" stop-color="#12112c"/><stop offset="1" stop-color="#090d22"/></radialGradient><radialGradient id="p"><stop stop-color="#de2698" stop-opacity=".22"/><stop offset="1" stop-color="#de2698" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/><ellipse cx="450" cy="150" rx="300" ry="270" fill="url(#p)"/></svg>');
const icon=await sharp(iconBg).composite([{
 input:badge,left:Math.floor((512-bm.width)/2),top:Math.floor((512-bm.height)/2)
}]).png().toBuffer();
await sharp(icon).resize(180,180).png().toFile(join(publicDir,'apple-touch-icon.png'));
await sharp(icon).resize(192,192).png().toFile(join(publicDir,'icon-192.png'));
await sharp(icon).png().toFile(join(publicDir,'icon-512.png'));
for(const [source,destination] of [
 ['news-official-vector.svg','news-official-crisp.webp'],
 ['news-dirt-vector.svg','news-dirt-crisp.webp']
]){
 await sharp(await readFile(join(brand,source))).webp({quality:94,effort:5})
  .toFile(join(brand,destination));
}
console.log('Prepared approved PPW intro, Apple PNG icon and crisp news mastheads');
