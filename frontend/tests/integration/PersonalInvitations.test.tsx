// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { InvitationAcceptPage } from '../../src/pages/InvitationAcceptPage';
import { acceptInvitation, establishInvitationHandoff, resolveInvitation } from '../../src/features/organizations/services/organizationApi';

const auth = vi.hoisted(()=>({status:'authenticated',session:{user:{id:'account-a',email:'personal@example.test'}},refresh:vi.fn(),logout:vi.fn()}));
vi.mock('../../src/app/contexts/AuthenticationContext',()=>({useAuthentication:()=>auth}));
vi.mock('../../src/features/organizations/services/organizationApi',()=>({acceptInvitation:vi.fn(),establishInvitationHandoff:vi.fn(),resolveInvitation:vi.fn(),registerInvitationAccount:vi.fn()}));
beforeEach(()=>{
  auth.status='authenticated';auth.session={user:{id:'account-a',email:'personal@example.test'}};
  vi.mocked(resolveInvitation).mockResolvedValue({organization_display_name:'Azar',email_masked:'p***@example.test',intended_role:'personal',expires_at:'2099-01-01T00:00:00Z'});
  vi.mocked(establishInvitationHandoff).mockResolvedValue();
  vi.mocked(acceptInvitation).mockResolvedValue({organization_id:'org-a',organization_slug:'azar'});
  window.history.replaceState(null,'','/invitations/accept');
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
const view=()=> <MemoryRouter><InvitationAcceptPage /></MemoryRouter>;
function fill() {
  fireEvent.change(screen.getByLabelText(/^Nombre/),{target:{value:' Ana local '}});
  fireEvent.change(screen.getByLabelText(/^Número de contacto/),{target:{value:' +58 00123 '}});
  fireEvent.change(screen.getByLabelText(/^Ocupación/),{target:{value:' Electricista '}});
}
it('requires all three fields after authentication and submits only the trimmed profile',async()=>{
  render(view());await screen.findByLabelText(/^Número de contacto/);
  fireEvent.click(screen.getByRole('button',{name:'Aceptar invitación'}));
  await screen.findAllByText(/Ingresá entre/);expect(acceptInvitation).not.toHaveBeenCalled();
  fill();fireEvent.click(screen.getByRole('button',{name:'Aceptar invitación'}));
  await waitFor(()=>expect(acceptInvitation).toHaveBeenCalledWith({name:'Ana local',contact_number:'+58 00123',occupation:'Electricista'},expect.any(AbortSignal)));
  expect(screen.queryByRole('combobox')).toBeNull();
});
it('keeps editable values after failed acceptance and clears them when the identity changes',async()=>{
  vi.mocked(acceptInvitation).mockRejectedValueOnce(new Error('retry'));
  const mounted=render(view());await screen.findByLabelText(/^Número de contacto/);fill();
  fireEvent.click(screen.getByRole('button',{name:'Aceptar invitación'}));await screen.findByText('No se pudo aceptar');
  expect((screen.getByLabelText(/^Nombre/) as HTMLInputElement).value).toBe(' Ana local ');
  auth.session={user:{id:'account-b',email:'another@example.test'}};mounted.rerender(view());
  expect((await screen.findByLabelText(/^Número de contacto/) as HTMLInputElement).value).toBe('');
});
it('offers profile fields only after authenticating, and does not request them for other roles',async()=>{
  auth.status='anonymous';const mounted=render(view());await screen.findByRole('button',{name:'Crear cuenta'});
  expect(screen.queryByLabelText(/^Número de contacto/)).toBeNull();
  auth.status='authenticated';mounted.rerender(view());await screen.findByLabelText(/^Número de contacto/);
  cleanup();vi.mocked(resolveInvitation).mockResolvedValue({organization_display_name:'Azar',email_masked:'m***@example.test',intended_role:'member',expires_at:'2099-01-01T00:00:00Z'});
  render(view());await screen.findByRole('button',{name:'Aceptar invitación'});expect(screen.queryByLabelText(/^Número de contacto/)).toBeNull();
});
it('aborts acceptance after changing accounts and ignores the previous response',async()=>{
  let finish!: (result:{organization_id:string;organization_slug:string})=>void;
  vi.mocked(acceptInvitation).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const mounted=render(view());await screen.findByLabelText(/^Número de contacto/);fill();
  fireEvent.click(screen.getByRole('button',{name:'Aceptar invitación'}));await waitFor(()=>expect(finish).toBeDefined());
  const signal=vi.mocked(acceptInvitation).mock.calls[0][1]!;
  auth.session={user:{id:'account-b',email:'another@example.test'}};mounted.rerender(view());
  await screen.findByLabelText(/^Número de contacto/);expect(signal.aborted).toBe(true);
  finish({organization_id:'org-a',organization_slug:'azar'});
  await waitFor(()=>expect(screen.queryByText(/fue aceptada/)).toBeNull());
});
