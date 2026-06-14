// ════════════════════════════════════════════════════════════════════════
// config.js — Inicialização do DuckDB-WASM (camada de dados)
//
// DuckDB roda inteiramente no navegador, compilado para WebAssembly. Aqui
// selecionamos e instanciamos o "bundle" adequado e expomos loadDb(), usada
// pela classe Crime para abrir conexões e consultar os CSVs via SQL.
// ════════════════════════════════════════════════════════════════════════
import * as duckdb from '@duckdb/duckdb-wasm';
// Vite resolve estes imports para URLs dos artefatos .wasm e dos workers.
// Há dois bundles: 'mvp' (compatível com qualquer navegador) e 'eh'
// (exception handling — mais rápido, exige suporte do navegador).
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

// Cria e instancia uma base DuckDB-WASM pronta para uso. Retorna a instância
// AsyncDuckDB; quem chama é responsável por abrir a conexão (db.connect()).
export async function loadDb() {
  // selectBundle inspeciona o navegador e escolhe 'eh' se houver suporte,
  // caindo para 'mvp' caso contrário.
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

  // O banco roda numa Web Worker para não bloquear a thread principal (UI).
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  // Carrega o módulo WASM dentro da worker; só depois disso o banco está pronto.
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}