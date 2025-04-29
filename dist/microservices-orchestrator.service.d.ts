interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
    persistentCheck?: boolean;
    useTls?: boolean;
    redisTlsCertPath?: string;
    redisTlsKeyPath?: string;
    redisTlsCaPath?: string;
}
export declare class MicroservicesOrchestratorService {
    private static readonly READY_KEY_PREFIX;
    private static readonly READY_CHANNEL;
    constructor();
    areDependenciesReady(serviceName: string, options?: ConfigOptions): Promise<void>;
    notifyServiceReady(serviceName: string, options?: ConfigOptions): Promise<void>;
    areServicesReady(serviceNames: string[], options?: ConfigOptions): Promise<Map<string, boolean>>;
    resetServiceStatus(serviceName: string, options?: ConfigOptions): Promise<void>;
    private createRedisClient;
    private checkRedisConnection;
    private log;
}
export {};
