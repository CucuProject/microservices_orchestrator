interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
}
export declare class MicroservicesOrchestratorService {
    constructor();
    areDependenciesReady(serviceName: string, options?: ConfigOptions): Promise<void>;
    notifyServiceReady(serviceName: string, options?: ConfigOptions): void;
}
export {};
