/* ============================================================
   El código de invitación, con un generador de verdad
   ============================================================
   `gen_codigo_invitacion` sacaba sus ocho caracteres de `random()`, que en
   Postgres es un generador pseudoaleatorio normal y corriente: rápido y
   perfectamente adecuado para barajar filas, pero NO criptográfico. Su estado
   se puede deducir observando salidas suficientes.

   Y este código no es un adorno: con él se crea una cuenta y se decide el ROL
   de quien entra. Es de las poquísimas cadenas de la app donde la calidad del
   azar importa de verdad.

   `gen_random_uuid()` sí es criptográfico y viene de serie desde Postgres 13,
   sin instalar ninguna extensión. De su hexadecimal se sacan los ocho
   caracteres.

   EL RESTO DE LA FUNCIÓN NO CAMBIA
   Mismo alfabeto sin caracteres que se confunden al dictarlos por teléfono
   (ni O ni 0, ni I ni 1), mismo largo, mismo bucle que reintenta si el código
   ya existiera. Solo cambia de dónde sale el azar.
   ============================================================ */

create or replace function public.gen_codigo_invitacion()
returns text language plpgsql security definer set search_path = public as $$
declare
  _alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _cod  text;
  _hex  text;
  _i    int;
  _n    int;
begin
  loop
    _cod := '';
    /* Un uuid da 32 caracteres hexadecimales; hacen falta 16 para ocho parejas. */
    _hex := replace(gen_random_uuid()::text, '-', '');

    for _i in 1..8 loop
      /* Cada pareja hexadecimal es un byte, 0 a 255. El sesgo de repartir 256
         entre 31 es minúsculo y no es lo que estaba mal: lo que estaba mal era
         la fuente. */
      _n := ('x' || substr(_hex, (_i - 1) * 2 + 1, 2))::bit(8)::int;
      _cod := _cod || substr(_alfabeto, 1 + (_n % length(_alfabeto)), 1);
    end loop;

    exit when not exists (select 1 from invitacion where codigo = _cod);
  end loop;

  return _cod;
end $$;

comment on function public.gen_codigo_invitacion is
  'Codigo de alta de 8 caracteres. El azar sale de gen_random_uuid(), no de random().';

/* Comprobacion rapida: deberian salir ocho codigos distintos, todos de 8
   caracteres y sin O, 0, I ni 1.

   select gen_codigo_invitacion() from generate_series(1, 8);
*/
