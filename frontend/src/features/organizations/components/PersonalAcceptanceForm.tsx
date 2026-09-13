import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

const text = (maximum: number) => z.string().trim().refine(value => [...value].length >= 1
  && [...value].length <= maximum && !/[\p{Cc}]/u.test(value), `Ingresá entre 1 y ${maximum} caracteres válidos.`);
const schema = z.object({ name: text(120), contact_number: text(64), occupation: text(120) }).strict();
export type PersonalProfileInput = z.infer<typeof schema>;

export function PersonalAcceptanceForm({ pending, onAccept }: {
  pending: boolean; onAccept: (profile: PersonalProfileInput) => Promise<void>;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<PersonalProfileInput>({
    resolver: zodResolver(schema), defaultValues: { name: '', contact_number: '', occupation: '' },
  });
  return <form className="mt-5 grid gap-4" noValidate onSubmit={event => { void handleSubmit(onAccept)(event); }}>
    <Input label="Nombre" required autoComplete="name" disabled={pending} {...register('name')} error={errors.name?.message} />
    <Input label="Número de contacto" type="tel" required autoComplete="tel" disabled={pending}
      {...register('contact_number')} error={errors.contact_number?.message} />
    <Input label="Ocupación" required autoComplete="organization-title" disabled={pending}
      {...register('occupation')} error={errors.occupation?.message} />
    <Button type="submit" className="w-full" loading={pending} aria-label="Aceptar invitación">Aceptar invitación como Personal</Button>
  </form>;
}
