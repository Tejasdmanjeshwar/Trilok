#!/usr/bin/env node
/**
 * Cheap, source-only portability gate. Gameplay/anatomy contracts stay free of
 * rendering runtimes and app entrypoints; cross-language parity requires
 * separate fixture/replay tests during the eventual Unity migration.
 *
 * This intentionally scans import forms (not incidental documentation words).
 * Rendering and editor code is allowed in apps/web; no Unity SDK is required.
 */
import {readdirSync,readFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";

const roots=["packages/core/src","packages/combat/src","packages/combat-ai/src",
  "packages/character-core/src","packages/choreography/src","packages/input/src"];
const forbidden=/^(?:three(?:\/|$)|@types\/three(?:\/|$)|@trilok\/web(?:\/|$)|unityengine(?:\/|$)|@unity(?:\/|$))/i;
const imports=/\b(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
const failures=[];
let fileCount=0;
for(const root of roots){
  const stack=[resolve(root)];
  while(stack.length){
    const dir=stack.pop();
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isDirectory()){stack.push(path);continue;}
      if(!entry.isFile()||!entry.name.endsWith(".ts"))continue;
      fileCount++;
      const source=readFileSync(path,"utf8");
      for(const match of source.matchAll(imports)){
        const dependency=match[1];
        if(forbidden.test(dependency)||/(?:^|\/)apps\/(?:web|unity)(?:\/|$)/i.test(dependency)){
          const line=source.slice(0,match.index).split("\n").length;
          failures.push(`${relative(".",path)}:${line}: disallowed presentation/editor import ${dependency}`);
        }
      }
    }
  }
}
if(failures.length){
  process.stderr.write("Portable package boundary violation:\n"+failures.join("\n")+"\n");
  process.exitCode=1;
}else{
  process.stdout.write(`Portable import boundary verified: ${fileCount} TypeScript files across ${roots.length} packages.\n`);
}
