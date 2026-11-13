#!/usr/bin/env node
'use strict';
// Seven browser/session cases plus a legacy migration/replay case; existing Compose deployment only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(process.argv[2]||process.cwd()),base='http://localhost:3000',runId='a1-session-'+randomUUID();
const f={runId,users:[runId+'-u0',runId+'-u1'],products:[runId+'-p0',runId+'-p1'],emails:[runId+'-a@example.invalid',runId+'-b@example.invalid'],password:randomUUID()+'A1!'};
const reportDir=path.join(__dirname,'BrewLite_A1_Session_Legacy_'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(reportDir,{recursive:true});
const report={helperVersion:1,startedAt:new Date().toISOString(),baseSourceSha:'d42deb5023ec0323b3d8ba1357b9694db7e1c921',backendImageSourceSha:'88f5f35f3bb921bd68be2d0f8c70bd6736ab101e',passed:false,cleanup:false,host:{platform:process.platform,node:process.version,release:os.release()}};
const secrets=[f.password],dockerExe=process.platform==='win32'?'docker.exe':'docker',gitExe=process.platform==='win32'?'git.exe':'git';
const composeArgs=['compose','--env-file',path.join(root,'.env.compose')];let fixtureStarted=false,baseline;
function redact(s) { for (const secret of secrets) if (secret) s = String(s).split(secret).join('[redacted]'); return String(s); }
function log(s) { s = redact(s); console.log(s); fs.appendFileSync(path.join(reportDir, 'run.txt'), s + '\n'); }
function run(exe, args, options = {}) {
  const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout || 180000, input: options.input, env: { ...process.env, ...options.env } });
  if (r.error) throw Error('Command could not finish: ' + r.error.code);
  if (!options.allowFailure && r.status !== 0) throw Error('Command failed (exit ' + r.status + '): ' + redact((r.stderr || r.stdout || '').slice(-2200)));
  return r;
}
function dc(args, options) { return run(dockerExe, [...composeArgs, ...args], options); }
function jsonRows(s) { s = s.trim(); if (!s) return []; return s.startsWith('[') ? JSON.parse(s) : s.split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function healthy() {
  const rows = jsonRows(dc(['ps', '--format', 'json']).stdout);
  for (const service of ['db', 'backend', 'frontend']) {
    const row = rows.find(x => x.Service === service); assert(row, 'Missing Compose service: ' + service);
    assert.equal(row.State, 'running', service + ' is not running'); assert.equal(row.Health, 'healthy', service + ' is not healthy');
  }
  return rows.map(x => ({ service: x.Service, name: x.Name, state: x.State, health: x.Health, image: x.Image }));
}

const files=['session-browser.mjs','session-db.mjs','legacy-preservation.mjs'];
function hook(action,input={}){const source='const f='+JSON.stringify(f)+';const action='+JSON.stringify(action)+';const input='+JSON.stringify(input)+';\n'+fs.readFileSync(path.join(__dirname,'session-db.mjs'),'utf8');const r=dc(['exec','-T','-w','/app/apps/api','backend','node','--input-type=module'],{input:source});const marker='SESSION_DB_RESULT=',line=r.stdout.split(/\r?\n/).find(l=>l.startsWith(marker));assert(line,'Missing session fixture result');return JSON.parse(line.slice(marker.length));}
async function browser(baseline=false){const output=baseline?path.join(reportDir,'baseline'):reportDir;fs.mkdirSync(output,{recursive:true});return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[baseline?path.join(root,'apps/web/scripts/check-workflow-browser.mjs'):path.join(__dirname,'session-browser.mjs')],{cwd:root,env:{...process.env,A1_SESSION_FIXTURE:JSON.stringify(f),A1_TEST_WEB:base,A1_REPO_ROOT:root,A1_TEST_REPORT_DIR:output,A1_TEST_EMAIL:f.emails[0],A1_TEST_PASSWORD:f.password,A1_TEST_PRODUCT:f.products[0]},stdio:['ignore','pipe','pipe'],shell:false});const timer=setTimeout(()=>{c.kill('SIGTERM');reject(Error('Browser deadline exceeded; stopped this helper browser process.'));},240000);for(const stream of [c.stdout,c.stderr])stream.on('data',chunk=>log(String(chunk).trimEnd()));c.once('error',e=>{clearTimeout(timer);reject(e);});c.once('close',code=>{clearTimeout(timer);resolve(code);});});}
(async()=>{
 try{
  log('SESSION/LEGACY CHECK START: '+report.startedAt);report.sha=run(gitExe,['rev-parse','HEAD']).stdout.trim();run(gitExe,['merge-base','--is-ancestor',report.baseSourceSha,'HEAD']);const expectedBlobs={"apps/web/src/features/cart/cart-activation-v2.ts": "d38f994efc34dd17722555c8aa29c507a9377529", "apps/web/src/features/cart/cart-activation-v2.test.mjs": "96328a1de6c7429beb178d6c4193123dfe9a1a4b", "apps/web/src/features/cart/cart-provider-v2.tsx": "c88d8f1cf936785e35a08f9c89f1d47317681ed0"};for(const [p,blob]of Object.entries(expectedBlobs))assert.equal(run(gitExe,['rev-parse','HEAD:'+p]).stdout.trim(),blob,'Expected reviewed rollout fix: '+p);assert.deepEqual(run(gitExe,['diff','--name-only',report.baseSourceSha,'HEAD','--','apps']).stdout.trim().split(/\r?\n/).filter(Boolean).sort(),Object.keys(expectedBlobs).sort(),'Application diff must be exactly the three reviewed rollout files');report.applicationGitBlobs=expectedBlobs;assert.equal(run(gitExe,['status','--porcelain']).stdout.trim(),'','Working tree must be clean');
  const config=JSON.parse(dc(['config','--format','json']).stdout);secrets.push(config.services.db.environment.POSTGRES_PASSWORD,config.services.backend.environment.AUTH_JWT_SECRET);assert.equal(config.name,'brewlite-sprint3');assert(!config.services.db.ports?.length&&!config.services.backend.ports?.length);assert.equal(String(config.services.frontend.environment.CHECKOUT_V2_ENABLED),'1');
  report.servicesBefore=healthy();report.imageIds={};const expected={backend:'sha256:93c73e1dd9c20e558c64f08aac6f859792384ed430653ec27f7b522be71e0e7b',frontend:'sha256:bb88e42438f0a4abdfad51c87a10dd58fca8747c3d151d3a73b6a22bcdc9ab05',db:'sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994'};
  for(const service of ['backend','frontend','db']){const id=dc(['ps','-q',service]).stdout.trim(),image=run(dockerExe,['inspect','--format','{{.Image}}',id]).stdout.trim();if(service==='frontend')assert.notEqual(image,expected[service],'Rebuild/recreate frontend with the rollout fix before running');else assert.equal(image,expected[service],'Unexpected backend/DB image: '+service);report.imageIds[service]=image;}
  report.scriptSha256=Object.fromEntries(files.map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(__dirname,n))).digest('hex')]));report.docker=run(dockerExe,['--version']).stdout.trim();report.compose=dc(['version']).stdout.trim();
  log('STEP: isolated schema migration and legacy replay');const legacy=dc(['exec','-T','-w','/app/apps/api','backend','node','--input-type=module'],{input:fs.readFileSync(path.join(__dirname,'legacy-preservation.mjs'),'utf8'),allowFailure:true});const marker='LEGACY_DB_RESULT=',line=legacy.stdout.split(/\r?\n/).find(l=>l.startsWith(marker));assert(line,'Missing legacy result');report.legacy=JSON.parse(line.slice(marker.length));assert.equal(legacy.status,0,'Legacy check failed: '+(report.legacy.error||'unknown'));assert(report.legacy.passed&&report.legacy.cleanup);log('PASS LEGACY: exact migration SQL, preserved digest, replay and policy1 read-only; private schema removed.');
  baseline=hook('baseline');fixtureStarted=true;hook('init');assert.equal(run(gitExe,['rev-parse','HEAD:apps/web/scripts/check-workflow-browser.mjs']).stdout.trim(),'f9a248160eab2b3ced5647d1c4110ef5e906c32f','Existing browser runner changed');log('STEP: real browser session/expiry/storage checks');report.browserExitCode=await browser();const browserFile=path.join(reportDir,'session-browser-result.json');if(fs.existsSync(browserFile))report.browser=JSON.parse(fs.readFileSync(browserFile,'utf8'));assert.equal(report.browserExitCode,0,'Browser checks did not complete successfully');assert.equal(report.browser?.checks.length,7);assert(report.browser?.passed);assert.deepEqual(report.browser.pageErrors,[]);log('STEP: existing nine-step browser regression');report.baselineExitCode=await browser(true);const baselineFile=path.join(reportDir,'baseline/browser-result.json');if(fs.existsSync(baselineFile))report.baselineBrowser=JSON.parse(fs.readFileSync(baselineFile,'utf8'));assert.equal(report.baselineExitCode,0);assert(report.baselineBrowser?.passed);assert.equal(report.baselineBrowser.checks,9);assert.deepEqual(report.baselineBrowser.pageErrors,[]);report.servicesAfter=healthy();report.passed=true;
 }catch(e){report.error=redact(e.message||String(e));log('FAIL: '+report.error);process.exitCode=1;}
 finally{
  if(fixtureStarted){try{const result=hook('cleanup');assert(result.cleaned);assert.deepEqual(result.inventory,baseline.inventory);report.cleanup=true;report.demoInventoryUnchanged=true;log('Session fixture cleanup completed; existing Product inventory unchanged.');}catch(e){report.cleanupError=redact(e.message);report.remainingFixture={runId,users:f.users,products:f.products};log('CLEANUP FAILED: '+report.cleanupError);process.exitCode=1;}}
  report.passed=report.passed&&report.cleanup;report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(reportDir,'session-legacy-result.json'),JSON.stringify(report,null,2));const count=(report.legacy?.passed?1:0)+(report.browser?.checks.filter(x=>x.passed).length||0)+(report.baselineBrowser?.passed?1:0);log('SESSION/LEGACY CHECKS: '+count+'/9 '+(report.passed?'PASSED':'INCOMPLETE/FAILED'));log('REPORT: '+reportDir);if(report.passed)log('SESSION_LEGACY_CHECKS_PASSED');else process.exitCode=1;
 }
})();
