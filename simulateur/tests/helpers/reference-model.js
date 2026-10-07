// Les solutions embarquées sont la référence publiée ; pas les archives DFL.
const fs=require('node:fs'),path=require('node:path');
module.exports=function referenceModel(mode){
  const html=fs.readFileSync(path.join(__dirname,'../../centurion-cc-regul.html'),'utf8');
  const id=mode==='protect'?'solutionDataProtectComplete':'solutionDataComplete';
  const source=new RegExp(`<script[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`).exec(html);
  if(!source)throw new Error(`Solution complète ${mode} absente`);
  return JSON.parse(source[1]);
};
