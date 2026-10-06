/** Assemble les paliers pédagogiques sans requête réseau, pour fonctionner aussi en file://. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'simulateur/centurion-cc-regul.html');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'scripts/cc-solution-tiers.json'),'utf8'));
const read=kind=>JSON.parse(fs.readFileSync(path.join(root,`simulateur/modele-de-${kind}.simurep_complet.json`),'utf8').replace(/^\uFEFF/,''));
const regulation=read('regulation'),protection=read('protection');
// Remonter les liaisons conserve les paramètres et la géométrie des chaînes finales.
function subset(model,outputs,exclude=new Set(),name){
  const ids=new Set(model.nodes.filter(n=>outputs.includes(n.type)&&!exclude.has(n.id)).map(n=>n.id));
  let changed=true;
  while(changed){changed=false;for(const link of model.links)if(ids.has(link.to)&&!exclude.has(link.from)&&!ids.has(link.from)){ids.add(link.from);changed=true;}}
  return {...model,name,nodes:model.nodes.filter(n=>ids.has(n.id)),links:model.links.filter(l=>ids.has(l.from)&&ids.has(l.to))};
}
const models={
  solutionDataComplete:regulation,
  solutionDataGv:subset(regulation,['gv1Out','gv2Out','gv3Out','gv4Out'],new Set(),'Niveaux des quatre GV'),
  solutionDataGcp:subset(regulation,['g3Out'],new Set(),'Programme GCP · G3'),
  solutionDataProtectAar:subset(protection,['aarOut'],new Set(['N51','N57']),'Les principaux AAR'),
  solutionDataProtectIs:subset(protection,['aarOut','risOut'],new Set(),'AAR + IS'),
  solutionDataProtectComplete:protection,
  solutionCatalog:catalog
};
let html=fs.readFileSync(file,'utf8');
for(const [id,model] of Object.entries(models)){
  const script=`<script type="application/json" id="${id}">${JSON.stringify(model).replace(/</g,'\\u003c')}</script>`;
  const expression=new RegExp(`<script type="application/json" id="${id}">[\\s\\S]*?<\\/script>`);
  if(expression.test(html))html=html.replace(expression,()=>script);
  else html=html.replace('  <script>','  '+script+'\n  <script>');
}
// Les trois anciens paliers restent les modèles simplifiés historiques embarqués.
for(const tier of Object.values(catalog.regul))if(!html.includes(`id="${tier.dataId}"`))throw Error(`Palier absent : ${tier.dataId}`);
fs.writeFileSync(file,html);
console.log(`Solutions assemblées : 6 régulation, 3 protection ; complets = ${regulation.nodes.length} / ${protection.nodes.length} blocs.`);
