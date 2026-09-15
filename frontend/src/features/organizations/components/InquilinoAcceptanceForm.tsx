import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { invitationAcceptanceContext } from '../services/organizationApi';

const schema = z.object({ contact_number: z.string().trim().max(64).refine(value => /^\+?[0-9 ()-]+$/u.test(value)
  && (value.match(/[0-9]/g)?.length ?? 0) >= 7 && (value.match(/[0-9]/g)?.length ?? 0) <= 15,
'Ingresá un teléfono de 7 a 15 dígitos. Podés usar +, espacios, guiones y paréntesis.') }).strict();
export type InquilinoProfileInput = z.infer<typeof schema>;
export function InquilinoAcceptanceForm({ pending, onAccept }: {
  pending: boolean; onAccept: (profile?: InquilinoProfileInput) => Promise<void>;
}) {
  const [attempt, setAttempt] = useState(0);
  const [context, setContext] = useState<{ required: boolean } | null>(null);
  const [error, setError] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<InquilinoProfileInput>({ resolver: zodResolver(schema) });
  useEffect(() => {
    const controller = new AbortController();
    void invitationAcceptanceContext(controller.signal).then(result => {
      if (!controller.signal.aborted) setContext({ required: result.requires_inquilino_profile });
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <div role="alert" className="mt-5"><p>No se pudo preparar la aceptación.</p>
    <Button variant="ghost" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Reintentar</Button></div>;
  if (!context) return <p role="status" className="mt-5">Preparando incorporación…</p>;
  if (!context.required) return <Button className="mt-5 w-full" loading={pending} aria-label="Aceptar invitación"
    onClick={() => { void onAccept(); }}>Aceptar invitación como Inquilino</Button>;
  return <form className="mt-5 grid gap-4" noValidate onSubmit={event => { void handleSubmit(onAccept)(event); }}>
    <Input label="Número de teléfono" type="tel" autoComplete="tel" required disabled={pending}
      {...register('contact_number')} error={errors.contact_number?.message} aria-describedby="tenant-contact-purpose" />
    <p id="tenant-contact-purpose" className="text-sm text-slate-400">El equipo y el personal asignado podrán consultar este número al atender tus solicitudes de arreglo.</p>
    <Button type="submit" loading={pending} aria-label="Aceptar invitación">Aceptar invitación como Inquilino</Button>
  </form>;
}
