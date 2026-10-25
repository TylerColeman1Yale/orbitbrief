import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);for(const f of ['report.html','slides.html'])if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing deliverable: ${f}`);console.log('OrbitBrief build check complete.');
