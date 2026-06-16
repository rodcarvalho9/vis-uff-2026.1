// config.js
// Sobe o DuckDB compilado pra WebAssembly (roda no próprio navegador).
// Exporta loadDb(), que a database.js usa pra abrir a conexão e rodar SQL.

import * as duckdb from '@duckdb/duckdb-wasm';
// o Vite transforma esses imports nas URLs dos .wasm e dos workers.
// tem dois bundles: mvp (funciona em tudo) e eh (mais rápido, se o navegador suportar).
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

// devolve uma instância do DuckDB pronta pra usar (quem chama abre a conexão)
export async function loadDb() {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES); // escolhe mvp ou eh

  // roda numa Web Worker pra não travar a interface
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}