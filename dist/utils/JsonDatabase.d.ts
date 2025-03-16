export declare class JsonDatabase {
    private dbPath;
    private data;
    constructor(filename?: string);
    private load;
    private save;
    find(collection: string, query?: Record<string, any>): Promise<any>;
    findOne(collection: string, query: Record<string, any>): Promise<any>;
    insert(collection: string, document: Record<string, any>): Promise<Record<string, any>>;
    update(collection: string, query: Record<string, any>, update: Record<string, any>): Promise<any>;
    delete(collection: string, query: Record<string, any>): Promise<boolean>;
}
