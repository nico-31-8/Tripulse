/* ============================================================
   ENSAYO de pliometria.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada. Acaba en un error a propósito que trae
   el informe, y ese error deshace TODO.

   1. CONTROL: las columnas todavía no existen.
   2. La migración, con las mismas sentencias que el fichero.
   3. Lo que tiene que quedar: cuántos ejercicios por parte y por nivel, los de
      antes con sus otros tipos, las reglas de las columnas y de la altura, que
      un entrenador normal los ve, y que pasarla dos veces no duplica nada.

   «Entrenador normal» = sin plataforma_admin. No lleva ids escritos.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);

create function pg_temp.como(_sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    execute _sql;
    _res := 'ENTRA';
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  return _res;
end $f$;

create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

insert into _informe (linea)
select 'CONTROL columnas nuevas: ' || count(*) || ' (debe ser 0)'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ejercicios_biblioteca'
   and column_name in ('nivel_pliometria', 'parte_pliometria');

alter table public.ejercicios_biblioteca
  add column if not exists nivel_pliometria text,
  add column if not exists parte_pliometria text;

alter table public.ejercicios_biblioteca
  drop constraint if exists ejercicios_biblioteca_nivel_pliometria_check,
  add constraint ejercicios_biblioteca_nivel_pliometria_check
    check (nivel_pliometria is null or nivel_pliometria in ('a', 'b', 'c', 'd', 'e')),
  drop constraint if exists ejercicios_biblioteca_parte_pliometria_check,
  add constraint ejercicios_biblioteca_parte_pliometria_check
    check (parte_pliometria is null or parte_pliometria in ('inferior', 'superior', 'tronco'));

alter table public.ejercicios
  drop constraint if exists ejercicios_control_tipo_check,
  add constraint ejercicios_control_tipo_check
    check (control_tipo = any (array['rir', 'rpe', 'vel', 'vel_ms', 'pct1rm', 'altura']));

update public.ejercicios_biblioteca b
   set tipo = case when 'Pliometría' = any (coalesce(b.tipo, '{}')) then b.tipo else coalesce(b.tipo, '{}') || array['Pliometría'] end,
       grupo_muscular = 'Pliometría',
       nivel_pliometria = v.nivel,
       parte_pliometria = 'inferior'
  from (values
    ('Salto de cuerda', 'a'),
    ('Jump squat', 'b'),
    ('Box jump', 'b'),
    ('Depth jump', 'c'),
    ('Bounding', 'd'),
    ('Single-leg hop horizontal', 'd')
  ) as v(nombre, nivel)
 where b.nombre = v.nombre and b.id_entrenador is null and b.id_deportista is null;

insert into public.ejercicios_biblioteca
  (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, lesion, momento, nivel_pliometria, parte_pliometria)
select v.nombre, 'Pliometría', v.descripcion, v.ejecucion, array['Pliometría'], v.region, v.disciplina,
       '{}'::text[], '{}'::text[], v.nivel, v.parte
  from (values
    ('Pogo jumps', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rigidez de tobillo y contacto corto: la base de toda la pliometría.', '1) De pie, pies a la anchura de la cadera y rodillas casi rectas.
2) Rebota sobre el antepié: el salto sale del tobillo, no de la rodilla.
3) Contacto mínimo y en silencio; el talón no llega a apoyar.

3×15-20 contactos, 1 min de descanso.'),
    ('Line hops', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Contactos rápidos adelante y atrás, controlando el aterrizaje.', '1) Pies juntos detrás de una línea.
2) Salta adelante y atrás sobre la línea sin pisarla, lo más rápido posible.
3) Saltos bajos, sobre el antepié, con el tronco quieto.

3×20 contactos.'),
    ('Saltos laterales', 'a', 'inferior', array['Tobillo y pie', 'Cadera y aductores'], array['Carrera'], 'La misma rigidez de tobillo, en el plano lateral.', '1) Pies juntos al lado de una línea.
2) Salta de lado a lado sobre la línea, rápido y bajo.
3) Rodillas alineadas con los pies: que no se vayan hacia dentro.

3×20 contactos.'),
    ('Saltos en cuadrado', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Coordinación y cambios cortos de dirección a dos pies.', '1) Marca un cuadrado de unos 50 cm con cuatro puntos.
2) Salta de punto a punto en un sentido: delante, lado, atrás, lado.
3) Contacto corto; cambia de sentido en cada serie.

3×4 vueltas (16 contactos).'),
    ('Subida a cajón bajo', 'a', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Aprender a aterrizar: el primer paso antes de cualquier caída.', '1) Frente a un cajón de 20-30 cm, a un paso.
2) Salta con los dos pies y aterriza en silencio, con las rodillas flexionadas.
3) Baja ANDANDO: aquí no hay caída.

3×5.'),
    ('CMJ', 'b', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Potencia vertical con el ciclo lento. Es también el test de salto.', '1) De pie, con las manos en la cadera o libres.
2) Baja rápido hasta un cuarto de sentadilla y salta sin pausa.
3) Aterriza amortiguando, con las rodillas sobre las puntas de los pies.

4×5, descanso completo entre series.'),
    ('Broad jump', 'b', 'inferior', array['Glúteos', 'Cuádriceps', 'Isquiotibiales'], array['Carrera'], 'Potencia horizontal a dos pies, con un aterrizaje estable.', '1) Pies a la anchura de la cadera, brazos atrás.
2) Contramovimiento y salto hacia delante, lo más lejos posible.
3) Aterriza estable y aguanta 2 s: si te tambaleas, no cuenta.

4×4-5.'),
    ('Tuck jump', 'b', 'inferior', array['Cuádriceps', 'Core'], array['Carrera'], 'Salto vertical llevando las rodillas al pecho, con rebote.', '1) Salto vertical ayudándote de los brazos.
2) Lleva las rodillas al pecho arriba del todo.
3) Aterriza y vuelve a saltar enseguida, sin hundirte.

3×6-8.'),
    ('Split jump', 'b', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Salto en zancada, cambiando de pierna en el aire.', '1) En posición de zancada, con la rodilla de atrás cerca del suelo.
2) Salta y cambia de pierna en el aire.
3) Aterriza en zancada controlada, con la rodilla delantera sobre el pie.

3×6 por pierna.'),
    ('Saltos verticales encadenados', 'b', 'inferior', array['Cuádriceps', 'Tobillo y pie'], array['Carrera'], 'Saltos submáximos seguidos: el volumen de la pliometría extensiva.', '1) Saltos verticales seguidos, al 60-70 % de tu máximo.
2) Rebota sin pausa, con el tobillo y la rodilla.
3) Si el contacto se alarga, para la serie.

3×10.'),
    ('Drop jump', 'c', 'inferior', array['Cuádriceps', 'Tobillo y pie'], array['Carrera'], 'Fuerza reactiva (RSI): caer y salir con el mínimo tiempo en el suelo.', '1) Desde un cajón de 20-40 cm, da un paso al vacío: no saltes desde arriba.
2) Al tocar el suelo, sal hacia arriba de inmediato, con el contacto mínimo.
3) Manos en la cadera. Si el contacto se alarga, el cajón es demasiado alto.

3-5×3-5, 2 min de descanso.'),
    ('Saltos sobre vallas bajas', 'c', 'inferior', array['Tobillo y pie', 'Cuádriceps'], array['Carrera'], 'Rebotes reactivos encadenados sobre vallas.', '1) Entre 4 y 6 vallas de 30-50 cm, separadas un paso.
2) Salta a dos pies encadenando: el rebote sale del tobillo.
3) Contacto corto entre vallas y brazos coordinados.

4 pasadas de 5 vallas.'),
    ('Cajón a cajón', 'c', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Caída y salto encadenados entre dos cajones bajos.', '1) Dos cajones de 30 cm, separados un metro.
2) Cae del primero al suelo y salta al segundo sin pausa.
3) Baja andando y repite.

3×4.'),
    ('Power skip', 'd', 'inferior', array['Glúteos', 'Tobillo y pie'], array['Carrera'], 'Skip potente buscando altura y empuje hacia delante.', '1) Skip alternando piernas, empujando fuerte con el pie de apoyo.
2) Rodilla libre alta y el brazo contrario arriba.
3) Busca altura, no velocidad.

4×20 m (unos 10 contactos).'),
    ('Hops laterales a una pierna', 'd', 'inferior', array['Tobillo y pie', 'Cadera y aductores'], array['Carrera'], 'Estabilidad de rodilla y tobillo en saltos laterales a una pierna.', '1) A una pierna, al lado de una línea.
2) Salta de lado a lado sobre la línea.
3) Rodilla alineada con el pie y aterrizaje en silencio.

3×8 por pierna.'),
    ('Pogo a una pierna', 'd', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rigidez de tobillo a una pierna: la base del apoyo en carrera.', '1) A una pierna, con la rodilla casi recta.
2) Rebota sobre el antepié, rápido y bajo.
3) Cadera nivelada: que no caiga hacia el lado libre.

3×10 por pierna.'),
    ('Skater jumps', 'd', 'inferior', array['Glúteos', 'Cadera y aductores'], array['Carrera'], 'Saltos laterales de patinador: potencia lateral a una pierna.', '1) Salta de lado, de una pierna a la otra, lo más lejos posible.
2) Aterriza a una pierna, estable, con la rodilla sobre el pie.
3) Aguanta un instante y salta al otro lado.

3×8 por lado.'),
    ('Triple salto parado', 'd', 'inferior', array['Glúteos', 'Isquiotibiales'], array['Carrera'], 'Tres saltos horizontales encadenados desde parado.', '1) Desde parado, encadena tres saltos: pierna, pierna y caída a dos pies.
2) Cada salto, lo más largo posible sin perder el ritmo.
3) Mide la distancia total para ver tu progreso.

4-5 repeticiones (3 contactos cada una).'),
    ('Bounding máximo', 'e', 'inferior', array['Glúteos', 'Isquiotibiales', 'Tobillo y pie'], array['Carrera'], 'Bounding a máxima distancia: pocas repeticiones, de calidad.', '1) Zancadas saltadas a máxima distancia, con unos metros de entrada.
2) Fase de vuelo larga y aterrizaje activo bajo la cadera.
3) Para cuando la distancia por zancada cae.

4×6 contactos, descanso completo.'),
    ('Salto y aceleración', 'e', 'inferior', array['Glúteos', 'Cuádriceps'], array['Carrera'], 'Broad jump y sprint de 10 m al aterrizar: el salto pasa a la carrera.', '1) Broad jump máximo.
2) Al aterrizar, arranca un sprint de 10 m sin pausa.
3) Vuelve andando; descanso completo.

4-6 repeticiones.'),
    ('Drop jump a una pierna', 'e', 'inferior', array['Tobillo y pie', 'Cuádriceps'], array['Carrera'], 'Fuerza reactiva a una pierna. Solo avanzados y con los tendones sanos.', '1) Desde 15-20 cm, cae a una pierna.
2) Sal hacia arriba con el mínimo contacto.
3) Rodilla alineada. Si no la controlas, vuelve al drop jump a dos pies.

3×3 por pierna.'),
    ('Vallas a una pierna', 'e', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rebotes reactivos sobre vallas bajas, a una pierna.', '1) Entre 3 y 4 vallas de 15-20 cm.
2) Rebota a una pierna sobre ellas, con el contacto corto.
3) Para la serie si pierdes el ritmo o la alineación.

3 pasadas por pierna.'),
    ('Pase de pecho sentado', 'a', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'Empujar rápido aislando el tren superior.', '1) Sentado frente a la pared, a 1-2 m, con un balón medicinal de 2-3 kg.
2) Lanza desde el pecho a máxima velocidad.
3) Recoge y repite. Si la velocidad baja, para.

6×5.'),
    ('Pase de pecho de pie', 'a', 'superior', array['Pectoral', 'Tríceps', 'Hombro'], array['Natación'], 'El mismo empuje, sumando las piernas.', '1) De pie frente a la pared o a un compañero, con un balón de 2-4 kg.
2) Empuja con todo el cuerpo y lanza desde el pecho.
3) Lanzamientos cortos y rápidos.

6×5.'),
    ('Lanzamiento por encima de la cabeza', 'b', 'superior', array['Hombro', 'Espalda alta', 'Tríceps'], array['Natación'], 'El gesto del nadador: extender los brazos por encima de la cabeza a máxima velocidad.', '1) De pie frente a la pared, con un balón de 2-3 kg por encima de la cabeza.
2) Lanza con los brazos extendidos, sin arquear la zona lumbar.
3) Recoge y repite.

6×5.'),
    ('Slam de balón medicinal', 'b', 'superior', array['Espalda alta', 'Core'], array['Natación'], 'Lanzar el balón contra el suelo con todo el cuerpo.', '1) Balón de 4-6 kg, sin rebote, por encima de la cabeza.
2) Lánzalo contra el suelo con fuerza, flexionando la cadera.
3) Recoge y repite sin una pausa larga.

5×5.'),
    ('Flexión explosiva inclinada', 'b', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'La flexión pliométrica, con las manos en un banco.', '1) Manos en un banco o un cajón, con el cuerpo recto.
2) Baja y empuja fuerte hasta que las manos despeguen.
3) Recibe con los codos algo flexionados.

4×5.'),
    ('Flexión pliométrica', 'c', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'Flexión con despegue de las manos: fuerza reactiva de empuje.', '1) En posición de flexión.
2) Empuja fuerte hasta despegar las manos; con palmada, si se domina.
3) Recibe con los codos algo flexionados y encadena.

4×5.'),
    ('Drop push-up', 'c', 'superior', array['Pectoral', 'Tríceps', 'Hombro'], array['Natación'], 'Caer desde dos plataformas a una flexión: el drop jump de los brazos.', '1) Manos sobre dos plataformas bajas, de 10-15 cm.
2) Déjate caer al suelo entre ellas y empuja de inmediato.
3) Vuelve a subir las manos y repite.

3×4.'),
    ('Recepción y pase reactivo', 'c', 'superior', array['Pectoral', 'Hombro'], array['Natación'], 'Recibir y lanzar sin pausa: el ciclo rápido del tren superior.', '1) Frente a la pared, con un balón de 1-2 kg.
2) Al recibirlo, devuelve el pase al instante, sin frenar el balón.
3) Ritmo alto y gesto corto.

4×8.'),
    ('Pase de pecho a una mano', 'd', 'superior', array['Pectoral', 'Hombro'], array['Natación'], 'El empuje de pecho, a un brazo.', '1) De pie frente a la pared, con un balón de 1-2 kg en una mano.
2) Empuja y lanza con un brazo, rotando un poco el tronco.
3) El mismo número con cada brazo.

4×5 por brazo.'),
    ('Lanzamiento por encima de la cabeza a una mano', 'd', 'superior', array['Hombro', 'Espalda alta'], array['Natación'], 'Extender el brazo por encima de la cabeza a una mano: cercano a la brazada.', '1) Un balón ligero, de 1-2 kg, en una mano y por encima de la cabeza.
2) Lanza contra la pared con el brazo extendido.
3) Controla la vuelta del balón; el mismo número con cada brazo.

4×5 por brazo.'),
    ('Lanzamiento hacia atrás por encima de la cabeza', 'e', 'superior', array['Glúteos', 'Hombro', 'Espalda alta'], array['Natación'], 'Cuerpo entero: de la sentadilla a lanzar el balón hacia atrás.', '1) Balón de 3-5 kg entre las piernas, en media sentadilla.
2) Extiende la cadera, las rodillas y los tobillos y lanza el balón hacia atrás por encima de la cabeza.
3) Mide la distancia; descanso completo.

5×3.'),
    ('Lanzamiento vertical desde sentadilla', 'e', 'superior', array['Cuádriceps', 'Hombro'], array['Natación'], 'Cuerpo entero hacia arriba: piernas, tronco y brazos encadenados.', '1) Balón de 3-5 kg al pecho, en media sentadilla.
2) Extiende todo el cuerpo y lanza el balón lo más alto posible.
3) Apártate y déjalo caer; descanso completo.

5×3.'),
    ('Pase rotacional sentado', 'a', 'tronco', array['Core'], array[]::text[], 'Rotación del tronco con un balón ligero, sentado.', '1) Sentado de lado a la pared, con un balón de 2 kg.
2) Gira el tronco y lanza contra la pared.
3) Recoge y repite; luego, el otro lado.

4×6 por lado.'),
    ('Abdominal con lanzamiento', 'b', 'tronco', array['Core'], array[]::text[], 'Abdominal con pase de balón: flexión rápida del tronco.', '1) Tumbado con las rodillas flexionadas y un balón de 2-3 kg por encima de la cabeza.
2) Sube y lanza el balón a un compañero o a la pared.
3) Recibe y baja controlando.

4×6.'),
    ('Lanzamiento rotacional contra la pared', 'c', 'tronco', array['Core', 'Glúteos'], array[]::text[], 'Rotación de pie: de las piernas al tronco y a los brazos.', '1) De pie, de lado a la pared, con un balón de 3-4 kg a la altura de la cadera.
2) Gira desde la cadera y lanza contra la pared.
3) Recoge y repite; luego, el otro lado.

4×5 por lado.'),
    ('Slam rotacional', 'd', 'tronco', array['Core', 'Espalda alta'], array[]::text[], 'Lanzamiento al suelo en diagonal, girando el tronco.', '1) Balón de 4-6 kg por encima de un hombro.
2) Lánzalo al suelo junto al pie contrario, girando el tronco.
3) Alterna los lados.

4×5 por lado.'),
    ('Lanzamiento rotacional con paso', 'e', 'tronco', array['Core', 'Glúteos'], array[]::text[], 'Lanzamiento rotacional máximo, con un paso de impulso.', '1) De lado a la zona de lanzamiento, con un balón de 3-4 kg.
2) Da un paso y lanza girando todo el cuerpo, a máxima velocidad.
3) Mide la distancia; descanso completo.

4×4 por lado.')
  ) as v(nombre, nivel, parte, region, disciplina, descripcion, ejecucion)
 where not exists (
   select 1 from public.ejercicios_biblioteca b
    where lower(b.nombre) = lower(v.nombre) and b.id_entrenador is null and b.id_deportista is null
 );

insert into _informe (linea)
select 'Pliometría por parte: ' || string_agg(parte_pliometria || ' ' || n, ', ' order by parte_pliometria) || ' (inferior 28, superior 12, tronco 5)'
  from (select parte_pliometria, count(*) n from public.ejercicios_biblioteca
         where 'Pliometría' = any (tipo) and id_entrenador is null and id_deportista is null group by 1) x;

insert into _informe (linea)
select 'Inferior por nivel: ' || string_agg(nivel_pliometria || ' ' || n, ', ' order by nivel_pliometria)
  from (select nivel_pliometria, count(*) n from public.ejercicios_biblioteca
         where 'Pliometría' = any (tipo) and parte_pliometria = 'inferior' group by 1) x;

insert into _informe (linea)
select 'Sin nivel, sin parte o fuera del grupo: ' || count(*) || ' (debe ser 0)'
  from public.ejercicios_biblioteca
 where 'Pliometría' = any (tipo) and (nivel_pliometria is null or parte_pliometria is null or grupo_muscular <> 'Pliometría');

insert into _informe (linea)
select 'Bounding conserva sus tipos: ' || array_to_string(tipo, ', ')
  from public.ejercicios_biblioteca where nombre = 'Bounding' and id_entrenador is null and id_deportista is null;

insert into _informe (linea) values
  ('Nivel «f»: ' || pg_temp.como($s$update public.ejercicios_biblioteca set nivel_pliometria = 'f' where nombre = 'Drop jump' and id_entrenador is null$s$) || ' (debe ser 23514)'),
  ('Parte «pierna»: ' || pg_temp.como($s$update public.ejercicios_biblioteca set parte_pliometria = 'pierna' where nombre = 'Drop jump' and id_entrenador is null$s$) || ' (debe ser 23514)'),
  ('Control «altura»: ' || pg_temp.como($s$insert into public.ejercicios (id_tarea, nombre, control_tipo, control_valor) select id, 'ensayo', 'altura', '30' from public.tarea limit 1$s$) || ' (debe ser ENTRA)'),
  ('Control «peso»: ' || pg_temp.como($s$insert into public.ejercicios (id_tarea, nombre, control_tipo, control_valor) select id, 'ensayo', 'peso', '30' from public.tarea limit 1$s$) || ' (debe ser 23514)');

insert into _informe (linea)
select 'Un entrenador normal ve: ' || pg_temp.ve(p.id, $s$select count(*)::int from public.ejercicios_biblioteca where 'Pliometría' = any (tipo)$s$)
       || ' de pliometría (deben ser 45)'
  from public.perfiles p
 where p.rol = 'entrenador' and p.id not in (select id_perfil from public.plataforma_admin)
 limit 1;

insert into public.ejercicios_biblioteca
  (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, lesion, momento, nivel_pliometria, parte_pliometria)
select v.nombre, 'Pliometría', v.descripcion, v.ejecucion, array['Pliometría'], v.region, v.disciplina,
       '{}'::text[], '{}'::text[], v.nivel, v.parte
  from (values
    ('Pogo jumps', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rigidez de tobillo y contacto corto: la base de toda la pliometría.', '1) De pie, pies a la anchura de la cadera y rodillas casi rectas.
2) Rebota sobre el antepié: el salto sale del tobillo, no de la rodilla.
3) Contacto mínimo y en silencio; el talón no llega a apoyar.

3×15-20 contactos, 1 min de descanso.'),
    ('Line hops', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Contactos rápidos adelante y atrás, controlando el aterrizaje.', '1) Pies juntos detrás de una línea.
2) Salta adelante y atrás sobre la línea sin pisarla, lo más rápido posible.
3) Saltos bajos, sobre el antepié, con el tronco quieto.

3×20 contactos.'),
    ('Saltos laterales', 'a', 'inferior', array['Tobillo y pie', 'Cadera y aductores'], array['Carrera'], 'La misma rigidez de tobillo, en el plano lateral.', '1) Pies juntos al lado de una línea.
2) Salta de lado a lado sobre la línea, rápido y bajo.
3) Rodillas alineadas con los pies: que no se vayan hacia dentro.

3×20 contactos.'),
    ('Saltos en cuadrado', 'a', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Coordinación y cambios cortos de dirección a dos pies.', '1) Marca un cuadrado de unos 50 cm con cuatro puntos.
2) Salta de punto a punto en un sentido: delante, lado, atrás, lado.
3) Contacto corto; cambia de sentido en cada serie.

3×4 vueltas (16 contactos).'),
    ('Subida a cajón bajo', 'a', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Aprender a aterrizar: el primer paso antes de cualquier caída.', '1) Frente a un cajón de 20-30 cm, a un paso.
2) Salta con los dos pies y aterriza en silencio, con las rodillas flexionadas.
3) Baja ANDANDO: aquí no hay caída.

3×5.'),
    ('CMJ', 'b', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Potencia vertical con el ciclo lento. Es también el test de salto.', '1) De pie, con las manos en la cadera o libres.
2) Baja rápido hasta un cuarto de sentadilla y salta sin pausa.
3) Aterriza amortiguando, con las rodillas sobre las puntas de los pies.

4×5, descanso completo entre series.'),
    ('Broad jump', 'b', 'inferior', array['Glúteos', 'Cuádriceps', 'Isquiotibiales'], array['Carrera'], 'Potencia horizontal a dos pies, con un aterrizaje estable.', '1) Pies a la anchura de la cadera, brazos atrás.
2) Contramovimiento y salto hacia delante, lo más lejos posible.
3) Aterriza estable y aguanta 2 s: si te tambaleas, no cuenta.

4×4-5.'),
    ('Tuck jump', 'b', 'inferior', array['Cuádriceps', 'Core'], array['Carrera'], 'Salto vertical llevando las rodillas al pecho, con rebote.', '1) Salto vertical ayudándote de los brazos.
2) Lleva las rodillas al pecho arriba del todo.
3) Aterriza y vuelve a saltar enseguida, sin hundirte.

3×6-8.'),
    ('Split jump', 'b', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Salto en zancada, cambiando de pierna en el aire.', '1) En posición de zancada, con la rodilla de atrás cerca del suelo.
2) Salta y cambia de pierna en el aire.
3) Aterriza en zancada controlada, con la rodilla delantera sobre el pie.

3×6 por pierna.'),
    ('Saltos verticales encadenados', 'b', 'inferior', array['Cuádriceps', 'Tobillo y pie'], array['Carrera'], 'Saltos submáximos seguidos: el volumen de la pliometría extensiva.', '1) Saltos verticales seguidos, al 60-70 % de tu máximo.
2) Rebota sin pausa, con el tobillo y la rodilla.
3) Si el contacto se alarga, para la serie.

3×10.'),
    ('Drop jump', 'c', 'inferior', array['Cuádriceps', 'Tobillo y pie'], array['Carrera'], 'Fuerza reactiva (RSI): caer y salir con el mínimo tiempo en el suelo.', '1) Desde un cajón de 20-40 cm, da un paso al vacío: no saltes desde arriba.
2) Al tocar el suelo, sal hacia arriba de inmediato, con el contacto mínimo.
3) Manos en la cadera. Si el contacto se alarga, el cajón es demasiado alto.

3-5×3-5, 2 min de descanso.'),
    ('Saltos sobre vallas bajas', 'c', 'inferior', array['Tobillo y pie', 'Cuádriceps'], array['Carrera'], 'Rebotes reactivos encadenados sobre vallas.', '1) Entre 4 y 6 vallas de 30-50 cm, separadas un paso.
2) Salta a dos pies encadenando: el rebote sale del tobillo.
3) Contacto corto entre vallas y brazos coordinados.

4 pasadas de 5 vallas.'),
    ('Cajón a cajón', 'c', 'inferior', array['Cuádriceps', 'Glúteos'], array['Carrera'], 'Caída y salto encadenados entre dos cajones bajos.', '1) Dos cajones de 30 cm, separados un metro.
2) Cae del primero al suelo y salta al segundo sin pausa.
3) Baja andando y repite.

3×4.'),
    ('Power skip', 'd', 'inferior', array['Glúteos', 'Tobillo y pie'], array['Carrera'], 'Skip potente buscando altura y empuje hacia delante.', '1) Skip alternando piernas, empujando fuerte con el pie de apoyo.
2) Rodilla libre alta y el brazo contrario arriba.
3) Busca altura, no velocidad.

4×20 m (unos 10 contactos).'),
    ('Hops laterales a una pierna', 'd', 'inferior', array['Tobillo y pie', 'Cadera y aductores'], array['Carrera'], 'Estabilidad de rodilla y tobillo en saltos laterales a una pierna.', '1) A una pierna, al lado de una línea.
2) Salta de lado a lado sobre la línea.
3) Rodilla alineada con el pie y aterrizaje en silencio.

3×8 por pierna.'),
    ('Pogo a una pierna', 'd', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rigidez de tobillo a una pierna: la base del apoyo en carrera.', '1) A una pierna, con la rodilla casi recta.
2) Rebota sobre el antepié, rápido y bajo.
3) Cadera nivelada: que no caiga hacia el lado libre.

3×10 por pierna.'),
    ('Skater jumps', 'd', 'inferior', array['Glúteos', 'Cadera y aductores'], array['Carrera'], 'Saltos laterales de patinador: potencia lateral a una pierna.', '1) Salta de lado, de una pierna a la otra, lo más lejos posible.
2) Aterriza a una pierna, estable, con la rodilla sobre el pie.
3) Aguanta un instante y salta al otro lado.

3×8 por lado.'),
    ('Triple salto parado', 'd', 'inferior', array['Glúteos', 'Isquiotibiales'], array['Carrera'], 'Tres saltos horizontales encadenados desde parado.', '1) Desde parado, encadena tres saltos: pierna, pierna y caída a dos pies.
2) Cada salto, lo más largo posible sin perder el ritmo.
3) Mide la distancia total para ver tu progreso.

4-5 repeticiones (3 contactos cada una).'),
    ('Bounding máximo', 'e', 'inferior', array['Glúteos', 'Isquiotibiales', 'Tobillo y pie'], array['Carrera'], 'Bounding a máxima distancia: pocas repeticiones, de calidad.', '1) Zancadas saltadas a máxima distancia, con unos metros de entrada.
2) Fase de vuelo larga y aterrizaje activo bajo la cadera.
3) Para cuando la distancia por zancada cae.

4×6 contactos, descanso completo.'),
    ('Salto y aceleración', 'e', 'inferior', array['Glúteos', 'Cuádriceps'], array['Carrera'], 'Broad jump y sprint de 10 m al aterrizar: el salto pasa a la carrera.', '1) Broad jump máximo.
2) Al aterrizar, arranca un sprint de 10 m sin pausa.
3) Vuelve andando; descanso completo.

4-6 repeticiones.'),
    ('Drop jump a una pierna', 'e', 'inferior', array['Tobillo y pie', 'Cuádriceps'], array['Carrera'], 'Fuerza reactiva a una pierna. Solo avanzados y con los tendones sanos.', '1) Desde 15-20 cm, cae a una pierna.
2) Sal hacia arriba con el mínimo contacto.
3) Rodilla alineada. Si no la controlas, vuelve al drop jump a dos pies.

3×3 por pierna.'),
    ('Vallas a una pierna', 'e', 'inferior', array['Tobillo y pie'], array['Carrera'], 'Rebotes reactivos sobre vallas bajas, a una pierna.', '1) Entre 3 y 4 vallas de 15-20 cm.
2) Rebota a una pierna sobre ellas, con el contacto corto.
3) Para la serie si pierdes el ritmo o la alineación.

3 pasadas por pierna.'),
    ('Pase de pecho sentado', 'a', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'Empujar rápido aislando el tren superior.', '1) Sentado frente a la pared, a 1-2 m, con un balón medicinal de 2-3 kg.
2) Lanza desde el pecho a máxima velocidad.
3) Recoge y repite. Si la velocidad baja, para.

6×5.'),
    ('Pase de pecho de pie', 'a', 'superior', array['Pectoral', 'Tríceps', 'Hombro'], array['Natación'], 'El mismo empuje, sumando las piernas.', '1) De pie frente a la pared o a un compañero, con un balón de 2-4 kg.
2) Empuja con todo el cuerpo y lanza desde el pecho.
3) Lanzamientos cortos y rápidos.

6×5.'),
    ('Lanzamiento por encima de la cabeza', 'b', 'superior', array['Hombro', 'Espalda alta', 'Tríceps'], array['Natación'], 'El gesto del nadador: extender los brazos por encima de la cabeza a máxima velocidad.', '1) De pie frente a la pared, con un balón de 2-3 kg por encima de la cabeza.
2) Lanza con los brazos extendidos, sin arquear la zona lumbar.
3) Recoge y repite.

6×5.'),
    ('Slam de balón medicinal', 'b', 'superior', array['Espalda alta', 'Core'], array['Natación'], 'Lanzar el balón contra el suelo con todo el cuerpo.', '1) Balón de 4-6 kg, sin rebote, por encima de la cabeza.
2) Lánzalo contra el suelo con fuerza, flexionando la cadera.
3) Recoge y repite sin una pausa larga.

5×5.'),
    ('Flexión explosiva inclinada', 'b', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'La flexión pliométrica, con las manos en un banco.', '1) Manos en un banco o un cajón, con el cuerpo recto.
2) Baja y empuja fuerte hasta que las manos despeguen.
3) Recibe con los codos algo flexionados.

4×5.'),
    ('Flexión pliométrica', 'c', 'superior', array['Pectoral', 'Tríceps'], array['Natación'], 'Flexión con despegue de las manos: fuerza reactiva de empuje.', '1) En posición de flexión.
2) Empuja fuerte hasta despegar las manos; con palmada, si se domina.
3) Recibe con los codos algo flexionados y encadena.

4×5.'),
    ('Drop push-up', 'c', 'superior', array['Pectoral', 'Tríceps', 'Hombro'], array['Natación'], 'Caer desde dos plataformas a una flexión: el drop jump de los brazos.', '1) Manos sobre dos plataformas bajas, de 10-15 cm.
2) Déjate caer al suelo entre ellas y empuja de inmediato.
3) Vuelve a subir las manos y repite.

3×4.'),
    ('Recepción y pase reactivo', 'c', 'superior', array['Pectoral', 'Hombro'], array['Natación'], 'Recibir y lanzar sin pausa: el ciclo rápido del tren superior.', '1) Frente a la pared, con un balón de 1-2 kg.
2) Al recibirlo, devuelve el pase al instante, sin frenar el balón.
3) Ritmo alto y gesto corto.

4×8.'),
    ('Pase de pecho a una mano', 'd', 'superior', array['Pectoral', 'Hombro'], array['Natación'], 'El empuje de pecho, a un brazo.', '1) De pie frente a la pared, con un balón de 1-2 kg en una mano.
2) Empuja y lanza con un brazo, rotando un poco el tronco.
3) El mismo número con cada brazo.

4×5 por brazo.'),
    ('Lanzamiento por encima de la cabeza a una mano', 'd', 'superior', array['Hombro', 'Espalda alta'], array['Natación'], 'Extender el brazo por encima de la cabeza a una mano: cercano a la brazada.', '1) Un balón ligero, de 1-2 kg, en una mano y por encima de la cabeza.
2) Lanza contra la pared con el brazo extendido.
3) Controla la vuelta del balón; el mismo número con cada brazo.

4×5 por brazo.'),
    ('Lanzamiento hacia atrás por encima de la cabeza', 'e', 'superior', array['Glúteos', 'Hombro', 'Espalda alta'], array['Natación'], 'Cuerpo entero: de la sentadilla a lanzar el balón hacia atrás.', '1) Balón de 3-5 kg entre las piernas, en media sentadilla.
2) Extiende la cadera, las rodillas y los tobillos y lanza el balón hacia atrás por encima de la cabeza.
3) Mide la distancia; descanso completo.

5×3.'),
    ('Lanzamiento vertical desde sentadilla', 'e', 'superior', array['Cuádriceps', 'Hombro'], array['Natación'], 'Cuerpo entero hacia arriba: piernas, tronco y brazos encadenados.', '1) Balón de 3-5 kg al pecho, en media sentadilla.
2) Extiende todo el cuerpo y lanza el balón lo más alto posible.
3) Apártate y déjalo caer; descanso completo.

5×3.'),
    ('Pase rotacional sentado', 'a', 'tronco', array['Core'], array[]::text[], 'Rotación del tronco con un balón ligero, sentado.', '1) Sentado de lado a la pared, con un balón de 2 kg.
2) Gira el tronco y lanza contra la pared.
3) Recoge y repite; luego, el otro lado.

4×6 por lado.'),
    ('Abdominal con lanzamiento', 'b', 'tronco', array['Core'], array[]::text[], 'Abdominal con pase de balón: flexión rápida del tronco.', '1) Tumbado con las rodillas flexionadas y un balón de 2-3 kg por encima de la cabeza.
2) Sube y lanza el balón a un compañero o a la pared.
3) Recibe y baja controlando.

4×6.'),
    ('Lanzamiento rotacional contra la pared', 'c', 'tronco', array['Core', 'Glúteos'], array[]::text[], 'Rotación de pie: de las piernas al tronco y a los brazos.', '1) De pie, de lado a la pared, con un balón de 3-4 kg a la altura de la cadera.
2) Gira desde la cadera y lanza contra la pared.
3) Recoge y repite; luego, el otro lado.

4×5 por lado.'),
    ('Slam rotacional', 'd', 'tronco', array['Core', 'Espalda alta'], array[]::text[], 'Lanzamiento al suelo en diagonal, girando el tronco.', '1) Balón de 4-6 kg por encima de un hombro.
2) Lánzalo al suelo junto al pie contrario, girando el tronco.
3) Alterna los lados.

4×5 por lado.'),
    ('Lanzamiento rotacional con paso', 'e', 'tronco', array['Core', 'Glúteos'], array[]::text[], 'Lanzamiento rotacional máximo, con un paso de impulso.', '1) De lado a la zona de lanzamiento, con un balón de 3-4 kg.
2) Da un paso y lanza girando todo el cuerpo, a máxima velocidad.
3) Mide la distancia; descanso completo.

4×4 por lado.')
  ) as v(nombre, nivel, parte, region, disciplina, descripcion, ejecucion)
 where not exists (
   select 1 from public.ejercicios_biblioteca b
    where lower(b.nombre) = lower(v.nombre) and b.id_entrenador is null and b.id_deportista is null
 );

insert into _informe (linea)
select 'Pasada dos veces: ' || count(*) || ' de pliometría (siguen siendo 45)'
  from public.ejercicios_biblioteca where 'Pliometría' = any (tipo) and id_entrenador is null and id_deportista is null;

update public.ejercicios_biblioteca b
   set tipo = case when 'Pliometría' = any (coalesce(b.tipo, '{}')) then b.tipo else coalesce(b.tipo, '{}') || array['Pliometría'] end,
       grupo_muscular = 'Pliometría',
       nivel_pliometria = v.nivel,
       parte_pliometria = 'inferior'
  from (values
    ('Salto de cuerda', 'a'),
    ('Jump squat', 'b'),
    ('Box jump', 'b'),
    ('Depth jump', 'c'),
    ('Bounding', 'd'),
    ('Single-leg hop horizontal', 'd')
  ) as v(nombre, nivel)
 where b.nombre = v.nombre and b.id_entrenador is null and b.id_deportista is null;

insert into _informe (linea)
select 'Tipos repetidos tras marcar dos veces: ' || count(*) || ' (debe ser 0)'
  from public.ejercicios_biblioteca
 where array_length(tipo, 1) <> (select count(distinct t) from unnest(tipo) t);

do $f$ declare _r text; begin
  select string_agg(linea, E'\n' order by orden) into _r from _informe;
  raise exception E'INFORME DEL ENSAYO (todo deshecho):\n%', _r;
end $f$;
