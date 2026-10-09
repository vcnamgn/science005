/** Vérifie la synchronisation de la documentation et ses liens locaux. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=JSON.parse(fs.readFileSync(path.join(root,'docs/api-index.json'),'utf8'));
const digest=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
let checked=0;
if(digest(fs.readFileSync(path.join(root,'docs/CONCEPTION.md'),'utf8'))!==index.noteHash)throw new Error('Note modifiée : régénérer la documentation.');
for(const module of index.modules){
  const source=fs.readFileSync(path.join(root,module.file),'utf8');
  if(digest(source)!==module.sha256)throw new Error(`Source modifiée : régénérer ${module.file}.`);
  for(const fn of module.functions){
    if(!source.split('\n')[fn.line-1].includes(`function ${fn.name}(`))throw new Error(`Ancre source incorrecte : ${module.file}:${fn.line}`);
    checked++;
  }
}
if(!index.documentationPages?.length)throw new Error('Pages HTML de documentation absentes : régénérer.');
let linkCount=0;
function checkLinks(html,file){
  const doc=path.join(root,file);
  for(const [,href] of html.matchAll(/\bhref="([^"]+)"/g)){
    if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href))continue;
    const [url,fragment]=href.split('#'),local=url.split('?')[0];
    if(/\.md$/i.test(local))throw new Error(`Lecture Markdown brute : ${file} → ${href}`);
    const target=local?path.resolve(path.dirname(doc),decodeURIComponent(local)):doc;
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target))throw new Error(`Lien local absent : ${file} → ${href}`);
    if(fragment&&/\.html$/i.test(target)){
      const targetHtml=target===doc?html:fs.readFileSync(target,'utf8');
      const ids=new Set([...targetHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
      if(!ids.has(decodeURIComponent(fragment)))throw new Error(`Ancre absente : ${file} → ${href}`);
    }
    linkCount++;
  }
}
for(const page of index.documentationPages){
  const markdown=fs.readFileSync(path.join(root,page.source),'utf8');
  if(digest(markdown)!==page.sha256)throw new Error(`Document modifié : régénérer ${page.source}.`);
  const html=fs.readFileSync(path.join(root,page.output),'utf8');
  if(!html.includes('<html lang="fr">')||!/<h1\b/.test(html))throw new Error(`Page HTML incomplète : ${page.output}`);
  checkLinks(html,page.output);
}
const simulatorHtml=fs.readFileSync(path.join(root,'simulateur/centurion.html'),'utf8');
checkLinks(simulatorHtml,'simulateur/centurion.html');
if(!simulatorHtml.includes('href="../docs/index.html#api"'))throw new Error('Lien Modèle vers l’API incorrect.');
const obsolete=JSON.parse(fs.readFileSync(path.join(root,'scripts/publication-exclusions.json'),'utf8')).obsolete;
const activeFiles=['simulateur/centurion.html','simulateur/centurion-cc-regul.html','simulateur/centurion-app.js','simulateur/centurion-svg-bridge.js'];
for(const file of activeFiles){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  for(const old of obsolete){
    const basename=path.basename(old);
    if(text.includes(basename))throw new Error(`Dépendance obsolète : ${file} → ${basename}`);
  }
}
console.log(`Documentation cohérente : ${index.documentationPages.length} pages HTML, ${linkCount} liens locaux et fragments, ${checked} ancres de fonctions, aucun lien de lecture Markdown brut.`);
