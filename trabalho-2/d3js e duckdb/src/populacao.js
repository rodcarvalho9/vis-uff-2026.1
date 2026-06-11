import { loadDb } from './config';

export class Populacao {
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        this.table = 'populacao_rj';
    }

    async loadPopulacao(csvUrl = 'populacao_rj.csv') {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const fileKey = 'populacao_csv';
        const res = await fetch(csvUrl);

        if (!res.ok) {
            throw new Error(`Failed to load CSV: ${csvUrl}`);
        }

        const csvBuffer = await res.arrayBuffer();
        const delimiter = ',';

        await this.db.registerFileBuffer(
            fileKey, 
            new Uint8Array(csvBuffer));

        await this.conn.query(`
            CREATE OR REPLACE TABLE ${this.table} AS
                SELECT *
                FROM read_csv_auto('${fileKey}', delim = '${delimiter}', header = true);
        `);
    }

    async query(sql) {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        let result = await this.conn.query(sql);
        return result.toArray().map(row => row.toJSON());
    }

    async test(limit = 10) {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const sql = `
                SELECT *
                FROM ${this.table}
                LIMIT ${limit}
            `;

        return await this.query(sql);
    }
}
