import { loadDb } from './config';

// Database centraliza as duas tabelas em uma única instância de DuckDB,
// evitando o overhead de instanciar dois workers WASM separados.
export class Database {
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();
    }

    // Carrega o CSV de dados de segurança do RJ
    async loadCrime(csvUrl = 'BaseMunicipioMensal_2014_2025.csv') {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${csvUrl}`);
        const buf = await res.arrayBuffer();
        await this.db.registerFileBuffer('crime_csv', new Uint8Array(buf));
        await this.conn.query(`
            CREATE OR REPLACE TABLE crime_rj AS
                SELECT * FROM read_csv_auto('crime_csv', delim=',', header=true);
        `);
    }

    // Carrega o CSV de tipos de crimes
    // Usado para agregar os 33 tipos de crime na visualização em 6 grandes tipos
    async loadTipoCrime(csvUrl = 'crimes_tipos.csv') {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${csvUrl}`);
        const buf = await res.arrayBuffer();
        await this.db.registerFileBuffer('tipo_crime_csv', new Uint8Array(buf));
        await this.conn.query(`
            CREATE OR REPLACE TABLE tipo_crime AS
                SELECT * FROM read_csv_auto('tipo_crime_csv', delim=',', header=true);
        `);
    }

    // Carrega o CSV de dados populacionais anuais por município
    // Usado para normalizar crimes por 10 mil habitantes
    async loadPopulacao(csvUrl = 'populacao_rj.csv') {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${csvUrl}`);
        const buf = await res.arrayBuffer();
        await this.db.registerFileBuffer('pop_csv', new Uint8Array(buf));
        await this.conn.query(`
            CREATE OR REPLACE TABLE populacao_rj AS
                SELECT * FROM read_csv_auto('pop_csv', delim=',', header=true);
        `);
    }

    async query(sql) {
        if (!this.conn) throw new Error('DB não inicializado. Chame init() primeiro.');
        const result = await this.conn.query(sql);
        return result.toArray().map(row => row.toJSON());
    }
}
