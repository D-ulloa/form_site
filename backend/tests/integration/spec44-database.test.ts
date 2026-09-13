import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uri=process.env.SPEC44_DATABASE_URL;
if(uri && (!['127.0.0.1','localhost'].includes(new URL(uri).hostname) || !new URL(uri).pathname.startsWith('/spec44'))) {
  throw new Error('Disposable loopback spec44 database required');
}
test('SPEC-44 real PostgreSQL authorization, provisioning, atomic acceptance, privacy and lifecycle', {skip:!uri}, async()=>{
  const sql=fileURLToPath(new URL('../../../supabase/tests/spec44_personal_invitations.sql',import.meta.url));
  const output=await new Promise<string>((resolve,reject)=>{
    const child=spawn(process.env.SPEC44_PSQL ?? 'psql',[uri!,'-X','-v','ON_ERROR_STOP=1','-f',sql]);
    let text='';child.stdout.on('data',chunk=>{text+=chunk;});child.stderr.on('data',chunk=>{text+=chunk;});
    child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(new Error(text)));
  });
  assert.match(output,/SPEC-44 SQL assertions passed/);
});
