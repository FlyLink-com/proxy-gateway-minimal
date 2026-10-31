import { pathToFileURL } from 'node:url';
import { parseArguments, runM0A2V7, runSelfTests } from './lib/m0-a2-1-v7-diagnostic.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const parsedArgs = parseArguments(process.argv.slice(2));
  if (parsedArgs.error) {
    console.log(`result=blocked stage=argument_validation code=${parsedArgs.error}`);
    process.exit(2);
  }
  if (parsedArgs.mode === 'self-test') { runSelfTests(); process.exit(0); }
  await runM0A2V7(parsedArgs.expectedRelease);
}
