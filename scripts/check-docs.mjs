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
const doc=path.join(root,'docs/index.html'),html=fs.readFileSync(doc,'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const [,href] of html.matchAll(/\bhref="([^"]+)"/g)){
  if(/^(?:https?:|mailto:)/.test(href))continue;
  const [file,fragment]=href.split('#');
  if(!file){if(fragment&&!ids.has(fragment))throw new Error(`Ancre absente : ${href}`);continue;}
  const target=path.resolve(path.dirname(doc),decodeURIComponent(file));
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target))throw new Error(`Lien local absent : ${href}`);
  if(fragment&&target===doc&&!ids.has(fragment))throw new Error(`Ancre absente : ${href}`);
}
const obsolete=JSON.parse(fs.readFileSync(path.join(root,'scripts/publication-exclusions.json'),'utf8')).obsolete;
const activeFiles=['simulateur/centurion.html','simulateur/centurion-cc-regul.html','simulateur/centurion-app.js','simulateur/centurion-svg-bridge.js'];
for(const file of activeFiles){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  for(const old of obsolete){
    const basename=path.basename(old);
    if(text.includes(basename))throw new Error(`Dépendance obsolète : ${file} → ${basename}`);
  }
}
console.log(`Documentation cohérente : ${checked} ancres de fonctions, liens locaux présents, aucun ancien actif référencé.`);
