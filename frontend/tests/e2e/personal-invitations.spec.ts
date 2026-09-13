import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const database=process.env.SPEC44_BROWSER_DATABASE_URL;
if(database && (!['127.0.0.1','localhost'].includes(new URL(database).hostname)||!new URL(database).pathname.startsWith('/spec44'))) throw new Error('Disposable database required');
const q=(value:string)=>`'${value.replaceAll("'","''")}'`;
function sql(statement:string) {
  return execFileSync(process.env.SPEC44_PSQL??'psql',[database!,'-XAtq','-v','ON_ERROR_STOP=1','-c',statement],{encoding:'utf8'}).trim();
}
async function login(page:Page,email:string,password='spec44-test-password') {
  await page.goto('/login');await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña',{exact:false}).fill(password);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Elegí una organización'})).toBeVisible();
}
for(const mode of ['new','existing'] as const) test(`SPEC-44 ${mode} account: invitation → profile → persisted personal home → login → suspension`,async({page,browser},testInfo)=>{
  test.skip(!database,'Requires disposable SPEC-44 API/PostgREST/browser fixtures');test.setTimeout(60_000);
  const email=mode==='new'?`new-${Date.now()}@example.test`:'existing-personal@example.test';
  await login(page,mode==='new'?'member@example.test':'owner@example.test');
  await page.goto('/t/azar/arrangements');await page.getByRole('button',{name:'Invitar personal',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Correo electrónico').fill(email);
  const created=page.waitForResponse(response=>response.url().endsWith('/personal/invitations')&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Generar invitación',exact:true}).click();
  const response=await created;expect(response.status()).toBe(201);
  const receipt=await response.json();await expect(dialog.getByLabel('Enlace de invitación')).toBeVisible();
  expect(sql(`select count(*) from public.organization_memberships m join auth.users u on u.id=m.user_id where u.email=${q(email)}`)).toBe('0');
  const invited=await browser.newContext({viewport:{width:390,height:844}});
  try {
    const target=await invited.newPage();const errors:string[]=[];target.on('pageerror',error=>errors.push(error.message));
    await target.goto(receipt.share_url);await expect(target.getByText('Personal',{exact:true})).toBeVisible();
    if(mode==='new') {
      await target.getByLabel('Nombre',{exact:false}).fill('Nombre global');
      await target.getByLabel('Contraseña',{exact:false}).first().fill('spec44-new-password');
      await target.getByLabel('Confirmar contraseña').fill('spec44-new-password');
      await target.getByRole('button',{name:'Crear cuenta',exact:true}).click();
    } else {
      await target.getByRole('tab',{name:'Iniciar sesión'}).click();
      await target.getByLabel('Correo electrónico').fill(email);
      await target.getByLabel('Contraseña',{exact:false}).fill('spec44-test-password');
      await target.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    }
    await expect(target.getByLabel('Número de contacto')).toBeVisible();
    await target.getByRole('button',{name:'Aceptar invitación',exact:true}).click();
    await expect(target.getByText(/Ingresá entre/).first()).toBeVisible();
    await target.getByLabel('Nombre',{exact:false}).fill(' Nombre local ');
    await target.getByLabel('Número de contacto').fill(' +58 00123-45 ');
    await target.getByLabel('Ocupación').fill(' Electricista ');
    const accepted=target.waitForResponse(r=>r.url().endsWith('/invitations/accept'));
    await target.getByRole('button',{name:'Aceptar invitación',exact:true}).click();expect((await accepted).status()).toBe(200);
    await expect(target).toHaveURL('/t/azar/personal');await expect(target.getByRole('main')).toHaveText('Inicio');
    await expect(target.getByRole('button')).toHaveCount(1);await expect(target.getByRole('link')).toHaveCount(0);
    expect(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await target.screenshot({path:testInfo.outputPath('personal-home-mobile.png'),fullPage:true});
    const persisted=JSON.parse(sql(`select json_build_object('name',m.personal_name,'contact',m.personal_contact_number,'occupation',m.personal_occupation,'global',p.display_name,'user',m.user_id,'version',m.version) from public.organization_memberships m join auth.users u on u.id=m.user_id join public.user_profiles p on p.user_id=u.id where u.email=${q(email)} and m.role='personal'`));
    expect(persisted).toMatchObject({name:'Nombre local',contact:'+58 00123-45',occupation:'Electricista',global:mode==='new'?'Nombre global':'existing-personal'});
    const context=await (await invited.request.get('/api/organizations/azar/context')).json();
    expect(context.capabilities).toEqual(['personal.home.read']);expect(JSON.stringify(context)).not.toContain('Electricista');
    for(const path of ['arrangements/orders','arrangements/properties','members','invitations','settings']) {
      expect((await invited.request.get(`/api/organizations/20000000-0000-4000-8000-000000000001/${path}`)).status()).toBe(403);
    }
    expect((await invited.request.get('/api/organizations/solar/context')).status()).toBe(404);
    await target.getByRole('button',{name:'Cerrar sesión'}).click();
    await login(target,email,mode==='new'?'spec44-new-password':'spec44-test-password');
    await target.getByRole('link',{name:/Azar/}).click();await expect(target).toHaveURL('/t/azar/personal');
    expect(sql(`select personal_contact_number from public.organization_memberships where user_id=${q(persisted.user)}`)).toBe('+58 00123-45');
    sql(`select public.spec26_mutate_membership('20000000-0000-4000-8000-000000000001',${q(persisted.user)},null,'suspended',${persisted.version},'test','30000000-0000-4000-8000-000000000001','spec44-browser-suspend')`);
    await target.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(target.getByRole('heading',{name:'Inicio',exact:true})).toHaveCount(0);
    expect((await invited.request.get('/api/organizations/azar/context')).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {await invited.close();}
});

test('SPEC-44 admin rotates and revokes a personal invitation from its receipt',async({page})=>{
  test.skip(!database,'Requires disposable SPEC-44 fixtures');
  await login(page,'admin@example.test');await page.goto('/t/azar/arrangements');
  await page.getByRole('button',{name:'Invitar personal',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Correo electrónico').fill(`rotate-${Date.now()}@example.test`);
  await dialog.getByRole('button',{name:'Generar invitación',exact:true}).click();
  const input=dialog.getByLabel('Enlace de invitación');await expect(input).toBeVisible();const old=await input.inputValue();
  await dialog.getByRole('button',{name:'Generar nuevo enlace'}).click();await expect(input).not.toHaveValue(old);
  await dialog.getByRole('button',{name:'Revocar invitación'}).click();await expect(dialog.getByText('Invitación revocada.')).toBeVisible();
  await expect(input).toHaveCount(0);
});
