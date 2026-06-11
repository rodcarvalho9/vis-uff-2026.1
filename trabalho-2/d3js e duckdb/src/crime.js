
import { loadDb } from './config';

export class Crime {
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        this.table = 'crime';
    }

    async loadCrime(csvUrl = 'BaseMunicipioMensal.csv') {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const fileKey = 'crime_csv';
        const res = await fetch(csvUrl);

        if (!res.ok) {
            throw new Error(`Failed to load CSV: ${csvUrl}`);
        }

        const csvBuffer = await res.arrayBuffer();
        const csvText = new TextDecoder('windows-1252').decode(csvBuffer);
        const csvUtf8 = new TextEncoder().encode(csvText);

        await this.db.registerFileBuffer(fileKey, csvUtf8);

        await this.conn.query(`
            CREATE OR REPLACE TABLE ${this.table} AS
                SELECT * 
                FROM read_csv_auto('${fileKey}', delim = ';', header = true);
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
