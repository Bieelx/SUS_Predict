// Validação PostgreSQL isolada via PGlite. Não conecta ao Supabase.
// node scripts/check_local_records_migration.mjs /caminho/node_modules/@electric-sql/pglite/dist/index.js
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE public.usuarios_acesso(usuario text PRIMARY KEY, perfil text, municipios jsonb, ativo boolean);`);
const migration = await readFile(new URL('../supabase/migrations/20260912130745_clara_registros_locais.sql', import.meta.url), 'utf8');
await db.exec(migration);
const tables = await db.query(`SELECT count(*)::int AS count FROM pg_class WHERE relname LIKE 'local_%' AND relkind='r' AND relrowsecurity`);
assert.equal(tables.rows[0].count, 7);
const catalog = await db.query('SELECT count(*)::int AS count FROM local_indicadores');
assert.equal(catalog.rows[0].count, 3);
const grants = await db.query(`SELECT has_table_privilege('anon','public.local_relatos','SELECT') AS anon,
 has_table_privilege('authenticated','public.local_registro_versoes','INSERT') AS authenticated`);
assert.equal(grants.rows[0].anon, false);
assert.equal(grants.rows[0].authenticated, false);
await db.exec(`INSERT INTO usuarios_acesso VALUES ('test','gestor','["355030"]',true);
 INSERT INTO local_unidades_saude VALUES ('10000000-0000-4000-8000-000000000001',NULL,'UBS','UBS','355030','SP',true,now(),now());
 INSERT INTO local_relatos(id,unidade_id,usuario,canal,external_event_id,tipo_entrada,status,request_hash,recebido_em,atualizado_em)
 VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','test','web','event','texto','aguardando_confirmacao','hash',now(),now());
 INSERT INTO local_registros VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','test',now());
 INSERT INTO local_registro_versoes(id,registro_id,numero_versao,dimensoes,status,vigente,criada_por,motivo_alteracao,criada_em,operacao_id,request_hash,pendencias,versao_definicao)
 VALUES ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'{}','rascunho',true,'test','',now(),'create','hash','["valor"]',1);`);
await assert.rejects(db.exec("UPDATE local_registro_versoes SET valor=100"), /imutável/);
await assert.rejects(db.exec('DELETE FROM local_registro_versoes'), /apagadas/);
await db.exec('UPDATE local_registro_versoes SET vigente=false');
const pending = await db.query('SELECT count(*)::int AS count FROM local_pendencias_confirmacao');
assert.equal(pending.rows[0].count, 1);
await db.exec('BEGIN; UPDATE local_registro_versoes SET vigente=true; ROLLBACK;');
const version = await db.query('SELECT vigente FROM local_registro_versoes');
assert.equal(version.rows[0].vigente, false);
await db.close();
console.log('PostgreSQL isolado: migration, seed, RLS, grants, views, imutabilidade e rollback verificados.');
