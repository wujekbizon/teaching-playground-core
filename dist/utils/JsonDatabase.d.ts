export declare class JsonDatabase {
    private dbPath;
    private data;
    private isServer;
    private apiBaseUrl;
    private isSyncingToFile;
    constructor(filename?: string);
    static getInstance(filename?: string): JsonDatabase;
    private getInitialData;
    private ensureDataDirectory;
    private syncToFile;
    private load;
    private save;
    find(collection: string, query?: Record<string, any>): Promise<any>;
    findOne(collection: string, query: Record<string, any>): Promise<any>;
    insert(collection: string, document: Record<string, any>): Promise<Record<string, any>>;
    update(collection: string, query: Record<string, any>, update: Record<string, any>): Promise<any>;
    delete(collection: string, query: Record<string, any>): Promise<boolean>;
}
