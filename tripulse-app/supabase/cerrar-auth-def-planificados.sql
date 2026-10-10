/* ============================================================
   auth_def_planificados(): cerrada a quien no tiene sesión
   ============================================================

   Se creó el 2026-09-30 (deportista-ve-test-planificado.sql) y, como toda
   función nueva, nació abierta a public y a anon. El asesor de seguridad de
   Supabase la marcaba el 2026-10-10 como «se puede llamar sin sesión».

   No exponía nada: sin sesión, auth.uid() es nulo y devuelve vacío. Pero la
   regla de la casa es que SOLO dos funciones se llaman sin sesión, a
   propósito: reloj_completar e invitacion_por_token
   (seguridad-cerrar-funciones.sql).

   Quien tiene sesión la sigue necesitando: la regla
   test_definicion_dep_planificado (TO authenticated) la llama. Por eso se
   quita a public y a anon (quitar solo a anon no basta) y authenticated se
   queda. Así queda igual que su gemela auth_def_ids().

   ENSAYADO antes de aplicar, en una transacción deshecha: 28 cuentas, los
   mismos tests visibles antes y después; sin sesión da 42501 y con sesión
   funciona.

   DESHACER:
     grant execute on function public.auth_def_planificados() to public, anon;
*/

revoke execute on function public.auth_def_planificados() from public, anon;
grant execute on function public.auth_def_planificados() to authenticated;

/* Comprobar: anon false, authenticated true */
select has_function_privilege('anon', 'public.auth_def_planificados()', 'execute') as anon,
       has_function_privilege('authenticated', 'public.auth_def_planificados()', 'execute') as authenticated;
