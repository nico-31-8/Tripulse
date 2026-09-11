// Qué parte de las visitas mide Sentry (trazas de rendimiento), para los tres
// sitios donde arranca: navegador, servidor y edge. Los ERRORES no pasan por
// aquí: se mandan todos, siempre.
//
// Estuvo en 1.0 en los tres, escrito tres veces: cada cambio de pantalla
// mandaba una medida (42 en un paseo de pocos minutos). Con usuarios de verdad
// eso se come la cuota de Sentry sin enseñar nada nuevo: la velocidad se ve
// igual midiendo una visita de cada diez.
//
// En desarrollo, cero: la velocidad del servidor de pruebas no es la de nadie.
export const MUESTREO_TRAZAS = process.env.NODE_ENV === 'production' ? 0.1 : 0
